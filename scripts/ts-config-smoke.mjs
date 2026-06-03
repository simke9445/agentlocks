#!/usr/bin/env node
// Engine/config-contract proof, run against an INSTALLED agentlocks bin on the
// host Node. A scaffolded `agentlocks.config.ts` (plain `export default {...}`)
// must load via Node's type-stripping + the loader's `?mtime` file-URL query, and
// an invalid value must be REJECTED (proving the config is parsed + validated, not
// silently ignored). Run on the MINIMUM supported Node (22.18.0) in CI, a green
// run proves type-stripping works there — the contract behind `engines.node >=22.18`.
//
//   node scripts/ts-config-smoke.mjs "<agentlocks-invocation>"
//
// Invocation handling mirrors scripts/conformance-scenario.mjs: a non-".exe"
// invocation on Windows is an npm ".cmd" shim that resolves only through a shell.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const invocation = process.argv[2];
if (!invocation) {
  console.error('usage: node scripts/ts-config-smoke.mjs "<agentlocks-invocation>"');
  process.exit(2);
}

const IS_WINDOWS = process.platform === "win32";
const USE_SHELL = IS_WINDOWS && !/\.exe$/i.test(invocation);

// Quote a token for a shell command line (only used on the Windows .cmd path).
function quoteForShell(arg) {
  return /[^A-Za-z0-9_./:\\-]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function statusJson(cwd) {
  const args = ["status", "--json"];
  return USE_SHELL
    ? spawnSync(quoteForShell(invocation), args.map(quoteForShell), {
        cwd,
        encoding: "utf8",
        shell: true,
      })
    : spawnSync(invocation, args, { cwd, encoding: "utf8" });
}

function fail(message, result) {
  console.error(`FAIL: ${message}`);
  if (result) {
    console.error(`  exit: ${result.status}`);
    if (result.error) console.error(`  error: ${result.error.message}`);
    console.error(`  stdout: ${result.stdout}`);
    console.error(`  stderr: ${result.stderr}`);
  }
  process.exit(1);
}

// 1) A valid .ts config must load (type-strip + ?mtime) and yield valid status JSON.
//    The `123_000` numeric separator is TS/JS syntax that only survives type-stripping.
const okDir = mkdtempSync(path.join(os.tmpdir(), "al-tsconfig-ok-"));
writeFileSync(
  path.join(okDir, "agentlocks.config.ts"),
  'export default { projectName: "ts-smoke", defaults: { ttlMs: 123_000 } };\n',
);
const ok = statusJson(okDir);
if (ok.error || ok.status !== 0) fail("valid .ts config: status did not exit 0", ok);
let parsed;
try {
  parsed = JSON.parse(ok.stdout);
} catch {
  fail("valid .ts config: status did not emit valid JSON (config failed to load?)", ok);
}
if (parsed.kind !== "status") fail("valid .ts config: unexpected status payload", ok);
console.log(`PASS: valid .ts config loaded under Node ${process.version} (status JSON ok)`);

// 2) An invalid value must be REJECTED — proves the .ts is parsed + validated, not ignored.
const badDir = mkdtempSync(path.join(os.tmpdir(), "al-tsconfig-bad-"));
writeFileSync(
  path.join(badDir, "agentlocks.config.ts"),
  'export default { defaults: { ttlMs: "nope" } };\n',
);
const bad = statusJson(badDir);
const sawRejection =
  bad.status !== 0 || /cli_error|must be a number|ttlMs/.test(`${bad.stdout}${bad.stderr}`);
if (!sawRejection) fail("invalid .ts config was NOT rejected (config silently ignored?)", bad);
console.log("PASS: invalid .ts config rejected (load + validate confirmed)");
console.log("ts-config-smoke: OK");
