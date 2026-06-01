#!/usr/bin/env bun
// Install smoke test: build this platform's self-contained binary, lay it out
// exactly as `npm i -g agentlocks` would (the main package plus the
// agentlocks-<platform> optional dependency under node_modules), then run the
// Node launcher with NO Bun reachable and assert the CLI works end to end —
// including loading a .ts config from a host repo. CI runs this on each OS.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platformDir = `${process.platform}-${process.arch}`;
const exeName = process.platform === "win32" ? "agentlocks.exe" : "agentlocks";
const platformPackage = `agentlocks-${platformDir}`;

function fail(message, detail) {
  console.error(`SMOKE FAIL: ${message}`);
  if (detail) console.error(String(detail).trim());
  process.exit(1);
}

// Resolve node from the full environment before we strip PATH for the no-Bun run.
const nodeLookup = spawnSync("which", ["node"], { encoding: "utf8" });
const nodeExe = nodeLookup.status === 0 ? nodeLookup.stdout.split(/\r?\n/)[0].trim() : "node";

// 1. Build this platform's binary.
console.log(`[smoke] building ${platformDir} binary`);
const build = spawnSync("bun", [path.join(root, "scripts", "build-binaries.mjs"), platformDir], {
  stdio: "inherit",
});
if (build.status !== 0) fail("binary build failed");
const builtBinary = path.join(root, "npm", platformDir, "bin", exeName);
if (!existsSync(builtBinary)) fail(`built binary missing at ${builtBinary}`);

// 2. Stage a fake global install: node_modules/{agentlocks, agentlocks-<platform>}.
//    AGENTLOCKS_DISABLE_BUN_FALLBACK=1 (set below) makes the launcher refuse the Bun fallback
//    entirely, so a green run PROVES the prebuilt binary did the work — a stripped PATH + clean
//    HOME alone are not enough, since findBun also probes absolute paths like /opt/homebrew/bin/bun.
const stage = mkdtempSync(path.join(os.tmpdir(), "agentlocks-smoke-"));
const home = path.join(stage, "home");
mkdirSync(home, { recursive: true });
const mainPkg = path.join(stage, "node_modules", "agentlocks");
const platPkg = path.join(stage, "node_modules", platformPackage);
mkdirSync(path.join(mainPkg, "bin"), { recursive: true });
mkdirSync(path.join(platPkg, "bin"), { recursive: true });
cpSync(path.join(root, "bin", "agentlocks.mjs"), path.join(mainPkg, "bin", "agentlocks.mjs"));
cpSync(builtBinary, path.join(platPkg, "bin", exeName));
writeFileSync(
  path.join(mainPkg, "package.json"),
  JSON.stringify({
    name: "agentlocks",
    version: "0.0.0",
    bin: { agentlocks: "bin/agentlocks.mjs" },
  }),
);
writeFileSync(
  path.join(platPkg, "package.json"),
  JSON.stringify({ name: platformPackage, version: "0.0.0" }),
);
const launcher = path.join(mainPkg, "bin", "agentlocks.mjs");
const noBunEnv = { PATH: "/usr/bin:/bin", HOME: home, AGENTLOCKS_DISABLE_BUN_FALLBACK: "1" };

// 3. --help via the prebuilt binary, no Bun.
const help = spawnSync(nodeExe, [launcher, "--help"], { env: noBunEnv, encoding: "utf8" });
if (help.status !== 0) fail("`--help` exited nonzero with no Bun", help.stderr);
if (!help.stdout.includes("agentlocks")) fail("`--help` output missing expected text", help.stdout);
console.log("[smoke] OK: --help ran via the prebuilt binary with no Bun");

// 4. A config-loading command in a host repo with a .ts config, no Bun.
const hostRepo = path.join(stage, "host");
mkdirSync(hostRepo, { recursive: true });
spawnSync("git", ["init", "-q"], { cwd: hostRepo });
writeFileSync(
  path.join(hostRepo, "agentlocks.config.ts"),
  'export default { projectName: "smoke" };\n',
);
const status = spawnSync(nodeExe, [launcher, "status", "--json"], {
  cwd: hostRepo,
  env: noBunEnv,
  encoding: "utf8",
});
if (status.status !== 0) fail("`status --json` exited nonzero with no Bun", status.stderr);
try {
  JSON.parse(status.stdout);
} catch {
  fail("`status --json` did not emit valid JSON", status.stdout);
}
console.log("[smoke] OK: status --json loaded a .ts config via the prebuilt binary with no Bun");

rmSync(stage, { recursive: true, force: true });
console.log("[smoke] PASS");
