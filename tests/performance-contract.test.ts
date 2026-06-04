import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import packageJson from "../package.json";
import { FileLockRegistry } from "../src/locks/registry";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../src/package-info";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const goldenDir = path.join(root, "tests/goldens/performance");
const updateGoldens = process.env.UPDATE_PERFORMANCE_GOLDENS === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const PERFORMANCE_CONTRACT_SETUP_TIMEOUT_MS = 30_000;

interface CliInvocation {
  name: "source" | "bundle" | "shim";
  command: string;
  argsPrefix: string[];
  env?: Record<string, string | undefined>;
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface ContractCase {
  name: string;
  golden: string;
  shim: boolean;
  run: (invocation: CliInvocation) => Promise<unknown>;
}

let tempRoot = "";
let bundleInvocation: CliInvocation;
let sourceInvocation: CliInvocation;
let shimInvocation: CliInvocation;

beforeAll(
  async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentlocks-performance-contract-"));
    await execFileAsync("bun", ["run", "build"], { cwd: root });
    sourceInvocation = {
      name: "source",
      command: "bun",
      argsPrefix: ["run", path.join(root, "bin/agentlocks.ts")],
    };
    bundleInvocation = {
      name: "bundle",
      command: process.execPath,
      argsPrefix: [path.join(root, "dist/agentlocks.mjs")],
    };
    shimInvocation = await installPackedShim();
  },
  { timeout: PERFORMANCE_CONTRACT_SETUP_TIMEOUT_MS },
);

afterAll(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

test("source package metadata fallback matches package manifest", () => {
  expect(PACKAGE_NAME).toBe(packageJson.name);
  expect(PACKAGE_VERSION).toBe(packageJson.version);
});

const cases: ContractCase[] = [
  {
    name: "help",
    golden: "help.json",
    shim: true,
    run: (invocation) => runStatic(invocation, ["--help"]),
  },
  {
    name: "version",
    golden: "version.json",
    shim: true,
    run: (invocation) => runStatic(invocation, ["--version"]),
  },
  {
    name: "capabilities-json",
    golden: "capabilities.json",
    shim: false,
    run: (invocation) => runStatic(invocation, ["capabilities", "--json"]),
  },
  {
    name: "robot-docs-guide",
    golden: "robot-docs-guide.json",
    shim: false,
    run: (invocation) => runStatic(invocation, ["robot-docs", "guide"]),
  },
  {
    name: "json-error",
    golden: "json-error.json",
    shim: true,
    run: (invocation) => runStatic(invocation, ["status", "--jason", "--json"], 1),
  },
  {
    name: "acquire-json",
    golden: "acquire-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) =>
        canonicalResult(
          await runCli(invocation, ["acquire", "target.txt", "--reason", "golden", "--json"], {
            cwd,
          }),
        ),
      ),
  },
  {
    name: "conflict-json",
    golden: "conflict-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) => {
        await runCli(invocation, ["acquire", "target.txt", "--reason", "incumbent", "--id-only"], {
          cwd,
          agentId: "perf-contract-other",
        });
        return canonicalResult(
          await runCli(invocation, ["acquire", "target.txt", "--reason", "golden", "--json"], {
            cwd,
            expectExit: 3,
          }),
        );
      }),
  },
  {
    name: "release-json",
    golden: "release-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) => {
        const acquired = await runCli(
          invocation,
          ["acquire", "target.txt", "--reason", "golden", "--id-only"],
          { cwd },
        );
        const lockId = firstLine(acquired.stdout);
        return canonicalResult(await runCli(invocation, ["release", lockId, "--json"], { cwd }));
      }),
  },
  {
    name: "status-json",
    golden: "status-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) => {
        await runCli(invocation, ["acquire", "target.txt", "--reason", "golden", "--id-only"], {
          cwd,
        });
        return canonicalResult(await runCli(invocation, ["status", "--json"], { cwd }));
      }),
  },
  {
    name: "git-begin-id-only",
    golden: "git-begin-id-only.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) =>
        canonicalResult(
          await runCli(invocation, ["git", "begin", "--reason", "golden", "--id-only"], { cwd }),
        ),
      ),
  },
  {
    name: "git-begin-json",
    golden: "git-begin-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) =>
        canonicalResult(
          await runCli(invocation, ["git", "begin", "--reason", "golden", "--json"], { cwd }),
        ),
      ),
  },
  {
    name: "git-end-id-only",
    golden: "git-end-id-only.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) => {
        const begun = await runCli(
          invocation,
          ["git", "begin", "--reason", "golden", "--id-only"],
          { cwd },
        );
        const lockId = firstLine(begun.stdout);
        return canonicalResult(
          await runCli(invocation, ["git", "end", lockId, "--id-only"], { cwd }),
        );
      }),
  },
  {
    name: "git-end-json",
    golden: "git-end-json.json",
    shim: false,
    run: (invocation) =>
      runInWorkspace(async (cwd) => {
        const begun = await runCli(
          invocation,
          ["git", "begin", "--reason", "golden", "--id-only"],
          { cwd },
        );
        const lockId = firstLine(begun.stdout);
        return canonicalResult(await runCli(invocation, ["git", "end", lockId, "--json"], { cwd }));
      }),
  },
];

test("source and production bundle match performance contract goldens", async () => {
  for (const item of cases) {
    const source = await item.run(sourceInvocation);
    const bundle = await item.run(bundleInvocation);
    expect(stableStringify(bundle), `${item.name}: bundle differs from source`).toBe(
      stableStringify(source),
    );
    await assertGolden(item.golden, source);
  }
});

test("packed shim keeps Node shebang behavior without Bun on PATH", async () => {
  await expectBunMissingFromShimPath();
  for (const item of cases.filter((testCase) => testCase.shim)) {
    const shim = await item.run(shimInvocation);
    await assertGolden(item.golden, shim);
  }
});

test("production bundle and package dry-run preserve structural contract", async () => {
  const bundlePath = path.join(root, "dist/agentlocks.mjs");
  const firstLine = (await readFile(bundlePath, "utf8")).split(/\r?\n/, 1)[0];
  expect(firstLine).toBe("#!/usr/bin/env node");
  if (process.platform !== "win32") {
    const mode = (await import("node:fs/promises"))
      .stat(bundlePath)
      .then((stat) => stat.mode & 0o777);
    expect(await mode).toBe(0o755);
  }
  const bundle = await readFile(bundlePath, "utf8");
  expect(bundle).not.toContain("AGENTLOCKS_PERF");
  expect(bundle).not.toContain('"devDependencies"');
  expect(bundle).not.toContain('"packageManager"');

  const version = await runCli(bundleInvocation, ["--version"], { cwd: root });
  expect(version.stdout.trim()).toBe(packageJson.version);
  const capabilities = await runCli(bundleInvocation, ["capabilities", "--json"], { cwd: root });
  expect((JSON.parse(capabilities.stdout) as { version?: string }).version).toBe(
    packageJson.version,
  );

  const pack = JSON.parse(
    (
      await execFileAsync(npmCommand, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: root,
      })
    ).stdout,
  ) as Array<{ size?: number; files?: Array<{ path: string; mode: number }> }>;
  const files = pack[0]?.files ?? [];
  expect(files.map((file) => file.path)).toEqual([
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "dist/agentlocks.mjs",
    "package.json",
  ]);
  const bundleMode = files.find((file) => file.path === "dist/agentlocks.mjs")?.mode;
  if (process.platform === "win32") {
    expect(bundleMode).toBe(0o644);
  } else {
    expect(bundleMode).toBe(0o755);
  }
});

test("liveness probe is gated by overlap and expiry", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-liveness-gate-"));
  let nowMs = Date.parse("2026-06-04T00:00:00Z");
  const probed: string[] = [];
  const registry = new FileLockRegistry({
    cwd: workspace,
    now: () => new Date(nowMs),
    sessionProbe: (owner) => {
      probed.push(owner.agentId);
      return { status: "unknown", evidence: "test probe" };
    },
    keepAliveOnMutation: false,
  });
  try {
    await registry.acquire({
      resourceSpecs: ["target.txt"],
      reason: "incumbent",
      agentId: "other-held",
      ttlMs: 1000,
    });

    const heldConflict = await registry.acquire({
      resourceSpecs: ["target.txt"],
      reason: "request",
      agentId: "requester",
      ttlMs: 1000,
    });
    expect(heldConflict.kind).toBe("conflict");
    expect(heldConflict.conflicts?.[0]?.status).toBe("held");
    expect(probed).toEqual([]);

    nowMs += 2000;
    const expiredConflict = await registry.acquire({
      resourceSpecs: ["target.txt"],
      reason: "request",
      agentId: "requester",
      ttlMs: 1000,
    });
    expect(expiredConflict.kind).toBe("conflict");
    expect(expiredConflict.conflicts?.[0]?.status).toBe("expired-unknown");
    expect(probed).toEqual(["other-held"]);

    probed.length = 0;
    const nonOverlap = await registry.acquire({
      resourceSpecs: ["other.txt"],
      reason: "request",
      agentId: "requester",
      ttlMs: 1000,
    });
    expect(nonOverlap.kind).toBe("acquired");
    expect(probed).toEqual([]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("built bundle preserves cross-process same-resource contention", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cross-process-"));
  try {
    const bundlePath = path.join(root, "dist/agentlocks.mjs");
    const contenders = Array.from({ length: 8 }, (_, index) =>
      spawnCli(
        process.execPath,
        [bundlePath, "acquire", "shared.txt", "--reason", "contention", "--id-only"],
        {
          cwd: workspace,
          agentId: `contender-${index}`,
        },
      ),
    );
    const results = await Promise.all(contenders);
    expect(results.filter((result) => result.code === 0).length).toBe(1);
    expect(results.filter((result) => result.code === 3).length).toBe(7);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

async function runStatic(
  invocation: CliInvocation,
  args: string[],
  expectExit = 0,
): Promise<unknown> {
  return canonicalResult(await runCli(invocation, args, { cwd: root, expectExit }));
}

async function runInWorkspace(callback: (cwd: string) => Promise<unknown>): Promise<unknown> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agentlocks-contract-case-"));
  try {
    return await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function runCli(
  invocation: CliInvocation,
  args: string[],
  options: { cwd: string; expectExit?: number; agentId?: string },
): Promise<CliResult> {
  return spawnCli(invocation.command, [...invocation.argsPrefix, ...args], {
    cwd: options.cwd,
    expectExit: options.expectExit ?? 0,
    agentId: options.agentId ?? "perf-contract-agent",
    ...(invocation.env !== undefined ? { env: invocation.env } : {}),
  });
}

async function spawnCli(
  command: string,
  args: string[],
  options: {
    cwd: string;
    expectExit?: number;
    agentId: string;
    env?: Record<string, string | undefined>;
  },
): Promise<CliResult> {
  const env = cleanAgentEnv({
    ...process.env,
    ...(options.env ?? {}),
    AGENTLOCKS_AGENT_ID: options.agentId,
  });
  const result = await execFileAsync(command, args, { cwd: options.cwd, env })
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }))
    .catch((error: unknown) => {
      const failure = error as { code?: number | null; stdout?: string; stderr?: string };
      return {
        code: failure.code ?? null,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
      };
    });
  if (options.expectExit !== undefined) expect(result.code).toBe(options.expectExit);
  return result;
}

function canonicalResult(result: CliResult): unknown {
  return {
    exit_code: result.code,
    stdout: canonicalOutput(result.stdout),
    stderr: canonicalOutput(result.stderr),
  };
}

function canonicalOutput(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return sortJson(scrubJson(JSON.parse(trimmed)));
  return scrubText(text);
}

function scrubText(text: string): string {
  return text
    .replace(/lock_\d{8}T\d{6}Z_[a-f0-9]+/g, "[lock-id]")
    .replace(/^g\d+$/gm, "[git-token]")
    .replace(new RegExp(escapeRegExp(root), "g"), "[repo-root]")
    .replace(new RegExp(escapeRegExp(os.tmpdir()), "g"), "[tmp]");
}

function scrubJson(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((child) => scrubJson(child));
  if (value === null) return value;
  if (typeof value === "string") {
    if (/^lock_\d{8}T\d{6}Z_[a-f0-9]+$/.test(value)) return "[lock-id]";
    if (/^g\d+$/.test(value)) return "[git-token]";
    return scrubText(value);
  }
  if (typeof value === "number" && key === "retry_after_ms") return "[retry-after-ms]";
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      scrubJson(child, childKey),
    ]),
  );
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

async function assertGolden(name: string, actual: unknown): Promise<void> {
  const text = `${stableStringify(actual)}\n`;
  const goldenPath = path.join(goldenDir, name);
  if (updateGoldens) {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(goldenPath, text);
    return;
  }
  expect(existsSync(goldenPath), `missing golden ${name}`).toBe(true);
  const expected = await readFile(goldenPath, "utf8");
  if (name.endsWith(".json")) {
    expect(stableStringify(JSON.parse(expected)), name).toBe(stableStringify(actual));
    return;
  }
  expect(text, name).toBe(expected);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function firstLine(text: string): string {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) return line;
  }
  return "";
}

async function installPackedShim(): Promise<CliInvocation> {
  const packDir = path.join(tempRoot, "pack");
  const prefix = path.join(tempRoot, "install");
  await mkdir(packDir, { recursive: true });
  await mkdir(prefix, { recursive: true });
  const pack = JSON.parse(
    (
      await execFileAsync(
        npmCommand,
        ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir],
        { cwd: root },
      )
    ).stdout,
  ) as Array<{ filename?: string }>;
  const filename = pack[0]?.filename;
  if (!filename) throw new Error("npm pack did not report a filename");
  await execFileAsync(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      prefix,
      path.join(packDir, filename),
    ],
    { cwd: root },
  );

  const nodeOnlyPath = path.join(tempRoot, "node-only-bin");
  await mkdir(nodeOnlyPath, { recursive: true });
  const nodeName = process.platform === "win32" ? "node.exe" : "node";
  await symlink(process.execPath, path.join(nodeOnlyPath, nodeName));
  const systemPaths =
    process.platform === "win32"
      ? [
          process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32") : "",
          process.env.SystemRoot ?? "",
        ]
      : ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const envPath = [nodeOnlyPath, ...systemPaths.filter(Boolean)].join(path.delimiter);
  if (process.platform === "win32") {
    return {
      name: "shim",
      command: process.env.ComSpec ?? "cmd.exe",
      argsPrefix: ["/d", "/s", "/c", path.join(prefix, "node_modules", ".bin", "agentlocks.cmd")],
      env: { PATH: envPath },
    };
  }
  return {
    name: "shim",
    command: path.join(prefix, "node_modules", ".bin", "agentlocks"),
    argsPrefix: [],
    env: { PATH: envPath },
  };
}

async function expectBunMissingFromShimPath(): Promise<void> {
  const result = await execFileAsync("bun", ["--version"], {
    env: { ...process.env, ...(shimInvocation.env ?? {}) },
  })
    .then(() => 0)
    .catch(() => 1);
  expect(result).toBe(1);
}

function cleanAgentEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  next.AGENTLOCKS_HARNESS_AGENT_ID = "";
  next.CODEX_THREAD_ID = "";
  next.CLAUDE_CODE_SESSION_ID = "";
  return next;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
