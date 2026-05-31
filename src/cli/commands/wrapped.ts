import { spawn } from "node:child_process";
import { executeLockCommand, type LockCommandOutput } from "../../locks/commands";

interface WrappedBase {
  paths: string[];
  globs: string[];
  reason: string;
  ttlMs: number | null;
  agentId: string | null;
}

export type WrappedCommand =
  | ({ name: "run"; argv: string[] } & WrappedBase)
  | ({ name: "edit"; argv: string[] } & WrappedBase)
  | ({ name: "commit"; message: string | null; keep: boolean } & WrappedBase);

/**
 * Intent verbs that bundle the safe lock/act/release ordering into one command.
 * The lock work reuses executeLockCommand; the wrapped child runs OUTSIDE any
 * registry mutex (three short windows: acquire, run, release) so it never
 * freezes the registry or trips the stale-mutex reclaim.
 */
export async function runWrappedCommand(
  command: WrappedCommand,
  cwd: string = process.cwd(),
): Promise<void> {
  switch (command.name) {
    case "run":
      await runScoped(command, true, cwd);
      return;
    case "edit":
      await runScoped(command, false, cwd);
      return;
    case "commit":
      await runCommit(command, cwd);
      return;
  }
}

async function runScoped(
  command: Extract<WrappedCommand, { name: "run" | "edit" }>,
  release: boolean,
  cwd: string,
): Promise<void> {
  if (command.argv.length === 0) {
    console.error(`lockpick error: ${command.name} requires a command after --`);
    process.exitCode = 2;
    return;
  }
  const acquired = await acquire(command, cwd);
  if (acquired.exitCode !== 0) {
    emit(acquired);
    return;
  }
  const lockId = acquired.text.trim();
  let childCode = 0;
  try {
    childCode = await spawnChild(command.argv, cwd);
  } finally {
    if (release) {
      await executeLockCommand(
        { name: "release", lockIds: [lockId], agentId: command.agentId, json: false, idOnly: true },
        cwd,
      );
    } else {
      // edit keeps the lock for follow-up turns; surface the id to refresh/release later.
      console.log(lockId);
    }
  }
  if (childCode !== 0) process.exitCode = childCode;
}

async function runCommit(
  command: Extract<WrappedCommand, { name: "commit" }>,
  cwd: string,
): Promise<void> {
  const acquired = await acquire(command, cwd);
  if (acquired.exitCode !== 0) {
    emit(acquired);
    return;
  }
  const lockId = acquired.text.trim();

  const gitBegin = await executeLockCommand(
    {
      name: "git-begin",
      reason: command.reason,
      ttlMs: command.ttlMs,
      agentId: command.agentId,
      refreshLockIds: [lockId],
      json: false,
      idOnly: true,
    },
    cwd,
  );
  if (gitBegin.exitCode !== 0) {
    emit(gitBegin);
    await executeLockCommand(
      { name: "release", lockIds: [lockId], agentId: command.agentId, json: false, idOnly: true },
      cwd,
    );
    return;
  }
  const gitLockId = gitBegin.text.trim();

  let gitCode = 0;
  try {
    gitCode = await spawnChild(["git", "add", "--", ...command.paths], cwd);
    if (gitCode === 0) {
      const args = ["git", "commit"];
      if (command.message !== null) args.push("-m", command.message);
      args.push("--", ...command.paths);
      gitCode = await spawnChild(args, cwd);
    }
  } finally {
    await executeLockCommand(
      {
        name: "git-end",
        lockIds: [gitLockId],
        releaseLockIds: command.keep ? [] : [lockId],
        agentId: command.agentId,
        json: false,
        idOnly: true,
      },
      cwd,
    );
  }
  if (gitCode !== 0) process.exitCode = gitCode;
}

function acquire(command: WrappedCommand, cwd: string): Promise<LockCommandOutput> {
  return executeLockCommand(
    {
      name: "acquire",
      paths: command.paths,
      globs: command.globs,
      reason: command.reason,
      ttlMs: command.ttlMs,
      agentId: command.agentId,
      json: false,
      idOnly: true,
    },
    cwd,
  );
}

function emit(output: LockCommandOutput): void {
  if (output.text) console.log(output.text);
  if (output.stderr) console.error(output.stderr);
  if (output.exitCode !== 0) process.exitCode = output.exitCode;
}

function spawnChild(argv: string[], cwd: string): Promise<number> {
  const [executable, ...args] = argv;
  if (!executable) return Promise.resolve(2);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", cwd });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 128 : (code ?? 0)));
  });
}
