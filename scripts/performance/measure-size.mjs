#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const gitSha = commandText("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).trim();
const gitStatus = commandText("git", ["status", "--porcelain"], { cwd: root }).trim();
if (gitStatus && !options.skipCleanCheck) {
  throw new Error(
    "size baseline must run from a clean committed checkout; pass --skip-clean-check only for tests",
  );
}

if (!options.skipBuild) run("bun", ["run", "build"], { cwd: root, stdio: "inherit" });

const bundlePath = path.join(root, "dist", "agentlocks.mjs");
const bundle = readFileSync(bundlePath);
const gzipBytes = gzipSync(bundle, { level: 9 }).byteLength;
const pack = measurePackDryRun();
const versionText = commandText("node", [bundlePath, "--version"], { cwd: root }).trim();
const helpText = commandText("node", [bundlePath, "--help"], { cwd: root });
const firstLine = readFileSync(bundlePath, "utf8").split(/\r?\n/, 1)[0] ?? "";

const outDir = path.resolve(root, options.outDir);
mkdirSync(outDir, { recursive: true });

const env = {
  kind: "agentlocks.performance.env.v1",
  generated_at: new Date().toISOString(),
  git_sha: gitSha,
  clean_worktree: gitStatus.length === 0,
  git_status: gitStatus,
  root,
  host: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpus: os.cpus().length,
    cpu_model: os.cpus()[0]?.model ?? "unknown",
    totalmem: os.totalmem(),
    loadavg: os.loadavg(),
  },
  node: process.version,
  bun: commandText("bun", ["--version"], { cwd: root }).trim(),
  npm: commandTextOptional("npm", ["--version"], { cwd: root })?.trim() ?? null,
};

const size = {
  kind: "agentlocks.size.baseline.v1",
  generated_at: env.generated_at,
  git_sha: gitSha,
  clean_worktree: env.clean_worktree,
  bundle: {
    path: "dist/agentlocks.mjs",
    raw_bytes: bundle.byteLength,
    gzip_9_bytes: gzipBytes,
    first_line: firstLine,
    executable_mode_posix: (process.platform === "win32" ? null : statMode(bundlePath)) ?? null,
  },
  npm_pack_dry_run: pack,
  runtime_smoke: {
    version_stdout: versionText,
    help_sha256: sha256(helpText),
  },
};

writeFileSync(path.join(outDir, "env.md"), renderEnv(env));
writeFileSync(path.join(outDir, "size.json"), `${JSON.stringify(size, null, 2)}\n`);
console.log(`wrote ${path.relative(root, path.join(outDir, "env.md"))}`);
console.log(`wrote ${path.relative(root, path.join(outDir, "size.json"))}`);

function parseArgs(args) {
  const parsed = {
    outDir: "analyses/performance-baseline",
    skipBuild: false,
    skipCleanCheck: false,
    help: false,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--out-dir") parsed.outDir = readValue(args, ++index, arg);
    else if (arg === "--skip-build") parsed.skipBuild = true;
    else if (arg === "--skip-clean-check") parsed.skipCleanCheck = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`usage: node scripts/performance/measure-size.mjs [options]

Options:
  --out-dir <path>       Artifact directory (default: analyses/performance-baseline)
  --skip-build           Reuse an existing dist/agentlocks.mjs
  --skip-clean-check     Allow a dirty worktree; intended only for tests
  -h, --help             Show this help`);
}

function commandText(command, args, spawnOptions = {}) {
  const result = run(command, args, { ...spawnOptions, encoding: "utf8" });
  return result.stdout ?? "";
}

function commandTextOptional(command, args, spawnOptions = {}) {
  const result = spawnSync(command, args, { ...spawnOptions, encoding: "utf8" });
  if (result.error) {
    if (result.error.code === "ENOENT") return null;
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr : result.stderr?.toString("utf8");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}\n${stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

function measurePackDryRun() {
  const npmJson = commandTextOptional("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root,
  });
  if (npmJson !== null) return JSON.parse(npmJson);

  const bunFilename = commandText(
    "bun",
    ["pm", "pack", "--dry-run", "--ignore-scripts", "--quiet"],
    {
      cwd: root,
    },
  ).trim();
  return [
    {
      tool: "bun pm pack",
      filename: bunFilename,
      note: "npm was not available on PATH; recorded Bun dry-run filename fallback",
    },
  ];
}

function run(command, args, spawnOptions = {}) {
  const result = spawnSync(command, args, spawnOptions);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr : result.stderr?.toString("utf8");
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}\n${stderr ?? ""}`,
    );
  }
  return result;
}

function statMode(filePath) {
  return Number.parseInt(statSync(filePath).mode.toString(8).slice(-3), 8);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function renderEnv(env) {
  return `# Performance Baseline Environment

- generated_at: ${env.generated_at}
- git_sha: ${env.git_sha}
- clean_worktree: ${env.clean_worktree}
- root: ${env.root}
- platform: ${env.host.platform} ${env.host.release} ${env.host.arch}
- cpu_model: ${env.host.cpu_model}
- cpu_count: ${env.host.cpus}
- totalmem: ${env.host.totalmem}
- loadavg: ${env.host.loadavg.join(", ")}
- node: ${env.node}
- bun: ${env.bun}
- npm: ${env.npm}
`;
}
