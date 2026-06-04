import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  executeLockCommand,
  FileLockRegistry,
  type LockOwner,
  lockOwnerAgentId,
  lockOwnerSource,
  normalizeLockResources,
  renderLockResult,
  resolveAgentlocksConfig,
  resourcesConflict,
} from "../src/index";

test("normalizes safe repo-relative path and glob resources", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await writeFile(path.join(workspace, "src", "existing.ts"), "export {};\n", "utf8");

    const resources = await normalizeLockResources({
      cwd: workspace,
      resourceSpecs: [
        "./src/existing.ts",
        "src/new.ts",
        "future/output.md",
        "src/**/*.test.ts",
        "analyses/trending-baseline/**",
      ],
    });

    expect(resources).toEqual([
      { kind: "path", value: "src/existing.ts" },
      { kind: "path", value: "src/new.ts" },
      { kind: "path", value: "future/output.md" },
      { kind: "glob", value: "src/**/*.test.ts" },
      { kind: "glob", value: "analyses/trending-baseline/**" },
    ]);
    await expect(
      normalizeLockResources({ cwd: workspace, resourceSpecs: ["/tmp/outside.ts"] }),
    ).rejects.toThrow("repo-relative");
    await expect(
      normalizeLockResources({ cwd: workspace, resourceSpecs: ["../outside.ts"] }),
    ).rejects.toThrow("inside the repository");
  });
});

test("detects exact, path-glob, conservative glob, and git-index conflicts", () => {
  expect(
    resourcesConflict(
      { kind: "path", value: "src/locks/registry.ts" },
      { kind: "path", value: "src/locks/registry.ts" },
    ),
  ).toBe(true);
  expect(
    resourcesConflict(
      { kind: "path", value: "src/locks/registry.ts" },
      { kind: "glob", value: "src/**/*.ts" },
    ),
  ).toBe(true);
  expect(
    resourcesConflict(
      { kind: "glob", value: "src/locks/**/*.ts" },
      { kind: "glob", value: "src/**/*.ts" },
    ),
  ).toBe(true);
  expect(
    resourcesConflict(
      { kind: "glob", value: "src/**/*.ts" },
      { kind: "glob", value: "tests/**/*.ts" },
    ),
  ).toBe(false);
  expect(
    resourcesConflict({ kind: "glob", value: "src/[ab].ts" }, { kind: "path", value: "src/a.ts" }),
  ).toBe(true);
  expect(
    resourcesConflict(
      { kind: "git", value: "@git/index" },
      { kind: "path", value: "src/unrelated.ts" },
    ),
  ).toBe(false);
});

test("acquire defaults to .agentlocks/locks and reports overlapping conflicts", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src", "locks"), { recursive: true });
    await writeFile(path.join(workspace, "src", "locks", "registry.ts"), "export {};\n", "utf8");
    const registry = testRegistry(workspace, new Date("2026-05-04T10:00:00Z"));

    const acquired = await registry.acquire({
      resourceSpecs: ["src/locks/registry.ts"],
      reason: "edit registry",
      agentId: "session-a",
    });
    expect(acquired.exitCode).toBe(0);
    expect(acquired.lock?.resources).toEqual([{ kind: "path", value: "src/locks/registry.ts" }]);
    await expect(
      stat(path.join(workspace, ".agentlocks", "locks", "active")),
    ).resolves.toBeTruthy();

    const conflict = await registry.acquire({
      resourceSpecs: ["src/**/*.ts"],
      reason: "format src",
      agentId: "session-b",
    });
    expect(conflict.exitCode).toBe(3);
    expect(conflict.suggestedAction).toBe("retry_later");
    expect(conflict.conflicts?.[0]?.lock.lockId).toBe(acquired.lock?.lockId);
  });
});

test("expand is atomic when the requested resource conflicts", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await writeFile(path.join(workspace, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(path.join(workspace, "src", "b.ts"), "export const b = 1;\n", "utf8");
    const registry = testRegistry(workspace, new Date("2026-05-04T10:00:00Z"));

    const first = await registry.acquire({
      resourceSpecs: ["src/a.ts"],
      reason: "edit a",
      agentId: "session-a",
    });
    await registry.acquire({ resourceSpecs: ["src/b.ts"], reason: "edit b", agentId: "session-b" });

    const expanded = await registry.expand({
      lockId: first.lock?.lockId ?? "",
      resourceSpecs: ["src/b.ts"],
      agentId: "session-a",
    });
    expect(expanded.exitCode).toBe(3);

    const status = await registry.status({ resourceSpecs: ["src/a.ts"] });
    expect(status.locks?.[0]?.lock.resources).toEqual([{ kind: "path", value: "src/a.ts" }]);
  });
});

test("refresh, release, and expand require the owning agent id", async () => {
  await withWorkspace(async (workspace) => {
    const registry = testRegistry(workspace, new Date("2026-05-04T10:00:00Z"));
    const acquired = await registry.acquire({
      resourceSpecs: ["src/locks/registry.ts"],
      reason: "edit registry",
      agentId: "session-a",
    });
    const lockId = acquired.lock?.lockId ?? "";

    await expect(registry.refresh(lockId, null, "session-b")).rejects.toThrow(
      "is owned by session-a",
    );
    await expect(
      registry.expand({ lockId, resourceSpecs: ["src/locks/types.ts"], agentId: "session-b" }),
    ).rejects.toThrow("is owned by session-a");
    await expect(registry.release(lockId, "session-b")).rejects.toThrow("is owned by session-a");

    expect((await registry.refresh(lockId, null, "session-a")).exitCode).toBe(0);
    expect((await registry.release(lockId, "session-a")).exitCode).toBe(0);
  });
});

test("unknown liveness does not make expired sessions permanent", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const registry = testRegistry(
      workspace,
      () => now,
      () => ({
        status: "unknown",
        evidence: "fixture unknown",
      }),
    );

    await registry.acquire({
      resourceSpecs: ["stale.ts"],
      reason: "owner disappeared",
      ttlMs: 1000,
      agentId: "missing-session",
    });
    now = new Date("2026-05-04T10:00:02Z");
    expect((await registry.status()).locks?.[0]?.status).toBe("expired-unknown");

    now = new Date("2026-05-04T10:11:00Z");
    const pruned = await registry.prune();
    expect(pruned.pruned).toHaveLength(1);
    expect((await registry.status()).locks).toHaveLength(0);
  });
});

test("@git/index conflicts only with another git lock", async () => {
  await withWorkspace(async (workspace) => {
    const registry = testRegistry(workspace, new Date("2026-05-04T10:00:00Z"));
    const git = await registry.acquire({
      includeGitIndex: true,
      reason: "commit",
      agentId: "session-a",
    });
    const file = await registry.acquire({
      resourceSpecs: ["src/unrelated.ts"],
      reason: "edit file",
      agentId: "session-b",
    });
    const secondGit = await registry.acquire({
      includeGitIndex: true,
      reason: "commit again",
      agentId: "session-c",
    });

    expect(git.exitCode).toBe(0);
    expect(file.exitCode).toBe(0);
    expect(secondGit.exitCode).toBe(3);
  });
});

test("owner detection prefers harness identity before explicit, env, and fallback agent ids", async () => {
  await withWorkspace(async (workspace) => {
    const harnessEnv = {
      CODEX_THREAD_ID: "codex-thread",
      CLAUDE_CODE_SESSION_ID: "claude-session",
    } as NodeJS.ProcessEnv;
    const harnessWins = new FileLockRegistry({ cwd: workspace, env: harnessEnv }).identify(
      "explicit-session",
    );
    expect(harnessWins.owner ? lockOwnerAgentId(harnessWins.owner) : null).toBe(
      "codex:codex-thread",
    );
    expect(harnessWins.owner ? lockOwnerSource(harnessWins.owner) : null).toBe(
      "harness:codex:CODEX_THREAD_ID",
    );

    const explicit = new FileLockRegistry({ cwd: workspace, env: {} }).identify("explicit-session");
    expect(explicit.owner ? lockOwnerAgentId(explicit.owner) : null).toBe("explicit-session");
    expect(explicit.owner ? lockOwnerSource(explicit.owner) : null).toBe("explicit");

    const env = {
      CUSTOM_LOCK_AGENT: "env-agent",
    } as NodeJS.ProcessEnv;
    const configured = new FileLockRegistry({
      cwd: workspace,
      env,
      ownerEnvKeys: ["CUSTOM_LOCK_AGENT"],
    }).identify();
    expect(configured.owner ? lockOwnerAgentId(configured.owner) : null).toBe("env-agent");
    expect(configured.owner ? lockOwnerSource(configured.owner) : null).toBe(
      "env:CUSTOM_LOCK_AGENT",
    );

    const codex = new FileLockRegistry({
      cwd: workspace,
      env: { CODEX_THREAD_ID: "codex-thread" },
    }).identify();
    expect(codex.owner ? lockOwnerAgentId(codex.owner) : null).toBe("codex:codex-thread");
    expect(codex.owner ? lockOwnerSource(codex.owner) : null).toBe("harness:codex:CODEX_THREAD_ID");
    expect(codex.owner?.harness).toBe("codex");
    expect(codex.owner?.harnessScope).toBe("agent");
    expect(codex.owner?.rawSessionId).toBe("codex-thread");

    const claude = new FileLockRegistry({
      cwd: workspace,
      env: { CLAUDE_CODE_SESSION_ID: "claude-session" },
    }).identify();
    expect(claude.owner ? lockOwnerAgentId(claude.owner) : null).toBe("claude-code:claude-session");
    expect(claude.owner ? lockOwnerSource(claude.owner) : null).toBe(
      "harness:claude-code:CLAUDE_CODE_SESSION_ID",
    );
    expect(claude.owner?.harness).toBe("claude-code");
    expect(claude.owner?.harnessScope).toBe("session");

    const hookMain = new FileLockRegistry({
      cwd: workspace,
      env: { AGENTLOCKS_HARNESS_AGENT_ID: "claude-code:claude-session:main" },
    }).identify();
    expect(hookMain.owner ? lockOwnerAgentId(hookMain.owner) : null).toBe(
      "claude-code:claude-session:main",
    );
    expect(hookMain.owner ? lockOwnerSource(hookMain.owner) : null).toBe(
      "harness:agentlocks:AGENTLOCKS_HARNESS_AGENT_ID",
    );
    expect(hookMain.owner?.harness).toBe("claude-code");
    expect(hookMain.owner?.harnessScope).toBe("main");
    expect(hookMain.owner?.rawSessionId).toBe("claude-session");

    const hookAgent = new FileLockRegistry({
      cwd: workspace,
      env: { AGENTLOCKS_HARNESS_AGENT_ID: "claude-code:claude-session:agent:agent-1" },
    }).identify();
    expect(hookAgent.owner ? lockOwnerAgentId(hookAgent.owner) : null).toBe(
      "claude-code:claude-session:agent:agent-1",
    );
    expect(hookAgent.owner?.harness).toBe("claude-code");
    expect(hookAgent.owner?.harnessScope).toBe("agent");
    expect(hookAgent.owner?.harnessAgentId).toBe("agent-1");

    const fallback = new FileLockRegistry({ cwd: workspace, env: {} }).identify();
    expect(
      fallback.owner ? lockOwnerAgentId(fallback.owner).startsWith("agentlocks:") : false,
    ).toBe(true);
    expect(fallback.owner ? lockOwnerSource(fallback.owner) : null).toBe("fallback");
    expect(fallback.owner?.harness).toBe("agentlocks");
    expect(fallback.owner?.harnessScope).toBe("fallback");
  });
});

test("lock command output is compact by default and renders agentlocks commands", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const acquired = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["src/cli/program.ts"],
        reason: "parse lock command",
        ttlMs: null,
        agentId: "session-a",
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config },
    );
    const conflictRegistry = testRegistry(
      workspace,
      () => new Date("2030-05-04T11:00:00Z"),
      () => ({ status: "dead", evidence: "fixture dead" }),
    );
    const conflict = await conflictRegistry.acquire({
      resourceSpecs: ["src/cli/program.ts"],
      reason: "other edit",
      agentId: "session-b",
    });

    expect(acquired.exitCode).toBe(0);
    expect(acquired.json).toMatchObject({
      kind: "acquired",
      exit_code: 0,
      lock_id: expect.stringMatching(/^lock_/),
    });
    expectNoExitCodeKey(acquired.json);
    expect((acquired.json as { lock?: unknown }).lock).toBeUndefined();
    expect(acquired.text).toContain("lock acquired:");
    expect(acquired.text).not.toContain("resources:");
    expect(renderLockResult(conflict, false, config)).toContain("agentlocks prune, then retry");
  });
});

test("lock command supports compact ids and batched refresh and release", async () => {
  await withWorkspace(async (workspace) => {
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const first = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["src/cli/program.ts"],
        reason: "edit parser",
        ttlMs: null,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config },
    );
    const second = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["tests/cli.test.ts"],
        reason: "edit parser tests",
        ttlMs: null,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config },
    );
    const ids = [first.text.trim(), second.text.trim()];

    const refreshed = await executeLockCommand(
      {
        name: "refresh",
        lockIds: ids,
        ttlMs: null,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config },
    );
    const released = await executeLockCommand(
      {
        name: "release",
        lockIds: ids,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config },
    );

    expect(first.text).toMatch(/^lock_/);
    expect(second.text).toMatch(/^lock_/);
    expect(refreshed.text.split("\n")).toEqual(ids);
    expect(released.text.split("\n")).toEqual(ids);
  });
});

test("prune id-only returns pruned lock ids", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const registryOptions = {
      now: () => now,
      sessionProbe: () => ({ status: "dead" as const, evidence: "fixture dead" }),
    };
    const acquired = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["stale.ts"],
        reason: "stale lock",
        ttlMs: 1000,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config, registryOptions },
    );
    now = new Date("2026-05-04T10:00:02Z");

    const pruned = await executeLockCommand(
      {
        name: "prune",
        dryRun: false,
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config, registryOptions },
    );

    expect(pruned.exitCode).toBe(0);
    expect(pruned.text.trim()).toBe(acquired.text.trim());
  });
});

test("prune dry-run reports reclaimable locks without deleting", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const registryOptions = {
      now: () => now,
      sessionProbe: () => ({ status: "dead" as const, evidence: "fixture dead" }),
    };
    const acquired = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["stale.ts"],
        reason: "stale lock",
        ttlMs: 1000,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config, registryOptions },
    );
    now = new Date("2026-05-04T10:00:02Z");

    const planned = await executeLockCommand(
      {
        name: "prune",
        dryRun: true,
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config, registryOptions },
    );
    const statusAfterPlan = await executeLockCommand(
      {
        name: "status",
        resourceSpecs: [],
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config, registryOptions },
    );

    expect(planned.json).toMatchObject({
      kind: "pruned",
      dry_run: true,
      pruned_count: 1,
      pruned_lock_ids: [acquired.text.trim()],
    });
    expect(statusAfterPlan.json).toMatchObject({
      kind: "status",
      lock_count: 1,
      lock_ids: [acquired.text.trim()],
    });
  });
});

test("acquire reclaimConflicts takes over reclaimable conflicts in one command", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const registry = testRegistry(
      workspace,
      () => now,
      () => ({
        status: "dead",
        evidence: "fixture dead",
      }),
    );
    const first = await registry.acquire({
      resourceSpecs: ["hot.ts"],
      reason: "edit hot",
      ttlMs: 1000,
      agentId: "session-a",
    });
    now = new Date("2026-05-04T10:05:00Z");

    const blocked = await registry.acquire({
      resourceSpecs: ["hot.ts"],
      reason: "take over",
      agentId: "session-b",
    });
    expect(blocked.exitCode).toBe(3);
    expect(blocked.suggestedAction).toBe("prune_then_retry");

    const taken = await registry.acquire({
      resourceSpecs: ["hot.ts"],
      reason: "take over",
      agentId: "session-b",
      reclaimConflicts: true,
    });
    expect(taken.exitCode).toBe(0);
    const firstId = first.lock?.lockId ?? "";
    expect(taken.reclaimed?.map((lock) => lock.lockId)).toEqual([firstId]);

    const status = await registry.status({ resourceSpecs: ["hot.ts"] });
    expect(status.locks).toHaveLength(1);
    const owner = status.locks?.[0]?.lock.owner;
    expect(owner ? lockOwnerAgentId(owner) : null).toBe("session-b");
  });
});

test("acquire reclaimConflicts still blocks when a conflict is not reclaimable", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const registry = testRegistry(
      workspace,
      () => now,
      (owner) =>
        lockOwnerAgentId(owner) === "session-live"
          ? { status: "live", evidence: "alive" }
          : { status: "dead", evidence: "dead" },
    );
    await registry.acquire({
      resourceSpecs: ["a.ts"],
      reason: "edit a",
      ttlMs: 1000,
      agentId: "session-a",
    });
    await registry.acquire({
      resourceSpecs: ["b.ts"],
      reason: "edit b",
      ttlMs: 1000,
      agentId: "session-live",
    });
    now = new Date("2026-05-04T10:05:00Z");

    const blocked = await registry.acquire({
      resourceSpecs: ["*.ts"],
      reason: "format",
      agentId: "session-b",
      reclaimConflicts: true,
    });
    expect(blocked.exitCode).toBe(3);
    expect((await registry.status()).locks).toHaveLength(2);
  });
});

test("keep-alive extends an agent's recent siblings but not stale over-grabs", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const registry = testRegistry(workspace, () => now);
    await registry.acquire({
      resourceSpecs: ["a.ts"],
      reason: "edit a",
      ttlMs: 60_000,
      agentId: "session-a",
    });

    now = new Date("2026-05-04T10:00:30Z");
    await registry.acquire({
      resourceSpecs: ["b.ts"],
      reason: "edit b",
      ttlMs: 60_000,
      agentId: "session-a",
    });
    const warmed = (await registry.status({ resourceSpecs: ["a.ts"] })).locks?.[0]?.lock;
    expect(warmed && Date.parse(warmed.leaseExpiresAt)).toBe(Date.parse("2026-05-04T10:01:30Z"));

    now = new Date("2026-05-04T11:00:00Z");
    await registry.acquire({
      resourceSpecs: ["c.ts"],
      reason: "edit c",
      ttlMs: 60_000,
      agentId: "session-a",
    });
    const stale = (await registry.status({ resourceSpecs: ["a.ts"] })).locks?.[0]?.lock;
    expect(stale && Date.parse(stale.leaseExpiresAt)).toBe(Date.parse("2026-05-04T10:01:30Z"));
  });
});

test("board groups active locks by agent with lease state and next step", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const registry = testRegistry(
      workspace,
      () => now,
      () => ({
        status: "dead",
        evidence: "dead",
      }),
    );
    await registry.acquire({
      resourceSpecs: ["a.ts"],
      reason: "edit a",
      ttlMs: 600_000,
      agentId: "session-a",
    });
    await registry.acquire({
      resourceSpecs: ["b.ts"],
      reason: "edit b",
      ttlMs: 1000,
      agentId: "session-b",
    });
    now = new Date("2026-05-04T10:05:00Z");

    const board = await registry.board();
    expect(board.kind).toBe("board");
    expect(board.board).toHaveLength(2);
    const a = board.board?.find((agent) => agent.agentId === "session-a");
    const b = board.board?.find((agent) => agent.agentId === "session-b");
    expect(a?.locks[0]?.status).toBe("held");
    expect(b?.locks[0]?.status).toBe("reclaimable");
    expect(b?.locks[0]?.reclaimable).toBe(true);
    expect(b?.locks[0]?.when).toBe("reclaimable now");
  });
});

test("status --json carries each lock's classification", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const registryOptions = {
      now: () => now,
      sessionProbe: () => ({ status: "dead" as const, evidence: "dead" }),
    };
    const acquired = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["s.ts"],
        reason: "edit",
        ttlMs: 1000,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config, registryOptions },
    );
    now = new Date("2026-05-04T10:00:05Z");
    const status = await executeLockCommand(
      { name: "status", resourceSpecs: [], json: true, idOnly: false },
      { cwd: workspace, config, registryOptions },
    );
    expect(status.json).toMatchObject({
      kind: "status",
      lock_count: 1,
      locks: [
        {
          lock_id: acquired.text.trim(),
          status: "reclaimable",
          resources: [{ kind: "path", value: "s.ts" }],
          owner: { agent_id: "session-a" },
          reason: "edit",
          reclaimable: true,
          next: "prune_then_retry",
        },
      ],
    });
    const board = await executeLockCommand(
      { name: "board", resourceSpecs: [], json: true, idOnly: false },
      { cwd: workspace, config, registryOptions },
    );
    expect(board.json).toMatchObject({
      kind: "board",
      agent_count: 1,
      lock_count: 1,
      agents: [
        {
          agent_id: "session-a",
          locks: [
            {
              lock_id: acquired.text.trim(),
              status: "reclaimable",
              resources: [{ kind: "path", value: "s.ts" }],
              owner: { agent_id: "session-a" },
              reason: "edit",
              reclaimable: true,
              next: "prune_then_retry",
            },
          ],
        },
      ],
    });
  });
});

test("conflict json carries ahead_of and an honest retry-after floor", async () => {
  await withWorkspace(async (workspace) => {
    const now = new Date("2026-05-04T10:00:00Z");
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const registryOptions = {
      now: () => now,
      sessionProbe: () => ({ status: "unknown" as const, evidence: "u" }),
    };
    await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["m.ts"],
        reason: "edit",
        ttlMs: 600_000,
        agentId: "session-a",
        json: false,
        idOnly: true,
      },
      { cwd: workspace, config, registryOptions },
    );
    const conflict = await executeLockCommand(
      {
        name: "acquire",
        resourceSpecs: ["m.ts"],
        reason: "edit2",
        ttlMs: 600_000,
        agentId: "session-b",
        json: true,
        idOnly: false,
      },
      { cwd: workspace, config, registryOptions },
    );
    expect(conflict.exitCode).toBe(3);
    expect(conflict.json).toMatchObject({
      kind: "conflict",
      ahead_of: 1,
      retry_after_ms: 600_000,
      suggested_action: "retry_later",
      next: "work_elsewhere_then_retry",
      conflicts: [
        {
          lock_id: expect.stringMatching(/^lock_/),
          owner: { agent_id: "session-a" },
          reason: "edit",
          status: "held",
          resources: [{ kind: "path", value: "m.ts" }],
          reclaimable: false,
          next: "refresh_or_release_if_owner",
        },
      ],
    });
  });
});

test("multi-incumbent conflict render leads with the binding constraint", async () => {
  await withWorkspace(async (workspace) => {
    let now = new Date("2026-05-04T10:00:00Z");
    const config = resolveAgentlocksConfig({}, { root: workspace });
    const registry = testRegistry(
      workspace,
      () => now,
      (owner) =>
        lockOwnerAgentId(owner) === "session-live"
          ? { status: "live", evidence: "alive" }
          : { status: "dead", evidence: "dead" },
    );
    await registry.acquire({
      resourceSpecs: ["a.ts"],
      reason: "edit a",
      ttlMs: 1000,
      agentId: "session-dead",
    });
    await registry.acquire({
      resourceSpecs: ["b.ts"],
      reason: "edit b",
      ttlMs: 1000,
      agentId: "session-live",
    });
    now = new Date("2026-05-04T10:05:00Z");

    const conflict = await registry.acquire({
      resourceSpecs: ["*.ts"],
      reason: "format",
      agentId: "session-c",
    });
    expect(conflict.exitCode).toBe(3);
    const text = renderLockResult(conflict, false, config);
    expect(text).toContain("2 unit(s) across 2 holders");
    const liveIndex = text.indexOf("expired-live");
    const reclaimableIndex = text.indexOf("reclaimable");
    expect(liveIndex).toBeGreaterThanOrEqual(0);
    expect(liveIndex).toBeLessThan(reclaimableIndex);
  });
});

function expectNoExitCodeKey(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoExitCodeKey(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  expect(record.exitCode).toBeUndefined();
  for (const child of Object.values(record)) expectNoExitCodeKey(child);
}

function testRegistry(
  workspace: string,
  now: Date | (() => Date),
  sessionProbe: (owner: LockOwner) => {
    status: "live" | "dead" | "unknown";
    evidence: string;
  } = () => ({
    status: "dead",
    evidence: "fixture default",
  }),
  overrides: ConstructorParameters<typeof FileLockRegistry>[0] = {},
): FileLockRegistry {
  return new FileLockRegistry({
    cwd: workspace,
    env: {},
    now: typeof now === "function" ? now : () => now,
    sessionProbe: (owner) => sessionProbe(owner),
    ...overrides,
  });
}

async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-locks-"));
  try {
    await fn(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
