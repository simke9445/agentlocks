import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  executeLockCommand,
  FileLockRegistry,
  type LockOwner,
  resolveAgentlocksConfig,
} from "../src/index";
import { probeCodexSessionLiveness } from "../src/locks/session";

// Concurrency + correctness hardening for the lock core (Step 4 audit). Each executeLockCommand
// builds its own registry, so a Promise.all of N calls contends on the real atomic-mkdir
// .mutex exactly as N separate processes would — a faithful in-process model of the
// multi-process mutual exclusion the mutex exists to provide.
async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-conc-"));
  try {
    await fn(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function acquire(
  workspace: string,
  config: ReturnType<typeof resolveAgentlocksConfig>,
  paths: string[],
  agentId: string,
) {
  return executeLockCommand(
    {
      name: "acquire",
      paths,
      globs: [],
      reason: "race",
      ttlMs: 600_000,
      agentId,
      json: true,
      idOnly: false,
    },
    { cwd: workspace, config },
  );
}

test("concurrent same-path acquires: exactly one wins (mutex mutual exclusion)", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const K = 12;
    const results = await Promise.all(
      Array.from({ length: K }, (_, i) => acquire(workspace, config, ["hot.ts"], `agent-${i}`)),
    );
    expect(results.filter((r) => r.exitCode === 0)).toHaveLength(1);
    expect(results.filter((r) => r.exitCode === 3)).toHaveLength(K - 1);
    const status = await executeLockCommand(
      { name: "status", paths: [], globs: [], json: true, idOnly: false },
      { cwd: workspace, config },
    );
    expect((status.json as { lock_count: number }).lock_count).toBe(1);
  });
});

test("concurrent distinct-path acquires all succeed without torn state", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const K = 12;
    const results = await Promise.all(
      Array.from({ length: K }, (_, i) =>
        acquire(workspace, config, [`file-${i}.ts`], `agent-${i}`),
      ),
    );
    expect(results.every((r) => r.exitCode === 0)).toBe(true);
    const status = await executeLockCommand(
      { name: "status", paths: [], globs: [], json: true, idOnly: false },
      { cwd: workspace, config },
    );
    expect((status.json as { lock_count: number }).lock_count).toBe(K);
  });
});

test("concurrent git begin: exactly one holds @git/index", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const K = 8;
    const results = await Promise.all(
      Array.from({ length: K }, (_, i) =>
        executeLockCommand(
          {
            name: "git-begin",
            reason: "commit",
            ttlMs: 600_000,
            agentId: `agent-${i}`,
            refreshLockIds: [],
            json: true,
            idOnly: false,
          },
          { cwd: workspace, config },
        ),
      ),
    );
    expect(results.filter((r) => r.exitCode === 0)).toHaveLength(1);
    expect(results.filter((r) => r.exitCode === 3)).toHaveLength(K - 1);
  });
});

test("@git/index generation advances across begin/end/begin (fence token monotonic)", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const begin1 = await executeLockCommand(
      {
        name: "git-begin",
        reason: "c1",
        ttlMs: null,
        agentId: "a",
        refreshLockIds: [],
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config },
    );
    expect(begin1.exitCode).toBe(0);
    const token1 = (begin1.json as { git_token: string }).git_token;
    const lock1 = (begin1.json as { lock_id: string }).lock_id;
    await executeLockCommand(
      {
        name: "git-end",
        lockIds: [lock1],
        releaseLockIds: [],
        agentId: "a",
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config },
    );
    const begin2 = await executeLockCommand(
      {
        name: "git-begin",
        reason: "c2",
        ttlMs: null,
        agentId: "a",
        refreshLockIds: [],
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config },
    );
    expect(begin2.exitCode).toBe(0);
    expect((begin2.json as { git_token: string }).git_token).not.toBe(token1);
  });
});

// --- F2: stale-mutex reclaim consults owner.json liveness (not mtime alone) ---

async function plantStaleMutex(
  workspace: string,
  owner: Record<string, unknown>,
  ageMs: number,
): Promise<void> {
  const mutexDir = path.join(workspace, ".agentlocks/locks/.mutex");
  await mkdir(mutexDir, { recursive: true });
  await writeFile(path.join(mutexDir, "owner.json"), `${JSON.stringify(owner)}\n`, "utf8");
  const past = new Date(Date.now() - ageMs);
  await utimes(mutexDir, past, past);
}

test("a stale mutex owned by a DEAD pid is reclaimed", async () => {
  await withWorkspace(async (workspace) => {
    await plantStaleMutex(
      workspace,
      { hostname: os.hostname(), pid: 2_147_483_646, nonce: "x" },
      60_000,
    );
    const registry = new FileLockRegistry({
      cwd: workspace,
      mutexRetry: { attempts: 4, sleepMs: 5 },
    });
    const result = await registry.acquire({ paths: ["a.ts"], reason: "edit", agentId: "agent-a" });
    expect(result.exitCode).toBe(0);
  });
});

test("a stale mutex owned by a LIVE same-host pid is NOT reclaimed (waiter fails safe)", async () => {
  await withWorkspace(async (workspace) => {
    await plantStaleMutex(
      workspace,
      { hostname: os.hostname(), pid: process.pid, nonce: "x" },
      60_000,
    );
    const registry = new FileLockRegistry({
      cwd: workspace,
      mutexRetry: { attempts: 4, sleepMs: 5 },
    });
    await expect(
      registry.acquire({ paths: ["a.ts"], reason: "edit", agentId: "agent-a" }),
    ).rejects.toThrow("Timed out");
  });
});

test("a stale mutex owned by a DIFFERENT host is reclaimed (foreign liveness unverifiable)", async () => {
  await withWorkspace(async (workspace) => {
    await plantStaleMutex(
      workspace,
      { hostname: `${os.hostname()}-elsewhere`, pid: process.pid, nonce: "x" },
      60_000,
    );
    const registry = new FileLockRegistry({
      cwd: workspace,
      mutexRetry: { attempts: 4, sleepMs: 5 },
    });
    const result = await registry.acquire({ paths: ["a.ts"], reason: "edit", agentId: "agent-a" });
    expect(result.exitCode).toBe(0);
  });
});

// --- F4: Codex probe maps a present-but-stale session to "unknown" (grace), not "dead" ---

test("Codex probe: present-but-stale session is 'unknown' (grace), missing is 'dead'", async () => {
  await withWorkspace(async (workspace) => {
    const codexHome = path.join(workspace, "codex");
    await mkdir(codexHome, { recursive: true });
    const sessionId = "sess-abc";
    const staleUpdatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await writeFile(
      path.join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({ id: sessionId, updated_at: staleUpdatedAt })}\n`,
      "utf8",
    );
    const baseOwner: LockOwner = {
      agentId: `codex:${sessionId}`,
      hostname: os.hostname(),
      pid: process.pid,
      cwd: workspace,
      source: "harness:codex:CODEX_THREAD_ID",
      harness: "codex",
      harnessScope: "agent",
      rawSessionId: sessionId,
    };
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = codexHome;
    try {
      const stale = await probeCodexSessionLiveness(baseOwner, new Date());
      expect(stale.status).toBe("unknown");
      const missing = await probeCodexSessionLiveness(
        { ...baseOwner, agentId: "codex:gone", rawSessionId: "gone" },
        new Date(),
      );
      expect(missing.status).toBe("dead");
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
    }
  });
});

// --- Fuzz: random concurrent churn stays consistent and mutually exclusive ---

test("randomized concurrent churn stays consistent and still mutually exclusive (fuzz)", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    // Deterministic LCG so any failure reproduces.
    let seed = 0x1f2e3d4c;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const PATHS = ["p0.ts", "p1.ts", "p2.ts"];
    const AGENTS = ["x", "y", "z", "w"];
    for (let round = 0; round < 12; round++) {
      const ops = Array.from({ length: 6 }, () => {
        const agentId = AGENTS[Math.floor(rnd() * AGENTS.length)] as string;
        if (rnd() < 0.55) {
          const p = PATHS[Math.floor(rnd() * PATHS.length)] as string;
          return acquire(workspace, config, [p], agentId);
        }
        return executeLockCommand(
          { name: "release", lockIds: [], mine: true, agentId, json: true, idOnly: false },
          { cwd: workspace, config },
        );
      });
      const results = await Promise.all(ops);
      // No op crashed; the registry is never wedged or corrupted.
      expect(results.every((r) => typeof r.exitCode === "number")).toBe(true);
      const status = await executeLockCommand(
        { name: "status", paths: [], globs: [], json: true, idOnly: false },
        { cwd: workspace, config },
      );
      const snapshot = status.json as { lock_count: number; lock_ids: string[] };
      // Non-tautological: lock ids must be unique (no torn or duplicate records under churn).
      expect(new Set(snapshot.lock_ids).size).toBe(snapshot.lock_ids.length);
      expect(snapshot.lock_count).toBe(snapshot.lock_ids.length);
    }
    // After heavy churn the mutex still enforces mutual exclusion on a fresh hot path.
    const final = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        acquire(workspace, config, ["after-churn.ts"], `final-${i}`),
      ),
    );
    expect(final.filter((r) => r.exitCode === 0)).toHaveLength(1);
  });
});
