import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FileLockRegistry,
  gitIndexToken,
  identifyLockOwner,
  isReliableOwnerIdentity,
  resourceCovers,
  resourcesCover,
  runGitVerify,
} from "../src/index";
import type { GitVerifyReport, LockOperationResult } from "../src/locks/types";

async function withWorkspace<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lockpick-040-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function registry(cwd: string, env: NodeJS.ProcessEnv = {}): FileLockRegistry {
  return new FileLockRegistry({ cwd, env, fallbackOwnerPrefix: "lockpick" });
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function initRepo(cwd: string): void {
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "t@t.co");
  git(cwd, "config", "user.name", "t");
}

const AGENT_A = { LOCKPICK_AGENT_ID: "agent-A" };
const AGENT_B = { LOCKPICK_AGENT_ID: "agent-B" };

// ─────────────────────────────────────────── F1 ───────────────────────────────────────────

test("F1 resourceCovers is direction-aware (not symmetric overlap)", () => {
  const glob = { kind: "glob", value: "src/**" } as const;
  const narrow = { kind: "path", value: "src/a.ts" } as const;
  const broaderGlob = { kind: "glob", value: "src/**/*.ts" } as const;
  // held glob covers a concrete path it matches
  expect(resourceCovers(glob, narrow)).toBe(true);
  // held narrow path does NOT cover a broader glob request
  expect(resourceCovers(narrow, glob)).toBe(false);
  // held path covers only the equal path
  expect(resourceCovers(narrow, { kind: "path", value: "src/a.ts" })).toBe(true);
  expect(resourceCovers(narrow, { kind: "path", value: "src/b.ts" })).toBe(false);
  // glob-vs-glob is exact-equality only (globMatches is not language containment)
  expect(resourceCovers(glob, broaderGlob)).toBe(false);
  expect(resourceCovers(glob, { kind: "glob", value: "src/**" })).toBe(true);
  // @git/index covers only @git/index
  expect(resourceCovers({ kind: "git", value: "@git/index" }, narrow)).toBe(false);
  expect(resourcesCover([glob], [narrow])).toBe(true);
  expect(resourcesCover([narrow], [glob])).toBe(false);
});

test("F1 re-acquiring your own path is idempotent (same id, exit 0)", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const first = await reg.acquire({ paths: ["a.ts"], reason: "first" });
    const second = await reg.acquire({ paths: ["a.ts"], reason: "retry" });
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(second.lock?.lockId).toBe(first.lock?.lockId);
  });
});

test("F1 a broader request over your own narrow lock still conflicts (exit 3)", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    await reg.acquire({ paths: ["src/a.ts"], reason: "narrow" });
    const broad = await reg.acquire({ globs: ["src/**"], reason: "broad" });
    expect(broad.exitCode).toBe(3); // held path does not cover the broader glob
  });
});

test("F1 a held glob covers a re-acquired concrete path (idempotent)", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const glob = await reg.acquire({ globs: ["src/**"], reason: "glob" });
    const concrete = await reg.acquire({ paths: ["src/a.ts"], reason: "concrete" });
    expect(concrete.exitCode).toBe(0);
    expect(concrete.lock?.lockId).toBe(glob.lock?.lockId);
  });
});

test("F1 another agent's overlapping lock still conflicts (not idempotent)", async () => {
  await withWorkspace(async (dir) => {
    await registry(dir, AGENT_A).acquire({ paths: ["a.ts"], reason: "A" });
    const b = await registry(dir, AGENT_B).acquire({ paths: ["a.ts"], reason: "B" });
    expect(b.exitCode).toBe(3);
  });
});

// ─────────────────────────────────────────── F2 ───────────────────────────────────────────

test("F2 isReliableOwnerIdentity excludes fallback and bare Claude session", () => {
  const fallback = identifyLockOwner({ cwd: "/tmp", env: {} });
  expect(fallback.source).toBe("fallback");
  expect(isReliableOwnerIdentity(fallback)).toBe(false);

  const session = identifyLockOwner({ cwd: "/tmp", env: { CLAUDE_CODE_SESSION_ID: "s1" } });
  expect(session.harnessScope).toBe("session");
  expect(isReliableOwnerIdentity(session)).toBe(false);

  const explicit = identifyLockOwner({ cwd: "/tmp", env: { LOCKPICK_AGENT_ID: "alice" } });
  expect(isReliableOwnerIdentity(explicit)).toBe(true);
});

test("F2 status --mine shows only the caller's locks", async () => {
  await withWorkspace(async (dir) => {
    await registry(dir, AGENT_A).acquire({ paths: ["a.ts"], reason: "A" });
    await registry(dir, AGENT_B).acquire({ paths: ["b.ts"], reason: "B" });
    const mine = await registry(dir, AGENT_A).status({}, { mine: true });
    expect(mine.locks?.length).toBe(1);
    expect(mine.locks?.[0]?.lock.owner.agentId).toBe("agent-A");
  });
});

test("F2 release --mine drops every lock the caller holds; no-op when none", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    await reg.acquire({ paths: ["a.ts"], reason: "A" });
    await reg.acquire({ paths: ["b.ts"], reason: "A2" });
    await registry(dir, AGENT_B).acquire({ paths: ["c.ts"], reason: "B" });

    const released = await reg.releaseMine();
    expect(released.exitCode).toBe(0);
    expect(released.affectedLocks?.length).toBe(2);
    // B's lock is untouched.
    expect((await registry(dir, AGENT_B).status({}, { mine: true })).locks?.length).toBe(1);
    // Second release --mine is a clean no-op.
    const again = await reg.releaseMine();
    expect(again.exitCode).toBe(0);
    expect(again.affectedLocks?.length).toBe(0);
  });
});

test("F2 release/refresh --mine reject an unreliable (fallback) identity with exit 2", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, {}); // no identity → fallback
    await expect(reg.releaseMine()).rejects.toMatchObject({ exitCode: 2 });
    await expect(reg.refreshMine()).rejects.toMatchObject({ exitCode: 2 });
  });
});

// ─────────────────────────────────────────── F3 ───────────────────────────────────────────

async function verify(
  reg: FileLockRegistry,
  dir: string,
  opts: Partial<Parameters<typeof runGitVerify>[1]> = {},
): Promise<GitVerifyReport> {
  const result = await runGitVerify(reg, {
    cwd: dir,
    includeUnstaged: false,
    pathspec: [],
    pathspecMode: null,
    ...opts,
  });
  return result.verify as GitVerifyReport;
}

test("F3 git verify flags a staged-but-unlocked path", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "b.ts"), "hi\n");
    git(dir, "add", "b.ts");
    const report = await verify(registry(dir, AGENT_A), dir);
    expect(report.state).toBe("ordinary");
    expect(report.uncovered.map((u) => u.path)).toEqual(["b.ts"]);
    expect(report.covered).toEqual([]);
  });
});

test("F3 a held lock covers the staged path, annotated owned_by_caller", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "b.ts"), "hi\n");
    git(dir, "add", "b.ts");
    const reg = registry(dir, AGENT_A);
    await reg.acquire({ paths: ["b.ts"], reason: "edit" });
    const report = await verify(reg, dir);
    expect(report.uncovered).toEqual([]);
    expect(report.covered.map((c) => c.path)).toEqual(["b.ts"]);
    expect(report.covered[0]?.coveredBy.ownedByCaller).toBe(true);
  });
});

test("F3 a path covered only by another agent lands in foreign_covered", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "b.ts"), "hi\n");
    git(dir, "add", "b.ts");
    await registry(dir, AGENT_B).acquire({ paths: ["b.ts"], reason: "B holds it" });
    const report = await verify(registry(dir, AGENT_A), dir);
    expect(report.uncovered).toEqual([]);
    expect(report.foreignCovered.map((c) => c.path)).toEqual(["b.ts"]);
    expect(report.foreignCovered[0]?.coveredBy.ownedByCaller).toBe(false);
  });
});

test("F3 commit -a effective set: --include-unstaged catches a tracked-but-unstaged change", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "tracked.ts"), "v1\n");
    git(dir, "add", "tracked.ts");
    git(dir, "commit", "-q", "-m", "base");
    await writeFile(path.join(dir, "tracked.ts"), "v2\n"); // modified, NOT staged
    const reg = registry(dir, AGENT_A);
    // Plain verify (staged only) sees nothing.
    expect((await verify(reg, dir)).state).toBe("no_staged_changes");
    // --include-unstaged (commit -a) sees the tracked change as uncovered.
    const report = await verify(reg, dir, { includeUnstaged: true });
    expect(report.uncovered.map((u) => u.path)).toEqual(["tracked.ts"]);
  });
});

test("F3 a reclaimable (dead) lock does NOT cover a staged path", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "b.ts"), "hi\n");
    git(dir, "add", "b.ts");
    // Acquire a lock covering b.ts with timestamps in the past and a "dead" liveness probe,
    // so it classifies as reclaimable when read in the present.
    const deadProbe = async () => ({ status: "dead" as const, evidence: "test" });
    const past = new Date(Date.now() - 3_600_000);
    const staleReg = new FileLockRegistry({
      cwd: dir,
      env: AGENT_A,
      sessionProbe: deadProbe,
      now: () => past,
    });
    await staleReg.acquire({ paths: ["b.ts"], reason: "stale", ttlMs: 1000 });
    const verifyReg = new FileLockRegistry({ cwd: dir, env: AGENT_A, sessionProbe: deadProbe });
    const report = await verify(verifyReg, dir);
    expect(report.uncovered.map((u) => u.path)).toEqual(["b.ts"]); // reclaimable lock excluded
    expect(report.covered).toEqual([]);
  });
});

test("F3 merge/sequencer in progress is skipped", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "a.ts"), "a\n");
    git(dir, "add", "a.ts");
    git(dir, "commit", "-q", "-m", "base");
    await writeFile(path.join(dir, ".git", "MERGE_HEAD"), "deadbeef\n");
    const report = await verify(registry(dir, AGENT_A), dir);
    expect(report.state).toBe("merge_or_sequencer");
  });
});

test("F3 --pathspec resolves relative to the invocation cwd, not the repo root", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await mkdir(path.join(dir, "packages/app"), { recursive: true });
    await writeFile(path.join(dir, "packages/app/a.ts"), "one\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "base");
    await writeFile(path.join(dir, "packages/app/a.ts"), "two\n"); // modified, unstaged
    // Run verify from the SUBDIR with a subdir-relative pathspec (as the hook's effective cwd does).
    const report = await verify(registry(dir, AGENT_A), dir, {
      cwd: path.join(dir, "packages/app"),
      pathspec: ["a.ts"],
      pathspecMode: "only",
    });
    expect(report.uncovered.map((u) => u.path)).toEqual(["packages/app/a.ts"]);
  });
});

test("F3 git verify never writes .lockpick/ and always exits 0", async () => {
  await withWorkspace(async (dir) => {
    initRepo(dir);
    await writeFile(path.join(dir, "b.ts"), "hi\n");
    git(dir, "add", "b.ts");
    const result = await runGitVerify(registry(dir, AGENT_A), {
      cwd: dir,
      includeUnstaged: false,
      pathspec: [],
      pathspecMode: null,
    });
    expect(result.exitCode).toBe(0);
    // No active dir was created by the read-only path.
    expect(spawnSync("test", ["-d", path.join(dir, ".lockpick/locks/active")]).status).not.toBe(0);
  });
});

// ─────────────────────────────────────────── F4 ───────────────────────────────────────────

function tokenOf(result: LockOperationResult): string {
  return result.gitToken ?? "";
}

test("F4 git begin stamps a generation + returns a shell-safe token", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const begin = await reg.acquire({ includeGitIndex: true, reason: "commit" });
    expect(begin.lock?.generation).toBe(1);
    expect(tokenOf(begin)).toBe(gitIndexToken(1));
    expect(/^g\d+$/.test(tokenOf(begin))).toBe(true);
  });
});

test("F4 idempotent git begin still returns the same fence token", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const first = await reg.acquire({ includeGitIndex: true, reason: "first" });
    const second = await reg.acquire({ includeGitIndex: true, reason: "retry" });
    expect(second.lock?.lockId).toBe(first.lock?.lockId); // idempotent re-begin
    expect(tokenOf(second)).toBe(tokenOf(first)); // token preserved (not dropped)
    expect(tokenOf(second)).toBe(gitIndexToken(1));
  });
});

test("F4 verifyGitIndexToken: correct token passes, wrong token aborts exit 3", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const begin = await reg.acquire({ includeGitIndex: true, reason: "commit" });
    const id = begin.lock?.lockId as string;
    const ok = await reg.verifyGitIndexToken(id, tokenOf(begin), null, { refresh: true });
    expect(ok.exitCode).toBe(0);
    await expect(reg.verifyGitIndexToken(id, "g999", null, {})).rejects.toMatchObject({
      exitCode: 3,
    });
  });
});

test("F4 a reclaimed @git/index lease fails the fence (exit 3) and bumps the counter", async () => {
  await withWorkspace(async (dir) => {
    const reg = registry(dir, AGENT_A);
    const begin = await reg.acquire({ includeGitIndex: true, reason: "commit" });
    const id = begin.lock?.lockId as string;
    // Simulate a reclaim: drop the lease, then a fresh acquire mints a higher generation.
    await reg.release(id, null);
    const reBegin = await reg.acquire({ includeGitIndex: true, reason: "commit-2" });
    expect((reBegin.lock?.generation as number) > 1).toBe(true);
    // The old lease id is gone → its token can never verify.
    await expect(reg.verifyGitIndexToken(id, tokenOf(begin), null, {})).rejects.toMatchObject({
      exitCode: 3,
    });
  });
});
