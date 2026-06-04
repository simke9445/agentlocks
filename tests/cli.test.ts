import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import packageJson from "../package.json";
import { helpText, parseCliArgs } from "../src/cli/program";

const execFileAsync = promisify(execFile);

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runCli(
  args: string[],
  cwd = process.cwd(),
  env: Record<string, string> = {},
): Promise<CliResult> {
  return execFileAsync(
    process.execPath,
    ["run", path.join(process.cwd(), "bin", "agentlocks.ts"), ...args],
    {
      cwd,
      env: { ...process.env, ...env },
    },
  )
    .then(({ stdout, stderr }) => ({ stdout, stderr, code: 0 }))
    .catch((error: unknown) => {
      const failure = error as Partial<CliResult>;
      return {
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        code: failure.code ?? null,
      };
    });
}

test("help lists top-level lock commands", () => {
  const help = helpText();
  expect(help).toContain("acquire");
  expect(help).toContain("refresh");
  expect(help).toContain("git");
  expect(help).toContain("init");
  expect(help).toContain("capabilities");
  expect(help).toContain("robot-docs");
  expect(help).toContain("doctor");
});

test("nested help aliases resolve to subcommand help", () => {
  const direct = parseCliArgs(["expand", "--help"]);
  expect(direct.help).toBe(true);
  expect(direct.helpText).toContain("Atomically add repo-relative resources");
  expect(direct.helpText).toContain("--lock <lock_id>");

  const alias = parseCliArgs(["help", "expand"]);
  expect(alias.help).toBe(true);
  expect(alias.helpText).toContain("Atomically add repo-relative resources");
  expect(alias.helpText).toContain("--lock <lock_id>");

  const gitAlias = parseCliArgs(["git", "help", "begin"]);
  expect(gitAlias.help).toBe(true);
  expect(gitAlias.helpText).toContain("@git/index");
});

test("bare invocation returns help, never leaks commander's (outputHelp)", () => {
  const parsed = parseCliArgs([]);
  expect(parsed.help).toBe(true);
  expect(parsed.command).toBeUndefined();
  expect(parsed.helpText ?? "").toContain("acquire");
  expect(parsed.helpText ?? "").not.toContain("(outputHelp)");
});

test("a command group with no subcommand returns help, not an error", () => {
  for (const argv of [["robot-docs"], ["git"]]) {
    const parsed = parseCliArgs(argv);
    expect(parsed.help).toBe(true);
    expect(parsed.helpText ?? "").not.toContain("(outputHelp)");
  }
});

test("--version resolves to the package version", () => {
  const parsed = parseCliArgs(["--version"]);
  expect(parsed.help).toBe(true);
  expect(parsed.helpText ?? "").toContain(packageJson.version);
});

test("agentlocks with no args prints help on stdout and exits 0", async () => {
  const result = await runCli([]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("acquire");
  expect(`${result.stdout}${result.stderr}`).not.toContain("(outputHelp)");
});

test("agentlocks --version prints the version and exits 0", async () => {
  const result = await runCli(["--version"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain(packageJson.version);
});

test("a missing required option teaches the corrected command via next:", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-missing-opt-"));
  try {
    const result = await runCli(["acquire", "src/foo.ts"], workspace);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("required option '--reason");
    expect(result.stderr).toContain("next: agentlocks acquire src/foo.ts --reason");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("missing lock id error points the agent at status --id-only via next:", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-missing-id-"));
  try {
    const text = await runCli(["release"], workspace);
    expect(text.code).toBe(2);
    expect(text.stderr).toContain("At least one lock id is required for release");
    expect(text.stderr).toContain("next: agentlocks status --id-only");

    const json = await runCli(["release", "--json"], workspace);
    const payload = JSON.parse(json.stdout) as {
      code?: unknown;
      details?: { suggestion?: { command?: unknown } };
    };
    expect(payload.code).toBe("missing_lock_id");
    expect(payload.details?.suggestion?.command).toBe("agentlocks status --id-only");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("parse lock acquire command", () => {
  const parsed = parseCliArgs([
    "acquire",
    "src/cli/program.ts",
    "src/locks/**/*.ts",
    "--reason",
    "add lock parser",
    "--ttl-ms",
    "1000",
    "--agent-id",
    "owner-1",
    "--json",
    "--id-only",
  ]);
  expect(parsed.command?.kind).toBe("lock");
  if (parsed.command?.kind !== "lock") throw new Error("expected lock command");
  expect(parsed.command.command).toEqual({
    name: "acquire",
    resources: ["src/cli/program.ts", "src/locks/**/*.ts"],
    reason: "add lock parser",
    ttlMs: 1000,
    agentId: "owner-1",
    json: true,
    idOnly: true,
  });
});

test("parse lock git helpers for combined commit coordination", () => {
  const begin = parseCliArgs([
    "git",
    "begin",
    "--reason",
    "commit lock feature",
    "--refresh-lock",
    "lock_files",
    "--id-only",
  ]);
  expect(begin.command?.kind).toBe("lock");
  if (begin.command?.kind !== "lock") throw new Error("expected lock command");
  expect(begin.command.command).toEqual({
    name: "git-begin",
    reason: "commit lock feature",
    ttlMs: null,
    agentId: null,
    refreshLockIds: ["lock_files"],
    json: false,
    idOnly: true,
  });

  const end = parseCliArgs(["git", "end", "lock_git", "--release-lock", "lock_files"]);
  expect(end.command?.kind).toBe("lock");
  if (end.command?.kind !== "lock") throw new Error("expected lock command");
  expect(end.command.command).toEqual({
    name: "git-end",
    lockIds: ["lock_git"],
    releaseLockIds: ["lock_files"],
    agentId: null,
    json: false,
    idOnly: false,
  });
});

test("parse prune dry-run command", () => {
  const parsed = parseCliArgs(["prune", "--dry-run", "--json"]);
  expect(parsed.command?.kind).toBe("lock");
  if (parsed.command?.kind !== "lock") throw new Error("expected lock command");
  expect(parsed.command.command).toEqual({
    name: "prune",
    dryRun: true,
    json: true,
    idOnly: false,
  });
});

test("parse init check command", () => {
  const parsed = parseCliArgs([
    "init",
    "--check",
    "--harness",
    "claude-code",
    "--json",
    "--verbose",
  ]);
  expect(parsed.command).toEqual({
    kind: "init",
    options: {
      check: true,
      json: true,
      verbose: true,
      harness: "claude-code",
      commitHook: true,
    },
  });
});

test("parse capabilities command", () => {
  expect(parseCliArgs(["capabilities"]).command).toEqual({
    kind: "capabilities",
    options: {
      json: false,
    },
  });
  expect(parseCliArgs(["capabilities", "--json"]).command).toEqual({
    kind: "capabilities",
    options: {
      json: true,
    },
  });
});

test("parse robot docs guide command", () => {
  expect(parseCliArgs(["robot-docs", "guide"]).command).toEqual({
    kind: "robot-docs",
    options: {
      topic: "guide",
    },
  });
});

test("parse doctor command", () => {
  expect(parseCliArgs(["doctor", "--json", "--verbose"]).command).toEqual({
    kind: "doctor",
    options: {
      json: true,
      verbose: true,
    },
  });
});

test("json parse errors are machine-readable", async () => {
  const result = await runCli(["acquire", "src/index.ts", "--ttl-ms", "10abc", "--json"]);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  expect(payload.ok).toBe(false);
  expect(payload.code).toBe("commander.invalidArgument");
  expect(payload.message).toEqual(expect.stringContaining("--ttl-ms"));
});

test("unknown flag text errors suggest an exact corrected command", async () => {
  const result = await runCli(["status", "--jason"]);
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("unknown option '--jason'");
  expect(result.stderr).toContain("next: agentlocks status --json");
});

test("unknown flag json errors include suggestion details", async () => {
  const result = await runCli(["status", "--jason", "--json"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toBe("");
  const payload = JSON.parse(result.stdout) as {
    ok?: unknown;
    code?: unknown;
    details?: { suggestion?: Record<string, unknown> };
  };
  expect(payload.ok).toBe(false);
  expect(payload.code).toBe("commander.unknownOption");
  expect(payload.details?.suggestion).toEqual({
    replace: "--jason",
    with: "--json",
    command: "agentlocks status --json",
  });
});

test("unknown command json errors suggest an exact corrected command", async () => {
  const result = await runCli(["stats", "--json"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const payload = JSON.parse(result.stdout) as {
    code?: unknown;
    details?: { suggestion?: Record<string, unknown> };
  };
  expect(payload.code).toBe("commander.unknownCommand");
  expect(payload.details?.suggestion).toEqual({
    replace: "stats",
    with: "status",
    command: "agentlocks status --json",
  });
});

test("unknown command plain errors suggest an exact corrected command", async () => {
  const result = await runCli(["capabilties"]);
  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("unknown command 'capabilties'");
  expect(result.stderr).toContain("next: agentlocks capabilities");
});

test("nested unknown command errors suggest exact corrected commands", async () => {
  const json = await runCli(["git", "begn", "--reason", "commit", "--json"]);
  expect(json.code).toBe(1);
  expect(json.stderr).toBe("");
  const payload = JSON.parse(json.stdout) as {
    details?: { suggestion?: Record<string, unknown> };
  };
  expect(payload.details?.suggestion).toEqual({
    replace: "begn",
    with: "begin",
    command: "agentlocks git begin --reason commit --json",
  });

  const text = await runCli(["robot-docs", "gudie"]);
  expect(text.code).toBe(1);
  expect(text.stdout).toBe("");
  expect(text.stderr).toContain("next: agentlocks robot-docs guide");
});

test("identify rejects id-only with a precise replacement command", async () => {
  const result = await runCli(["identify", "--id-only", "--json"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toBe("");
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  expect(payload).toMatchObject({
    ok: false,
    code: "unsupported_output_option",
  });
  expect(payload.message).toContain("agentlocks identify --json");
});

test("non-json conflict writes data to stdout and the next step to stderr", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-conflict-"));
  const env = {
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_THREAD_ID: "",
    AGENTLOCKS_HARNESS_AGENT_ID: "",
    AGENTLOCKS_AGENT_ID: "",
  };
  try {
    await runCli(
      ["acquire", "shared.ts", "--reason", "first", "--agent-id", "agent-1"],
      workspace,
      env,
    );
    const conflict = await runCli(
      ["acquire", "shared.ts", "--reason", "second", "--agent-id", "agent-2"],
      workspace,
      env,
    );
    expect(conflict.code).toBe(3);
    expect(conflict.stdout).toContain("lock conflict: shared.ts");
    expect(conflict.stdout).not.toContain("next:");
    expect(conflict.stderr).toContain("next:");
    expect(conflict.stderr).toContain("retry");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("capabilities json is compact and machine-readable", async () => {
  const result = await runCli(["capabilities", "--json"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThan(8500);

  const payload = JSON.parse(result.stdout) as {
    kind?: unknown;
    schema_version?: unknown;
    version?: unknown;
    commands?: Array<{
      name?: unknown;
      mutates?: unknown;
      json?: unknown;
      id_only?: unknown;
      flags?: unknown;
      exit_codes?: unknown;
    }>;
    exit_codes?: Array<{ code?: unknown; name?: unknown; meaning?: unknown }>;
    env?: Array<{ name?: unknown }>;
    owner_detection?: {
      order?: unknown;
      harnesses?: Array<{ name?: unknown; primary_env?: unknown; scope?: unknown }>;
    };
  };

  expect(payload.kind).toBe("capabilities");
  expect(payload.schema_version).toBe(1);
  // Sourced from package.json; assert against it so a version bump never re-breaks this test.
  expect(payload.version).toBe(packageJson.version);
  const acquire = payload.commands?.find((command) => command.name === "acquire");
  expect(acquire).toMatchObject({
    mutates: true,
    json: true,
  });
  expect(acquire?.flags).toContain("--reason");
  expect(acquire?.exit_codes).toContain(3);
  expect(payload.commands?.some((command) => command.name === "capabilities")).toBe(true);
  expect(payload.commands?.some((command) => command.name === "robot-docs guide")).toBe(true);
  expect(payload.commands?.some((command) => command.name === "doctor")).toBe(true);
  expect(payload.commands?.find((command) => command.name === "identify")?.id_only).toBe(false);
  expect(payload.commands?.find((command) => command.name === "init")?.flags).toContain(
    "--verbose",
  );
  expect(payload.commands?.find((command) => command.name === "init")?.flags).toContain(
    "--harness",
  );
  expect(payload.commands?.some((command) => command.name === "install")).toBe(false);
  expect(payload.commands?.find((command) => command.name === "prune")?.flags).toContain(
    "--dry-run",
  );
  expect(payload.exit_codes).toContainEqual({
    code: 1,
    name: "cli_or_check_error",
    meaning: "CLI parse error, init check drift, or doctor warning/error result.",
  });
  expect(payload.exit_codes).toContainEqual({
    code: 3,
    name: "lock_conflict",
    meaning: "Lock conflict or ownership failure.",
  });
  expect(payload.env?.map((entry) => entry.name)).toContain("AGENTLOCKS_AGENT_ID");
  expect(payload.env?.map((entry) => entry.name)).toContain("AGENTLOCKS_HARNESS_AGENT_ID");
  expect(payload.env?.map((entry) => entry.name)).toContain("CODEX_THREAD_ID");
  expect(payload.env?.map((entry) => entry.name)).toContain("CLAUDE_CODE_SESSION_ID");
  expect(payload.owner_detection?.order).toEqual([
    "AGENTLOCKS_HARNESS_AGENT_ID",
    "CODEX_THREAD_ID",
    "CLAUDE_CODE_SESSION_ID",
    "--agent-id",
    "AGENTLOCKS_AGENT_ID",
    "fallback",
  ]);
  expect(payload.owner_detection?.harnesses).toEqual(
    expect.arrayContaining([
      { name: "codex", primary_env: "CODEX_THREAD_ID", scope: "agent" },
      { name: "claude-code", primary_env: "CLAUDE_CODE_SESSION_ID", scope: "session" },
    ]),
  );
});

test("robot docs guide matches golden output", async () => {
  const result = await runCli(["robot-docs", "guide"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe(
    await readFile(path.join(process.cwd(), "tests/goldens/robot-docs-guide.txt"), "utf8"),
  );
});

async function activeLockCount(workspace: string): Promise<number> {
  const entries = await readdir(path.join(workspace, ".agentlocks/locks/active")).catch(() => []);
  return entries.filter((entry) => entry.endsWith(".json")).length;
}

test("run acquires, executes the wrapped command, and releases the lock", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-run-"));
  try {
    const result = await runCli(
      ["run", "app.ts", "--reason", "do work", "--", "echo", "CHILD-RAN"],
      workspace,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("CHILD-RAN");
    expect(await activeLockCount(workspace)).toBe(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("edit keeps the lock and prints its id", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-edit-"));
  try {
    const result = await runCli(
      ["edit", "app.ts", "--reason", "do work", "--", "echo", "EDITED"],
      workspace,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("EDITED");
    expect(result.stdout).toMatch(/lock_/);
    expect(await activeLockCount(workspace)).toBe(1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("run without a -- command exits with a usage error", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-run-err-"));
  try {
    const result = await runCli(["run", "app.ts", "--reason", "do work"], workspace);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("requires a command after --");
    expect(await activeLockCount(workspace)).toBe(0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("run on a conflicting path exits 3 without executing the command", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-run-conflict-"));
  const env = { CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: "", AGENTLOCKS_HARNESS_AGENT_ID: "" };
  try {
    await runCli(["acquire", "app.ts", "--reason", "hold", "--agent-id", "holder"], workspace, env);
    const result = await runCli(
      ["run", "app.ts", "--reason", "do", "--agent-id", "other", "--", "echo", "SHOULD-NOT-RUN"],
      workspace,
      env,
    );
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("lock conflict");
    expect(result.stdout).not.toContain("SHOULD-NOT-RUN");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("commit stages and commits only the locked resources, then releases", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-commit-"));
  try {
    await execFileAsync("git", ["init", "-q"], { cwd: workspace });
    await execFileAsync("git", ["config", "user.email", "t@t.t"], { cwd: workspace });
    await execFileAsync("git", ["config", "user.name", "tester"], { cwd: workspace });
    await writeFile(path.join(workspace, "feat.ts"), "export const x = 1;\n", "utf8");
    await writeFile(path.join(workspace, "other.ts"), "export const y = 2;\n", "utf8");

    const result = await runCli(
      ["commit", "feat.ts", "--reason", "ship", "-m", "add feat"],
      workspace,
    );
    expect(result.code).toBe(0);
    expect(await activeLockCount(workspace)).toBe(0);

    const log = await execFileAsync("git", ["log", "--oneline"], { cwd: workspace });
    expect(log.stdout).toContain("add feat");
    const files = await execFileAsync("git", ["show", "--name-only", "--format=", "HEAD"], {
      cwd: workspace,
    });
    expect(files.stdout).toContain("feat.ts");
    expect(files.stdout).not.toContain("other.ts");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("init check json is compact by default with verbose full output", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-init-"));
  try {
    await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");
    const compact = await runCli(["init", "--check", "--json"], workspace);
    expect(compact.code).toBe(1);
    expect(compact.stderr).toBe("");
    expect(compact.stdout.trim().split("\n")).toHaveLength(1);
    expect(Buffer.byteLength(compact.stdout, "utf8")).toBeLessThan(900);

    const payload = JSON.parse(compact.stdout) as {
      kind?: unknown;
      ok?: unknown;
      check?: unknown;
      harness?: unknown;
      resolved_harness?: unknown;
      instructions_path?: unknown;
      change_count?: unknown;
      changes?: Array<Record<string, unknown>>;
      root?: unknown;
    };
    expect(payload.kind).toBe("init");
    expect(payload.ok).toBe(false);
    expect(payload.check).toBe(true);
    expect(payload.harness).toBe("auto");
    expect(payload.resolved_harness).toBe("codex");
    expect(payload.instructions_path).toBe("AGENTS.md");
    expect(payload.change_count).toBe(payload.changes?.length);
    expect(payload.changes?.[0]).toEqual({
      path: ".agentlocks/locks",
      action: "would_create",
    });
    expect(payload.root).toBeUndefined();

    const verbose = await runCli(["init", "--check", "--json", "--verbose"], workspace);
    const verbosePayload = JSON.parse(verbose.stdout) as Record<string, unknown>;
    expect(verbosePayload.root).toBe(await realpath(workspace));
    expect(verbosePayload.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: "lock directory is required" })]),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("init claude-code harness json targets AGENTS instructions", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-init-claude-"));
  try {
    await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");
    const result = await runCli(
      ["init", "--check", "--harness", "claude-code", "--json"],
      workspace,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as {
      instructions_path?: unknown;
      changes?: Array<Record<string, unknown>>;
    };
    expect(payload.instructions_path).toBe("AGENTS.md");
    expect(payload.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "AGENTS.md", action: "would_create" }),
      ]),
    );
    await expect(readFile(path.join(workspace, "CLAUDE.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("install command is not accepted", async () => {
  const result = await runCli(["install", "--json"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toBe("");
  const payload = JSON.parse(result.stdout) as { code?: unknown; details?: unknown };
  expect(payload.code).toBe("commander.unknownCommand");
});

test("init rejects unsupported harness values", async () => {
  const result = await runCli(["init", "--harness", "both", "--json"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toBe("");
  const payload = JSON.parse(result.stdout) as { code?: unknown; message?: unknown };
  expect(payload.code).toBe("commander.invalidArgument");
  expect(payload.message).toEqual(expect.stringContaining("Expected auto, codex, or claude-code"));
});

test("doctor json reports read-only health checks", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-doctor-"));
  try {
    await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");
    const result = await runCli(["doctor", "--json"], workspace);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const payload = JSON.parse(result.stdout) as {
      kind?: unknown;
      schema_version?: unknown;
      ok?: unknown;
      checks?: Array<{ id?: unknown; status?: unknown; next?: unknown; details?: unknown }>;
    };
    expect(payload.kind).toBe("doctor");
    expect(payload.schema_version).toBe(1);
    expect(payload.ok).toBe(false);
    expect(payload.checks?.some((check) => check.id === "init" && check.status === "warn")).toBe(
      true,
    );
    expect(payload.checks?.every((check) => check.details === undefined)).toBe(true);

    const verbose = await runCli(["doctor", "--json", "--verbose"], workspace);
    const verbosePayload = JSON.parse(verbose.stdout) as {
      checks?: Array<{ id?: unknown; details?: unknown }>;
    };
    expect(verbosePayload.checks?.find((check) => check.id === "init")?.details).toBeDefined();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a fresh registry mutex is healthy, not a warning", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-mutex-"));
  try {
    await mkdir(path.join(workspace, ".agentlocks/locks/active"), { recursive: true });
    await mkdir(path.join(workspace, ".agentlocks/locks/.mutex"), { recursive: true });
    const result = await runCli(["doctor", "--json"], workspace);
    const payload = JSON.parse(result.stdout) as {
      checks?: Array<{ id?: unknown; status?: unknown }>;
    };
    const mutex = payload.checks?.find((check) => check.id === "registry_mutex");
    expect(mutex?.status).toBe("ok");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("doctor reports Claude Code hook and session-scope agent diagnostics", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cli-doctor-claude-"));
  try {
    await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");
    const result = await runCli(["doctor", "--json", "--verbose"], workspace, {
      CLAUDE_CODE_SESSION_ID: "claude-session",
      CODEX_THREAD_ID: "",
      CODEX_CI: "",
      AGENTLOCKS_AGENT_ID: "",
      AGENTLOCKS_HARNESS_AGENT_ID: "",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as {
      checks?: Array<{
        id?: unknown;
        status?: unknown;
        details?: { changes?: Array<{ path?: unknown }> };
      }>;
    };
    expect(payload.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "claude_agent_hook", status: "warn" }),
        expect.objectContaining({ id: "agent_session_scope", status: "warn" }),
      ]),
    );
    const initChanges = payload.checks?.find((check) => check.id === "init")?.details?.changes;
    expect(initChanges?.map((change) => change.path)).toEqual(
      expect.arrayContaining([".claude/hooks/agentlocks-agent-env.mjs", ".claude/settings.json"]),
    );

    await runCli(["init", "--harness", "claude-code"], workspace);
    const afterInit = await runCli(["doctor", "--json", "--verbose"], workspace, {
      CLAUDE_CODE_SESSION_ID: "claude-session",
      CODEX_THREAD_ID: "",
      CODEX_CI: "",
      AGENTLOCKS_AGENT_ID: "",
      AGENTLOCKS_HARNESS_AGENT_ID: "claude-code:claude-session:main",
    });
    const afterPayload = JSON.parse(afterInit.stdout) as {
      ok?: unknown;
      checks?: Array<{ id?: unknown; status?: unknown }>;
    };
    expect(afterPayload.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "claude_agent_hook", status: "ok" }),
        expect.objectContaining({ id: "agent_session_scope", status: "ok" }),
        expect.objectContaining({ id: "init", status: "ok" }),
      ]),
    );
    // After init --harness claude-code, doctor must report healthy: the commit-hook is no longer
    // flagged as drift (it now checks commitHook:true) and the session-scoped identity is ok.
    expect(afterPayload.ok).toBe(true);
    expect(afterInit.code).toBe(0);

    // The real Step 0 repro: a direct invocation with only the ambient session id (no
    // hook-injected scoped id). With the hook installed on disk, this is still healthy.
    const directRun = await runCli(["doctor", "--json"], workspace, {
      CLAUDE_CODE_SESSION_ID: "claude-session",
      CODEX_THREAD_ID: "",
      CODEX_CI: "",
      AGENTLOCKS_AGENT_ID: "",
      AGENTLOCKS_HARNESS_AGENT_ID: "",
    });
    expect(directRun.code).toBe(0);
    const directPayload = JSON.parse(directRun.stdout) as {
      ok?: unknown;
      checks?: Array<{ id?: unknown; status?: unknown }>;
    };
    expect(directPayload.ok).toBe(true);
    expect(directPayload.checks?.find((check) => check.id === "agent_session_scope")?.status).toBe(
      "ok",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
