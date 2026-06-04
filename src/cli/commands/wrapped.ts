import { type ChildProcess, spawn } from "node:child_process";
import { executeLockCommand, type LockCommandOutput, verifyGitFence } from "../../locks/commands";

// F4: how often the foreground keep-alive re-verifies + re-extends the @git/index fence
// while `git add`/`git commit` run. Well under the default lease; sub-interval TTLs stay advisory.
const FENCE_KEEPALIVE_INTERVAL_MS = 5_000;

interface WrappedBase {
  resources: string[];
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
    console.error(`agentlocks error: ${command.name} requires a command after --`);
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
  // `git begin --id-only` prints exactly two lines: the @git/index lock id, then the fence token.
  const beginLines = gitBegin.text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const gitLockId = beginLines[0] ?? "";
  const gitToken = beginLines[1] ?? "";

  // F4: foreground keep-alive — while the index-mutating children run OUTSIDE the registry
  // mutex, periodically re-verify + re-extend the @git/index lease. On token loss (the lease
  // was reclaimed/re-minted), kill the active child and abort exit 3.
  let fenceLost: string | null = null;
  let activeChild: ChildProcess | null = null;
  let checking = false;
  const keepAlive = async (): Promise<void> => {
    if (checking || fenceLost || !gitToken) return;
    checking = true;
    try {
      const check = await verifyGitFence(
        gitLockId,
        gitToken,
        command.agentId,
        { refresh: true },
        cwd,
      );
      if (check.exitCode !== 0) {
        fenceLost = check.stderr ?? "@git/index fence lost";
        activeChild?.kill();
      }
    } finally {
      checking = false;
    }
  };
  const timer = gitToken
    ? setInterval(() => {
        void keepAlive();
      }, FENCE_KEEPALIVE_INTERVAL_MS)
    : null;

  let gitCode = 0;
  try {
    if (gitToken) {
      // Verify + refresh once before mutating the index (closes the pre-spawn window).
      const pre = await verifyGitFence(
        gitLockId,
        gitToken,
        command.agentId,
        { refresh: true },
        cwd,
      );
      if (pre.exitCode !== 0) fenceLost = pre.stderr ?? "@git/index fence lost";
    }
    if (!fenceLost) {
      gitCode = await spawnChild(["git", "add", "--", ...command.resources], cwd, (child) => {
        activeChild = child;
      });
      if (gitCode === 0 && !fenceLost) {
        const args = ["git", "commit"];
        if (command.message !== null) args.push("-m", command.message);
        args.push("--", ...command.resources);
        gitCode = await spawnChild(args, cwd, (child) => {
          activeChild = child;
        });
      }
    }
  } finally {
    if (timer) clearInterval(timer);
    // Final fence check, after the keep-alive timer is stopped (so it cannot race this) and
    // BEFORE git-end releases the lease: a sub-interval commit (TTL < the keep-alive interval)
    // can finish before the timer ever fires, so a commit that raced a reclaim/re-mint would
    // otherwise exit 0 despite losing the lease.
    if (gitToken && !fenceLost && gitCode === 0) {
      const post = await verifyGitFence(
        gitLockId,
        gitToken,
        command.agentId,
        { refresh: false },
        cwd,
      );
      if (post.exitCode !== 0) fenceLost = post.stderr ?? "@git/index fence lost";
    }
    try {
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
    } catch {
      // Best-effort cleanup: a lost/reclaimed lease may already be gone.
    }
  }

  if (fenceLost) {
    console.error(`agentlocks: ${fenceLost}`);
    process.exitCode = 3;
    return;
  }
  if (gitCode !== 0) process.exitCode = gitCode;
}

function acquire(command: WrappedCommand, cwd: string): Promise<LockCommandOutput> {
  return executeLockCommand(
    {
      name: "acquire",
      resources: command.resources,
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

function spawnChild(
  argv: string[],
  cwd: string,
  onSpawn?: (child: ChildProcess) => void,
): Promise<number> {
  const [executable, ...args] = argv;
  if (!executable) return Promise.resolve(2);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", cwd });
    onSpawn?.(child);
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 128 : (code ?? 0)));
  });
}
