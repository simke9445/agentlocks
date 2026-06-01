#!/usr/bin/env node
// Launcher for the agentlocks CLI.
//
// agentlocks ships a self-contained, Bun-embedded binary per platform (the
// agentlocks-<platform> optional dependencies). This Node launcher resolves the
// binary for the current platform and execs it, so a plain `npm i -g agentlocks`
// works with no Bun on the user's machine. If no prebuilt binary is installed
// (an unsupported platform, or a dev/`npm link` checkout) it falls back to
// running the TypeScript entry under Bun, and prints an actionable error when
// neither a prebuilt binary nor Bun is available.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const exeName = process.platform === "win32" ? "agentlocks.exe" : "agentlocks";
const platformPackage = `agentlocks-${process.platform}-${process.arch}`;

function resolvePrebuiltBinary() {
  try {
    return require.resolve(`${platformPackage}/bin/${exeName}`);
  } catch {
    return null;
  }
}

function findBun() {
  const candidates = [];
  if (process.env.BUN_INSTALL) candidates.push(path.join(process.env.BUN_INSTALL, "bin", "bun"));
  if (process.env.HOME) candidates.push(path.join(process.env.HOME, ".bun", "bin", "bun"));
  candidates.push("/opt/homebrew/bin/bun", "/usr/local/bin/bun");
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const lookup = spawnSync(process.platform === "win32" ? "where" : "which", ["bun"], {
    encoding: "utf8",
  });
  if (lookup.status === 0) {
    const first = lookup.stdout.split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) return first;
  }
  return null;
}

// Run a resolved executable, forwarding stdio + exit status. Returns the spawn error (without
// exiting) when the binary could not be started, so the caller can fall through to the next
// option instead of crashing with a raw stack trace.
function exec(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) return result.error;
  if (result.signal) {
    // Re-raise so our exit reflects how the child died (e.g. SIGINT) rather than a plain code.
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status === null ? 1 : result.status);
}

const prebuilt = resolvePrebuiltBinary();
if (prebuilt) {
  const error = exec(prebuilt, args);
  // exec only returns on a spawn failure (corrupt / non-executable / arch-mismatch binary) —
  // warn and fall through to Bun rather than dying with an unhandled error.
  process.stderr.write(
    `agentlocks: prebuilt binary failed to start (${error.code ?? error.message}); trying Bun.\n`,
  );
}

const sourceEntry = path.join(here, "agentlocks.ts");
if (process.env.AGENTLOCKS_DISABLE_BUN_FALLBACK !== "1" && existsSync(sourceEntry)) {
  const bun = findBun();
  if (bun) exec(bun, [sourceEntry, ...args]);
}

process.stderr.write(
  [
    `agentlocks: no runnable binary for ${process.platform}-${process.arch}.`,
    "",
    `The prebuilt package "${platformPackage}" is not installed (optional`,
    "dependencies may have been skipped, or this platform has no prebuilt binary).",
    "",
    "Fix it with either:",
    "  - reinstall and allow optional dependencies:  npm install -g agentlocks",
    "  - install Bun (https://bun.sh) and re-run; agentlocks will use it directly.",
    "",
  ].join("\n"),
);
process.exit(1);
