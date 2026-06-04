#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nodeBin = process.execPath;
const benchmarkAgentId = "agentlocks-benchmark-agent";
const otherAgentPrefix = "agentlocks-benchmark-other";
const defaultScenarios = [
  "module_load",
  "acquire_no_conflict",
  "acquire_conflict",
  "refresh",
  "release",
  "status_json",
  "git_begin",
  "git_end",
];

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (options.selfTest) {
  runSelfTest();
  process.exit(0);
}

const gitSha = commandText("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).trim();
const gitStatus = commandText("git", ["status", "--porcelain"], { cwd: root }).trim();
if (gitStatus && !options.skipCleanCheck) {
  throw new Error(
    "latency baseline must run from a clean committed checkout; pass --skip-clean-check only for tests",
  );
}

const outDir = path.resolve(root, options.outDir);
mkdirSync(outDir, { recursive: true });

const bundlePath = path.join(root, "dist", "agentlocks.mjs");
assertBundle(bundlePath);

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "agentlocks-latency-"));
const moduleLoadBundle = path.join(tempRoot, "module-load.mjs");
const installed = options.variants.includes("shim") ? installPackedShim(tempRoot) : null;
buildModuleLoadBundle(moduleLoadBundle);

const cases = [];
const startedAt = new Date().toISOString();
try {
  if (options.scenarios.includes("module_load")) {
    cases.push(
      measureCase({
        variant: "module-load-bundle",
        scenario: "module_load",
        activeLocks: null,
        invocation: { command: nodeBin, args: [moduleLoadBundle] },
        expectExit: 0,
      }),
    );
  }

  for (const variant of options.variants) {
    const invocation =
      variant === "direct"
        ? { command: nodeBin, argsPrefix: [bundlePath] }
        : { command: installed.bin, argsPrefix: [] };
    for (const scenario of options.scenarios.filter((item) => item !== "module_load")) {
      for (const activeLocks of options.activeCounts) {
        if (!scenarioSupportsCount(scenario, activeLocks)) continue;
        cases.push(measureScenarioCase({ variant, scenario, activeLocks, invocation }));
      }
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const nodeFloorSamples = cases.flatMap((item) =>
  item.samples.map((sample) => sample.node_floor_ms),
);
const result = {
  kind: "agentlocks.latency.baseline.v1",
  generated_at: new Date().toISOString(),
  started_at: startedAt,
  git_sha: gitSha,
  clean_worktree: gitStatus.length === 0,
  samples_per_case: options.samples,
  warmups_per_case: options.warmups,
  active_counts: options.activeCounts,
  variants: options.variants,
  scenarios: options.scenarios,
  host: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpus: os.cpus().length,
    cpu_model: os.cpus()[0]?.model ?? "unknown",
    loadavg: os.loadavg(),
  },
  node: process.version,
  bun: commandText("bun", ["--version"], { cwd: root }).trim(),
  package_install: installed?.metadata ?? null,
  node_floor_overall_ms: summarize(nodeFloorSamples),
  cases: cases.map(({ samples, ...item }) => ({
    ...item,
    command_ms: summarize(samples.map((sample) => sample.command_ms)),
    node_floor_ms: summarize(samples.map((sample) => sample.node_floor_ms)),
    paired_delta_ms: summarize(samples.map((sample) => sample.paired_delta_ms)),
    paired_delta_ci_ms: bootstrapCis(samples.map((sample) => sample.paired_delta_ms)),
    startup_floor_drift: floorDrift(samples.map((sample) => sample.node_floor_ms)),
    samples,
  })),
};

writeFileSync(path.join(outDir, "latency.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(outDir, "summary.md"), renderSummary(result, readSize(outDir)));
console.log(`wrote ${path.relative(root, path.join(outDir, "latency.json"))}`);
console.log(`wrote ${path.relative(root, path.join(outDir, "summary.md"))}`);

function measureScenarioCase({ variant, scenario, activeLocks, invocation }) {
  const state = createScenarioState(scenario, activeLocks);
  const args = scenarioArgs(scenario, activeLocks);
  return measureCase({
    variant,
    scenario,
    activeLocks,
    invocation: { command: invocation.command, args: [...invocation.argsPrefix, ...args.args] },
    expectExit: args.expectExit,
    state,
  });
}

function measureCase({ variant, scenario, activeLocks, invocation, expectExit, state = null }) {
  const commandLine = [invocation.command, ...invocation.args].join(" ");
  const samples = [];
  for (let index = 0; index < options.warmups; index++) {
    state?.reset();
    runTimed(nodeBin, ["-e", ""], { cwd: root, expectExit: 0 });
    const warm = runTimed(invocation.command, invocation.args, {
      cwd: state?.cwd ?? root,
      env: childEnv(),
      expectExit,
    });
    state?.cleanup(warm);
  }
  for (let index = 0; index < options.samples; index++) {
    state?.reset();
    const floor = runTimed(nodeBin, ["-e", ""], { cwd: root, expectExit: 0 });
    const command = runTimed(invocation.command, invocation.args, {
      cwd: state?.cwd ?? root,
      env: childEnv(),
      expectExit,
    });
    state?.cleanup(command);
    samples.push({
      index,
      node_floor_ms: floor.durationMs,
      command_ms: command.durationMs,
      paired_delta_ms: command.durationMs - floor.durationMs,
      exit_code: command.status,
    });
  }
  state?.dispose();
  return {
    variant,
    scenario,
    active_locks: activeLocks,
    command: commandLine,
    expect_exit: expectExit,
    samples,
  };
}

function createScenarioState(scenario, activeLocks) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), `agentlocks-${scenario}-${activeLocks}-`));
  const lockRoot = path.join(cwd, ".agentlocks", "locks");
  const activeDir = path.join(lockRoot, "active");
  mkdirSync(activeDir, { recursive: true });
  const baseLocks = seedLocksForScenario(cwd, scenario, activeLocks);

  return {
    cwd,
    reset() {
      rmSync(activeDir, { recursive: true, force: true });
      mkdirSync(activeDir, { recursive: true });
      for (const lock of baseLocks) writeLock(activeDir, lock);
      if (scenario === "git_begin" || scenario === "git_end") {
        writeFileSync(path.join(lockRoot, "git-index.generation"), "1\n");
      }
      writeFileSync(path.join(lockRoot, "events.jsonl"), "");
    },
    cleanup(result) {
      if (scenario === "acquire_no_conflict" || scenario === "git_begin") {
        const lockId = firstLine(result.stdout);
        if (lockId) rmSync(path.join(activeDir, `${lockId}.json`), { force: true });
      }
    },
    dispose() {
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function seedLocksForScenario(cwd, scenario, activeLocks) {
  const locks = [];
  if (scenario === "acquire_conflict") {
    locks.push(makeLock(cwd, "lock_bench_conflict", "target.txt", `${otherAgentPrefix}-conflict`));
  } else if (scenario === "refresh" || scenario === "release") {
    locks.push(makeLock(cwd, "lock_bench_target", "target.txt", benchmarkAgentId));
  } else if (scenario === "git_end") {
    locks.push(makeGitLock(cwd, "lock_bench_git", benchmarkAgentId, 1));
    if (activeLocks > 1) {
      locks.push(makeLock(cwd, "lock_bench_file_owned", "owned-file.txt", benchmarkAgentId));
    }
  } else if (scenario === "git_begin" && activeLocks > 0) {
    locks.push(makeLock(cwd, "lock_bench_file_owned", "owned-file.txt", benchmarkAgentId));
  }

  let index = 0;
  while (locks.length < activeLocks) {
    locks.push(
      makeLock(
        cwd,
        `lock_bench_${String(index).padStart(6, "0")}`,
        `preseeded-${index}.txt`,
        `${otherAgentPrefix}-${index}`,
      ),
    );
    index++;
  }
  return locks;
}

function scenarioArgs(scenario, activeLocks) {
  switch (scenario) {
    case "acquire_no_conflict":
      return {
        args: ["acquire", "target.txt", "--reason", "benchmark", "--id-only"],
        expectExit: 0,
      };
    case "acquire_conflict":
      return { args: ["acquire", "target.txt", "--reason", "benchmark", "--json"], expectExit: 3 };
    case "refresh":
      return { args: ["refresh", "lock_bench_target", "--id-only"], expectExit: 0 };
    case "release":
      return { args: ["release", "lock_bench_target", "--id-only"], expectExit: 0 };
    case "status_json":
      return { args: ["status", "--json"], expectExit: 0 };
    case "git_begin":
      return {
        args:
          activeLocks > 0
            ? [
                "git",
                "begin",
                "--refresh-lock",
                "lock_bench_file_owned",
                "--reason",
                "benchmark",
                "--id-only",
              ]
            : ["git", "begin", "--reason", "benchmark", "--id-only"],
        expectExit: 0,
      };
    case "git_end":
      return {
        args:
          activeLocks > 1
            ? [
                "git",
                "end",
                "lock_bench_git",
                "--release-lock",
                "lock_bench_file_owned",
                "--id-only",
              ]
            : ["git", "end", "lock_bench_git", "--id-only"],
        expectExit: 0,
      };
    default:
      throw new Error(`unknown scenario: ${scenario}`);
  }
}

function scenarioSupportsCount(scenario, activeLocks) {
  if (["acquire_conflict", "refresh", "release", "git_end"].includes(scenario)) {
    return activeLocks > 0;
  }
  return activeLocks >= 0;
}

function makeLock(cwd, lockId, resource, agentId) {
  const now = "2026-06-04T00:00:00Z";
  return {
    schemaVersion: 1,
    lockId,
    state: "held",
    resources: [{ kind: "path", value: resource }],
    owner: makeOwner(cwd, agentId),
    reason: "benchmark fixture",
    createdAt: now,
    lastHeartbeatAt: now,
    leaseExpiresAt: "2999-01-01T00:00:00Z",
    ttlMs: 600000,
  };
}

function makeGitLock(cwd, lockId, agentId, generation) {
  return {
    ...makeLock(cwd, lockId, "@git/index", agentId),
    resources: [{ kind: "git", value: "@git/index" }],
    generation,
  };
}

function makeOwner(cwd, agentId) {
  return {
    agentId,
    hostname: os.hostname(),
    pid: process.pid,
    cwd,
    source: "env:AGENTLOCKS_AGENT_ID",
  };
}

function writeLock(activeDir, lock) {
  writeFileSync(path.join(activeDir, `${lock.lockId}.json`), `${JSON.stringify(lock, null, 2)}\n`);
}

function childEnv() {
  const env = { ...process.env, AGENTLOCKS_AGENT_ID: benchmarkAgentId };
  delete env.AGENTLOCKS_HARNESS_AGENT_ID;
  delete env.CODEX_THREAD_ID;
  delete env.CLAUDE_CODE_SESSION_ID;
  return env;
}

function runTimed(command, args, { cwd, env = process.env, expectExit }) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  const ended = process.hrtime.bigint();
  const durationMs = Number(ended - started) / 1_000_000;
  if (result.error) throw result.error;
  if (result.status !== expectExit) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}, expected ${expectExit}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
    );
  }
  return {
    durationMs,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function buildModuleLoadBundle(outfile) {
  run("bun", [
    "build",
    path.join(root, "scripts", "performance", "module-load-entry.ts"),
    "--target=node",
    "--minify",
    "--outfile",
    outfile,
  ]);
}

function installPackedShim(tempRoot) {
  const packDir = path.join(tempRoot, "pack");
  const prefix = path.join(tempRoot, "install");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(prefix, { recursive: true });
  const pack = JSON.parse(
    commandText("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packDir], {
      cwd: root,
    }),
  );
  const filename = pack[0]?.filename;
  if (!filename) throw new Error("npm pack did not report a filename");
  const tarball = path.join(packDir, filename);
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    prefix,
    tarball,
  ]);
  const bin = path.join(prefix, "node_modules", ".bin", "agentlocks");
  if (process.platform !== "win32") chmodSync(bin, 0o755);
  return {
    bin,
    metadata: {
      tarball,
      bin,
      packed_size: pack[0]?.size ?? null,
      unpacked_size: pack[0]?.unpackedSize ?? null,
    },
  };
}

function assertBundle(bundlePath) {
  const firstLine = readFileSync(bundlePath, "utf8").split(/\r?\n/, 1)[0] ?? "";
  if (firstLine !== "#!/usr/bin/env node") {
    throw new Error(`expected Node shebang in ${bundlePath}, got ${JSON.stringify(firstLine)}`);
  }
  if (process.platform !== "win32") {
    const mode = statSync(bundlePath).mode & 0o777;
    if (mode !== 0o755) throw new Error(`expected executable mode 755, got ${mode.toString(8)}`);
  }
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    n: values.length,
    min: sorted[0] ?? null,
    p50: percentileSorted(sorted, 0.5),
    p95: percentileSorted(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? null,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function percentileSorted(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function bootstrapCis(values) {
  return {
    mean: bootstrapCi(values, (sample) => summarize(sample).mean),
    p50: bootstrapCi(values, (sample) => summarize(sample).p50),
    p95: bootstrapCi(values, (sample) => summarize(sample).p95),
  };
}

function bootstrapCi(values, metric) {
  const iterations = Math.max(200, options.bootstrap);
  const rng = mulberry32(0x5eed5eed);
  const estimates = [];
  for (let index = 0; index < iterations; index++) {
    const sample = [];
    for (let draw = 0; draw < values.length; draw++) {
      sample.push(values[Math.floor(rng() * values.length)]);
    }
    estimates.push(metric(sample));
  }
  estimates.sort((left, right) => left - right);
  return {
    lower: percentileSorted(estimates, 0.025),
    upper: percentileSorted(estimates, 0.975),
  };
}

function floorDrift(values) {
  if (values.length === 0) return { block_medians: [], max_relative_delta: 0 };
  const blockSize = Math.max(1, Math.floor(values.length / 4));
  const medians = [];
  for (let index = 0; index < values.length; index += blockSize) {
    medians.push(summarize(values.slice(index, index + blockSize)).p50);
  }
  const first = medians[0] ?? 0;
  const maxRelativeDelta =
    first === 0 ? 0 : Math.max(...medians.map((value) => Math.abs(value - first) / first));
  return { block_medians: medians, max_relative_delta: maxRelativeDelta };
}

function firstLine(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) return line;
  }
  return "";
}

function commandText(command, args, spawnOptions = {}) {
  const result = spawnSync(command, args, { ...spawnOptions, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result.stdout ?? "";
}

function run(command, args, spawnOptions = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...spawnOptions });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function readSize(outDir) {
  try {
    return JSON.parse(readFileSync(path.join(outDir, "size.json"), "utf8"));
  } catch {
    return null;
  }
}

function renderSummary(result, size) {
  const rows = result.cases
    .filter((item) => item.scenario !== "module_load")
    .slice(0, 25)
    .map(
      (item) =>
        `| ${item.variant} | ${item.scenario} | ${item.active_locks} | ${fmt(item.command_ms.p50)} | ${fmt(item.command_ms.p95)} | ${fmt(item.paired_delta_ms.p50)} | ${fmt(item.paired_delta_ms.p95)} |`,
    )
    .join("\n");
  const sizeRows = size
    ? `- raw bundle bytes: ${size.bundle.raw_bytes}
- gzip -9 bundle bytes: ${size.bundle.gzip_9_bytes}
- npm dry-run packed size: ${size.npm_pack_dry_run[0]?.size ?? "unknown"}`
    : "- size.json was not present when this summary was rendered";
  return `# Performance Baseline Summary

- generated_at: ${result.generated_at}
- git_sha: ${result.git_sha}
- clean_worktree: ${result.clean_worktree}
- samples_per_case: ${result.samples_per_case}
- warmups_per_case: ${result.warmups_per_case}

## Size

${sizeRows}

## Latency

| variant | scenario | active locks | command p50 ms | command p95 ms | paired delta p50 ms | paired delta p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows}
`;
}

function fmt(value) {
  return typeof value === "number" ? value.toFixed(2) : "";
}

function parseArgs(args) {
  const parsed = {
    outDir: "analyses/performance-baseline",
    samples: 200,
    warmups: 10,
    bootstrap: 500,
    activeCounts: [0, 1, 10, 100, 1000],
    variants: ["direct", "shim"],
    scenarios: defaultScenarios,
    skipCleanCheck: false,
    selfTest: false,
    help: false,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--self-test") parsed.selfTest = true;
    else if (arg === "--out-dir") parsed.outDir = readValue(args, ++index, arg);
    else if (arg === "--samples") parsed.samples = readInteger(args, ++index, arg);
    else if (arg === "--warmups") parsed.warmups = readInteger(args, ++index, arg);
    else if (arg === "--bootstrap") parsed.bootstrap = readInteger(args, ++index, arg);
    else if (arg === "--active-counts")
      parsed.activeCounts = readList(args, ++index, arg).map(Number);
    else if (arg === "--variants") parsed.variants = readList(args, ++index, arg);
    else if (arg === "--scenarios") parsed.scenarios = readList(args, ++index, arg);
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

function readInteger(args, index, flag) {
  const value = Number.parseInt(readValue(args, index, flag), 10);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${flag} requires a non-negative integer`);
  return value;
}

function readList(args, index, flag) {
  return readValue(args, index, flag)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`usage: node scripts/performance/latency-benchmark.mjs [options]

Options:
  --out-dir <path>        Artifact directory (default: analyses/performance-baseline)
  --samples <n>           Measured samples per case (default: 200)
  --warmups <n>           Warmup samples per case (default: 10)
  --bootstrap <n>         Bootstrap resamples for paired deltas (default: 500)
  --active-counts <list>  Comma-separated active lock counts (default: 0,1,10,100,1000)
  --variants <list>       direct,shim, or both (default: direct,shim)
  --scenarios <list>      Scenario list (default: all)
  --skip-clean-check      Allow a dirty worktree; intended only for tests
  --self-test             Run deterministic helper self-tests
  -h, --help              Show this help`);
}

function runSelfTest() {
  const stats = summarize([1, 2, 3, 4, 5]);
  if (stats.p50 !== 3 || stats.p95 !== 5) throw new Error("summary self-test failed");
  const drift = floorDrift([10, 10, 11, 11]);
  if (drift.block_medians.length === 0) throw new Error("drift self-test failed");
  const ci = bootstrapCis([1, 2, 3, 4, 5]);
  if (typeof ci.mean.lower !== "number" || typeof ci.mean.upper !== "number") {
    throw new Error("bootstrap self-test failed");
  }
}

function mulberry32(seed) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
