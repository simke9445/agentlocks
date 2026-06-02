#!/usr/bin/env node
// Cross-platform conformance scenario runner for the agentlocks V2 release.
//
// This is the black-box gate the CI verify-matrix runs against the INSTALLED
// agentlocks binary on every OS (linux glibc/musl, macOS, Windows). It drives
// the binary as an opaque executable and asserts the real lock lifecycle works,
// so it must stay rock-solid cross-platform. It speaks only the documented CLI
// contract (no imports from src/), runs under both Node and Bun, and has no
// external dependencies.
//
// Contract (the release workflow calls it exactly like this):
//   node scripts/conformance-scenario.mjs "<agentlocks-invocation>" <mode>
//   argv[2] = the agentlocks invocation. A single executable path: an absolute
//             path to the npm-installed launcher shim, the literal "agentlocks"
//             if on PATH, or a Windows ".cmd" shim. Spawned with
//             shell:(platform==="win32") so a .cmd is invocable; on POSIX the
//             binary is exec'd directly (shell:false), so we never assume bash.
//   argv[3] = mode: "basic" or "extended".
//
// Exit 0 only if every assertion passes. On the first failed assertion it prints
// a "FAIL: <what>" line (with captured stdout/stderr) and exits 1. Each satisfied
// assertion prints a "PASS: <step>" line so CI logs stay legible.
//
// Why a real acquire/release (not just --version): a Bun-compiled single-file
// binary's true failure mode is runtime-asset extraction on the FIRST real
// command, which --version/--help bypass. Acquiring and releasing a lock forces
// that prebuilt code path and proves it works on this OS.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const IS_WINDOWS = process.platform === "win32";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const invocation = process.argv[2];
const mode = process.argv[3];

if (!invocation || (mode !== "basic" && mode !== "extended")) {
  console.error(
    'usage: node scripts/conformance-scenario.mjs "<agentlocks-invocation>" <basic|extended>',
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Fresh temp working dir (os.tmpdir + crypto random suffix), used as child cwd
// and cleaned up best-effort at the end. mkdtempSync already appends randomness;
// the extra crypto suffix guarantees a unique prefix even under fast repeats.
// ---------------------------------------------------------------------------

const cwd = mkdtempSync(
  path.join(os.tmpdir(), `agentlocks-conf-${randomBytes(6).toString("hex")}-`),
);
mkdirSync(cwd, { recursive: true });

// The child env always forces the prebuilt path: a Bun single-file binary can
// silently fall back to a host Bun for --version/--help, so disabling that
// fallback makes a green run PROVE the embedded binary did the work.
//
// Identity must be deterministic, which takes a two-part fix to agentlocks'
// owner resolution (see session.ts identifyLockOwner):
//
//   * A detected HARNESS identity (Claude Code / Codex) OUTRANKS an explicit
//     --agent-id. If this script runs inside such a harness (a maintainer's
//     terminal, an agent runner), agent A and agent B would both collapse to
//     the one host session, so the conflict step would self-acquire
//     idempotently (exit 0) instead of conflicting (exit 3). We delete those
//     harness-detection keys so --agent-id is authoritative.
//   * With no identity at all, agentlocks falls back to agentlocks:<host>:<pid>
//     which is a DIFFERENT owner for every child process, so an acquire in one process
//     could not be released by the next. We pin one stable per-run identity via
//     AGENTLOCKS_AGENT_ID so every plain (no --agent-id) invocation in a run
//     shares an owner; the explicit --agent-id flag still overrides it, keeping
//     the conflict step's A and B distinct.
const HARNESS_DETECTION_ENV_KEYS = [
  "AGENTLOCKS_HARNESS_AGENT_ID",
  "CODEX_THREAD_ID",
  "CLAUDE_CODE_SESSION_ID",
];

const childEnv = {
  ...process.env,
  AGENTLOCKS_DISABLE_BUN_FALLBACK: "1",
  AGENTLOCKS_AGENT_ID: `ci-conformance-${randomBytes(4).toString("hex")}`,
};
for (const key of HARNESS_DETECTION_ENV_KEYS) delete childEnv[key];

// ---------------------------------------------------------------------------
// run(args, opts): spawn the agentlocks invocation + args in the temp cwd with
// the forced env, assert the exit code, and print PASS/FAIL. Returns
// {status, stdout, stderr}. On a failed expectation it prints FAIL with the
// captured streams and exits 1 immediately (first-failure semantics).
//
// On Windows the invocation may be a .cmd shim, which only resolves through a
// shell, so spawn with shell:true there and shell:false on POSIX (no bash
// assumption). With shell:true the command line is a single string, so the
// executable and every arg are quoted to survive spaces and shell metacharacters.
// ---------------------------------------------------------------------------

function run(args, { expectExit = 0, label } = {}) {
  const step = label ?? `${args.join(" ")}`;
  const result = IS_WINDOWS
    ? spawnSync(quoteForShell(invocation), args.map(quoteForShell), {
        cwd,
        env: childEnv,
        encoding: "utf8",
        shell: true,
      })
    : spawnSync(invocation, args, {
        cwd,
        env: childEnv,
        encoding: "utf8",
        shell: false,
      });

  // spawnSync sets `.error` when the process could not be spawned at all
  // (e.g. ENOENT on the executable). Treat that as a hard failure.
  if (result.error) {
    fail(`could not spawn invocation for: ${step}`, result.stdout, result.stderr, result.error);
  }

  const status = result.status;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (status !== expectExit) {
    fail(
      `${step} -> expected exit ${expectExit}, got ${status === null ? `null (signal ${result.signal})` : status}`,
      stdout,
      stderr,
    );
  }

  console.log(`PASS: ${step} (exit ${status})`);
  return { status, stdout, stderr };
}

// Bare `git` runner (real git, not agentlocks) for setting up / inspecting the
// repo in the extended scenario. Runs in the temp cwd; shell:false everywhere
// because we pass argv directly and never rely on shell parsing.
function git(args, { expectExit = 0, label } = {}) {
  const step = label ?? `git ${args.join(" ")}`;
  const result = spawnSync("git", args, { cwd, env: childEnv, encoding: "utf8" });
  if (result.error) {
    fail(`could not spawn git for: ${step}`, result.stdout, result.stderr, result.error);
  }
  if (result.status !== expectExit) {
    fail(
      `${step} -> expected exit ${expectExit}, got ${result.status}`,
      result.stdout ?? "",
      result.stderr ?? "",
    );
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// Quote an argument for a Windows cmd.exe command line. Wrap in double quotes
// and escape embedded double quotes; this is enough for the file paths, lock
// ids, and short reasons this scenario passes (no embedded newlines).
function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

// Print a FAIL line with the captured streams and exit 1 (first-failure stop).
// Cleans up the temp dir best-effort on the way out.
function fail(what, stdout = "", stderr = "", error) {
  console.error(`FAIL: ${what}`);
  if (error) console.error(`  error: ${error.message ?? error}`);
  if (stdout?.trim()) console.error(`  stdout:\n${indent(stdout)}`);
  if (stderr?.trim()) console.error(`  stderr:\n${indent(stderr)}`);
  cleanup();
  process.exit(1);
}

function indent(text) {
  return text
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join("\n");
}

// First non-empty trimmed line of a captured stdout. `--id-only` prints the lock
// id as the first line (git begin prints id then fence token on two lines), so
// reading the first non-empty line yields the lock id in every case.
function firstLine(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line) return line;
  }
  return "";
}

function assertLockId(id, label) {
  if (!/^lock_/.test(id)) {
    fail(`${label}: expected a lock id matching /^lock_/, got ${JSON.stringify(id)}`);
  }
  console.log(`PASS: ${label} returned lock id ${id}`);
}

function cleanup() {
  try {
    rmSync(cwd, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Scenario steps
// ---------------------------------------------------------------------------

// mode "basic": the real prebuilt-binary smoke (runtime-asset extraction +
// the lock lifecycle), run on every target.
function runBasic() {
  console.log(`# basic scenario in ${cwd}`);

  // 1. Create an empty file to lock.
  writeFileSync(path.join(cwd, "f.txt"), "");

  // 2. Acquire it with --id-only and capture the printed lock id.
  const acquired = run(["acquire", "f.txt", "--reason", "ci", "--id-only"], {
    label: "acquire f.txt --reason ci --id-only",
  });
  const lockId = firstLine(acquired.stdout);
  assertLockId(lockId, "basic acquire");

  // 3. Release it.
  run(["release", lockId], { label: `release ${lockId}` });
}

// mode "extended": basic plus the cases the Windows port risks: conflict
// rejection, the git-index rename-replace path, and backslash/posix path
// normalization. Run on the Windows leg and anywhere wanting the deep check.
function runExtended() {
  runBasic();
  console.log("# extended scenario");

  extendedConflict();
  extendedGitCommit();
  extendedPathHandling();
}

// 4. Conflict rejection: agent A holds g.txt; a second acquire as agent B must
//    be rejected with exit 3. Release A afterward.
function extendedConflict() {
  writeFileSync(path.join(cwd, "g.txt"), "");

  const aAcquired = run(
    ["acquire", "g.txt", "--reason", "ci", "--agent-id", "ci-agent-A", "--id-only"],
    { label: "acquire g.txt as ci-agent-A --id-only" },
  );
  const aLockId = firstLine(aAcquired.stdout);
  assertLockId(aLockId, "conflict setup (agent A)");

  // The second acquire as a different agent overlaps A's lock -> exit 3.
  run(["acquire", "g.txt", "--reason", "ci", "--agent-id", "ci-agent-B"], {
    expectExit: 3,
    label: "acquire g.txt as ci-agent-B (expect conflict exit 3)",
  });

  // Release A's lock as agent A (the release is identity-scoped).
  run(["release", aLockId, "--agent-id", "ci-agent-A"], {
    label: `release ${aLockId} (agent A)`,
  });
}

// 5. git-index path: init a throwaway repo, stage a file, then exercise the
//    high-level `commit` subcommand (which internally runs git begin -> git add
//    -> git commit -> git end, rewriting the @git/index generation file, one of
//    the two Windows rename-replace sites). Assert the commit lands and the lock
//    is released.
function extendedGitCommit() {
  git(["init", "-q"], { label: "git init" });
  // Default-branch name is git-version dependent; pin it so log assertions are
  // deterministic, then re-checkout in case init already made a differently
  // named branch. -q keeps output quiet.
  git(["symbolic-ref", "HEAD", "refs/heads/main"], { label: "git set branch main" });
  git(["config", "user.name", "CI Conformance"], { label: "git config user.name" });
  git(["config", "user.email", "ci@example.invalid"], { label: "git config user.email" });
  // Make commits work even if a global commit.gpgsign is set on the runner.
  git(["config", "commit.gpgsign", "false"], { label: "git config commit.gpgsign false" });

  // A tracked baseline commit so HEAD exists and `git log` is meaningful.
  writeFileSync(path.join(cwd, "seed.txt"), "seed\n");
  git(["add", "--", "seed.txt"], { label: "git add seed.txt" });
  git(["commit", "-q", "-m", "seed"], { label: "git commit seed" });

  // The file the agentlocks commit will lock, stage, and commit.
  const committed = "committed.txt";
  writeFileSync(path.join(cwd, committed), "committed by agentlocks\n");

  // High-level path: lock + @git/index + stage + commit + release in one verb.
  run(["commit", committed, "--reason", "ci", "-m", "ci commit"], {
    label: `commit ${committed} --reason ci -m "ci commit"`,
  });

  // Assert the commit landed: the file is tracked at HEAD with our message.
  const log = git(["log", "--oneline", "-1"], { label: "git log -1 (after agentlocks commit)" });
  if (!log.stdout.includes("ci commit")) {
    fail("agentlocks commit did not land: latest git log is missing 'ci commit'", log.stdout, "");
  }
  console.log("PASS: agentlocks commit landed in git history");

  const tracked = git(["ls-files", "--", committed], { label: `git ls-files ${committed}` });
  if (firstLine(tracked.stdout) !== committed) {
    fail(`agentlocks commit did not track ${committed}`, tracked.stdout, "");
  }
  console.log(`PASS: ${committed} is tracked at HEAD`);

  // Assert the locks were released: no @git/index lock and no held file lock
  // remain. `status --json` is the machine-readable view.
  assertNoActiveLocks("after agentlocks commit");
}

// 6. Path handling: acquire a path written with the platform's "wrong" separator
//    (a backslash on Windows, a forward slash elsewhere) for a file that exists.
//    resources.ts normalizes backslashes to posix form, so this must succeed on
//    Windows. Release it afterward.
function extendedPathHandling() {
  mkdirSync(path.join(cwd, "sub"), { recursive: true });
  // Write the file using the OS-native join so it really exists on disk...
  writeFileSync(path.join(cwd, "sub", "h.txt"), "");
  // ...but lock it using a backslash separator on Windows / forward slash else,
  // exercising the backslash->posix normalization that the Windows port relies on.
  const lockPath = IS_WINDOWS ? "sub\\h.txt" : "sub/h.txt";

  const acquired = run(["acquire", lockPath, "--reason", "ci", "--id-only"], {
    label: `acquire ${lockPath} --reason ci --id-only`,
  });
  const lockId = firstLine(acquired.stdout);
  assertLockId(lockId, "path-handling acquire");

  run(["release", lockId], { label: `release ${lockId} (path handling)` });
}

// Assert no active locks remain (used after the commit cycle to prove release).
function assertNoActiveLocks(context) {
  const status = run(["status", "--json"], { label: `status --json (${context})` });
  let parsed;
  try {
    parsed = JSON.parse(status.stdout);
  } catch {
    fail(`status --json (${context}) did not emit valid JSON`, status.stdout, status.stderr);
  }
  // The status JSON lists active locks under lock_ids (and a richer `locks`
  // array). Either being non-empty means a lock leaked.
  const lockIds = Array.isArray(parsed.lock_ids) ? parsed.lock_ids : [];
  const locks = Array.isArray(parsed.locks) ? parsed.locks : [];
  if (lockIds.length > 0 || locks.length > 0) {
    fail(
      `${context}: expected no active locks, but status reports ${JSON.stringify(parsed.lock_ids ?? parsed.locks)}`,
      status.stdout,
      status.stderr,
    );
  }
  console.log(`PASS: no active locks remain (${context})`);
}

// ---------------------------------------------------------------------------
// Drive it
// ---------------------------------------------------------------------------

try {
  if (mode === "basic") {
    runBasic();
  } else {
    runExtended();
  }
  console.log(`PASS: all ${mode} assertions passed`);
  cleanup();
  process.exit(0);
} catch (error) {
  // Any unexpected throw is a failure; report and clean up.
  fail(
    "unexpected error during scenario",
    "",
    "",
    error instanceof Error ? error : new Error(String(error)),
  );
}
