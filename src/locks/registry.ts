import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir, pathExists, readText, writeFileAtomic } from "../io";
import { formatJsonArtifact } from "../json";
import { conflictingResources, resourceSetsConflict, resourcesCover } from "./matching";
import { normalizeLockResources, unionResources } from "./resources";
import {
  createUnknownSessionProbe,
  type IdentifyOwnerOptions,
  identifyLockOwner,
  isReliableOwnerIdentity,
  lockOwnerAgentId,
  type OwnerHarness,
  type SessionLivenessProbe,
} from "./session";
import type {
  BoardAgent,
  BoardLock,
  ClassifiedLock,
  FileLockRecord,
  LockConflict,
  LockOperationResult,
  LockOwner,
  LockResource,
} from "./types";
import {
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_UNKNOWN_LIVENESS_GRACE_MS,
  GIT_INDEX_GENERATION_FILE,
  LOCK_SCHEMA_VERSION,
  LockCommandError,
  MAX_LOCK_TTL_MS,
  REGISTRY_MUTEX_LIVE_CEILING_MS,
  REGISTRY_MUTEX_STALE_MS,
} from "./types";

export interface FileLockRegistryOptions {
  cwd?: string;
  lockRoot?: string;
  sessionProbe?: SessionLivenessProbe;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  ownerEnvKeys?: readonly string[];
  ownerHarnesses?: readonly OwnerHarness[];
  fallbackOwnerPrefix?: string;
  defaultTtlMs?: number;
  maxTtlMs?: number;
  unknownLivenessGraceMs?: number;
  autoReclaimOnConflict?: boolean;
  keepAliveOnMutation?: boolean;
  // Mutex contention retry budget (test seam). Defaults: 100 attempts x 25ms = ~2.5s ceiling.
  mutexRetry?: { attempts?: number; sleepMs?: number };
}

export interface LockResourceRequest {
  paths?: string[];
  globs?: string[];
  includeGitIndex?: boolean;
}

export interface AcquireLockParams extends LockResourceRequest {
  reason: string;
  ttlMs?: number | null;
  agentId?: string | null;
  reclaimConflicts?: boolean;
}

export interface ExpandLockParams extends LockResourceRequest {
  lockId: string;
  ttlMs?: number | null;
  agentId?: string | null;
}

export interface MineFilterOptions {
  mine?: boolean;
  agentId?: string | null;
}

export class FileLockRegistry {
  private readonly cwd: string;
  private readonly lockRoot: string;
  private readonly activeDir: string;
  private readonly mutexDir: string;
  private readonly eventsPath: string;
  private readonly sessionProbe: SessionLivenessProbe;
  private readonly now: () => Date;
  private readonly env: NodeJS.ProcessEnv;
  private readonly ownerEnvKeys: readonly string[] | undefined;
  private readonly ownerHarnesses: readonly OwnerHarness[] | undefined;
  private readonly fallbackOwnerPrefix: string;
  private readonly defaultTtlMs: number;
  private readonly maxTtlMs: number;
  private readonly unknownLivenessGraceMs: number;
  private readonly autoReclaimOnConflict: boolean;
  private readonly keepAliveOnMutation: boolean;
  private readonly mutexAttempts: number;
  private readonly mutexSleepMs: number;

  constructor(options: FileLockRegistryOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.lockRoot = path.isAbsolute(options.lockRoot ?? "")
      ? (options.lockRoot as string)
      : path.join(this.cwd, options.lockRoot ?? ".agentlocks/locks");
    this.activeDir = path.join(this.lockRoot, "active");
    this.mutexDir = path.join(this.lockRoot, ".mutex");
    this.eventsPath = path.join(this.lockRoot, "events.jsonl");
    this.sessionProbe = options.sessionProbe ?? createUnknownSessionProbe();
    this.now = options.now ?? (() => new Date());
    this.env = options.env ?? process.env;
    this.ownerEnvKeys = options.ownerEnvKeys;
    this.ownerHarnesses = options.ownerHarnesses;
    this.fallbackOwnerPrefix = options.fallbackOwnerPrefix ?? "agentlocks";
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.maxTtlMs = options.maxTtlMs ?? MAX_LOCK_TTL_MS;
    this.unknownLivenessGraceMs =
      options.unknownLivenessGraceMs ?? DEFAULT_UNKNOWN_LIVENESS_GRACE_MS;
    this.autoReclaimOnConflict = options.autoReclaimOnConflict ?? false;
    this.keepAliveOnMutation = options.keepAliveOnMutation ?? true;
    this.mutexAttempts = options.mutexRetry?.attempts ?? 100;
    this.mutexSleepMs = options.mutexRetry?.sleepMs ?? 25;
  }

  identify(agentId?: string | null): LockOperationResult {
    return {
      kind: "identified",
      exitCode: 0,
      suggestedAction: "identified",
      owner: this.identifyOwner(agentId ?? null),
    };
  }

  async acquire(params: AcquireLockParams): Promise<LockOperationResult> {
    const resources = await this.normalizeRequestedResources(params);
    if (resources.length === 0) {
      throw new LockCommandError("At least one path, glob, or git resource is required.", 2);
    }
    const reason = normalizedReason(params.reason);
    const ttlMs = this.normalizeTtl(params.ttlMs);
    const now = this.now();
    const owner = this.identifyOwner(params.agentId ?? null);

    return this.withMutex(async () => {
      const locks = await this.readActiveLocks();
      const conflicts = await this.findConflicts(resources, locks, now);
      let reclaimed: FileLockRecord[] = [];
      if (conflicts.length > 0) {
        // F1: idempotent / owner-aware acquire. If every conflict is the caller's own
        // lock and one of them already covers the full request, refresh + return it
        // (exit 0) instead of self-conflicting (exit 3).
        const idempotent = await this.tryIdempotentAcquire(conflicts, resources, owner, ttlMs, now);
        if (idempotent) return idempotent;

        const allReclaimable = conflicts.every((conflict) => conflict.status === "reclaimable");
        const reclaimRequested = params.reclaimConflicts ?? this.autoReclaimOnConflict;
        if (!(reclaimRequested && allReclaimable)) {
          return conflictResult(resources, conflicts, now, this.unknownLivenessGraceMs);
        }
        reclaimed = conflicts.map((conflict) => conflict.lock);
        await this.reclaimLocks(reclaimed, {
          cause: "auto-reclaim",
          reclaimedBy: lockOwnerAgentId(owner),
        });
        const residual = await this.findConflicts(resources, await this.readActiveLocks(), now);
        if (residual.length > 0) {
          return conflictResult(resources, residual, now, this.unknownLivenessGraceMs);
        }
      }

      // F4: stamp the monotonic generation onto an @git/index lease from the persisted counter.
      const isGitIndex = resources.some((resource) => resource.kind === "git");
      const generation = isGitIndex ? await this.bumpGitIndexGeneration() : undefined;
      const lock: FileLockRecord = {
        schemaVersion: LOCK_SCHEMA_VERSION,
        lockId: newLockId(now),
        state: "held",
        resources,
        owner,
        reason,
        createdAt: iso(now),
        lastHeartbeatAt: iso(now),
        leaseExpiresAt: iso(new Date(now.getTime() + ttlMs)),
        ttlMs,
        ...(generation !== undefined ? { generation } : {}),
      };
      await this.writeLock(lock);
      await this.appendEvent("acquired", lock, { resources });
      await this.extendOwnSiblingLeases(lockOwnerAgentId(owner), lock.lockId, now);
      return {
        kind: "acquired",
        exitCode: 0,
        suggestedAction: "acquired",
        lock,
        resources,
        ...(reclaimed.length > 0 ? { reclaimed } : {}),
        ...(generation !== undefined ? { gitToken: gitIndexToken(generation) } : {}),
      };
    });
  }

  async expand(params: ExpandLockParams): Promise<LockOperationResult> {
    const requested = await this.normalizeRequestedResources(params);
    if (requested.length === 0) {
      throw new LockCommandError("At least one path or glob is required for lock expansion.", 2);
    }
    const ttlMs =
      params.ttlMs === null || params.ttlMs === undefined ? null : this.normalizeTtl(params.ttlMs);
    const now = this.now();

    return this.withMutex(async () => {
      const locks = await this.readActiveLocks();
      const existing = locks.find((lock) => lock.lockId === params.lockId);
      if (!existing) {
        throw new LockCommandError(
          `Lock not found: ${params.lockId}`,
          2,
          "lock_not_found",
          "agentlocks status --id-only",
        );
      }
      this.assertLockOwner(existing, params.agentId ?? null);

      const resources = unionResources(existing.resources, requested);
      const conflicts = await this.findConflicts(
        resources,
        locks.filter((lock) => lock.lockId !== existing.lockId),
        now,
      );
      if (conflicts.length > 0) {
        return conflictResult(resources, conflicts, now, this.unknownLivenessGraceMs);
      }

      const nextTtlMs = ttlMs ?? existing.ttlMs;
      const lock: FileLockRecord = {
        ...existing,
        resources,
        ttlMs: nextTtlMs,
        lastHeartbeatAt: iso(now),
        leaseExpiresAt: iso(new Date(now.getTime() + nextTtlMs)),
      };
      await this.writeLock(lock);
      await this.appendEvent("expanded", lock, { resources });
      await this.extendOwnSiblingLeases(lockOwnerAgentId(lock.owner), lock.lockId, now);
      return {
        kind: "refreshed",
        exitCode: 0,
        suggestedAction: "refreshed",
        lock,
        resources,
      };
    });
  }

  async refresh(
    lockId: string,
    ttlMsInput?: number | null,
    agentId?: string | null,
  ): Promise<LockOperationResult> {
    const now = this.now();
    return this.withMutex(async () => {
      const lock = await this.requireLock(lockId);
      this.assertLockOwner(lock, agentId ?? null);
      const ttlMs =
        ttlMsInput === null || ttlMsInput === undefined
          ? lock.ttlMs
          : this.normalizeTtl(ttlMsInput);
      const refreshed: FileLockRecord = {
        ...lock,
        ttlMs,
        lastHeartbeatAt: iso(now),
        leaseExpiresAt: iso(new Date(now.getTime() + ttlMs)),
      };
      await this.writeLock(refreshed);
      await this.appendEvent("refreshed", refreshed, {});
      await this.extendOwnSiblingLeases(lockOwnerAgentId(refreshed.owner), refreshed.lockId, now);
      return {
        kind: "refreshed",
        exitCode: 0,
        suggestedAction: "refreshed",
        lock: refreshed,
      };
    });
  }

  async release(lockId: string, agentId?: string | null): Promise<LockOperationResult> {
    return this.withMutex(async () => {
      const lock = await this.requireLock(lockId);
      this.assertLockOwner(lock, agentId ?? null);
      await this.removeLock(lock);
      await this.appendEvent("released", lock, {});
      return {
        kind: "released",
        exitCode: 0,
        suggestedAction: "released",
        lock,
      };
    });
  }

  /** F2: id-less `release --mine` — drop every lock owned by the (reliably-identified) caller. */
  async releaseMine(agentId?: string | null): Promise<LockOperationResult> {
    const caller = this.requireReliableOwner(agentId);
    const callerId = lockOwnerAgentId(caller);
    return this.withMutex(async () => {
      const mine = (await this.readActiveLocks()).filter(
        (lock) => lockOwnerAgentId(lock.owner) === callerId,
      );
      for (const lock of mine) {
        await this.removeLock(lock);
        await this.appendEvent("released", lock, { cause: "release-mine" });
      }
      return {
        kind: "released",
        exitCode: 0,
        suggestedAction: "released",
        affectedLocks: mine,
        owner: caller,
      };
    });
  }

  /** F2: id-less `refresh --mine` — renew every lock owned by the (reliably-identified) caller. */
  async refreshMine(
    ttlMsInput?: number | null,
    agentId?: string | null,
  ): Promise<LockOperationResult> {
    const caller = this.requireReliableOwner(agentId);
    const callerId = lockOwnerAgentId(caller);
    const now = this.now();
    return this.withMutex(async () => {
      const mine = (await this.readActiveLocks()).filter(
        (lock) => lockOwnerAgentId(lock.owner) === callerId,
      );
      const refreshed: FileLockRecord[] = [];
      for (const lock of mine) {
        const ttlMs =
          ttlMsInput === null || ttlMsInput === undefined
            ? lock.ttlMs
            : this.normalizeTtl(ttlMsInput);
        const next: FileLockRecord = {
          ...lock,
          ttlMs,
          lastHeartbeatAt: iso(now),
          leaseExpiresAt: iso(new Date(now.getTime() + ttlMs)),
        };
        await this.writeLock(next);
        await this.appendEvent("refreshed", next, { cause: "refresh-mine" });
        refreshed.push(next);
      }
      return {
        kind: "refreshed",
        exitCode: 0,
        suggestedAction: "refreshed",
        affectedLocks: refreshed,
        owner: caller,
      };
    });
  }

  /**
   * F4: verify the caller still holds the `@git/index` lease named by `lockId` at fence
   * generation `token` (and re-extend it when `refresh`), under the mutex. Throws exit 3 if
   * the lease was reclaimed/re-minted or is no longer the caller's. The foreground keep-alive
   * in `runCommit` calls this repeatedly while it awaits `git add`/`git commit`.
   */
  async verifyGitIndexToken(
    lockId: string,
    token: string,
    agentId: string | null | undefined,
    options: { refresh?: boolean } = {},
  ): Promise<LockOperationResult> {
    const now = this.now();
    return this.withMutex(async () => {
      const lock = await this.findLock(lockId);
      if (!lock) {
        throw new LockCommandError(
          `@git/index lease ${lockId} is no longer held (reclaimed or released); aborting commit.`,
          3,
        );
      }
      this.assertLockOwner(lock, agentId ?? null);
      if (!lock.resources.some((resource) => resource.kind === "git")) {
        throw new LockCommandError(`Lock ${lockId} is not an @git/index lease.`, 2);
      }
      if (gitIndexToken(lock.generation) !== token) {
        throw new LockCommandError(
          `@git/index fence mismatch (lease re-minted under a newer generation); aborting commit.`,
          3,
        );
      }
      const classified = await this.classifyLock(lock, now);
      if (classified.status === "reclaimable") {
        throw new LockCommandError(`@git/index lease is reclaimable (lost); aborting commit.`, 3);
      }
      if (options.refresh) {
        const next: FileLockRecord = {
          ...lock,
          lastHeartbeatAt: iso(now),
          leaseExpiresAt: iso(new Date(now.getTime() + lock.ttlMs)),
        };
        await this.writeLock(next);
        await this.appendEvent("refreshed", next, { cause: "git-fence-keepalive" });
      }
      return { kind: "refreshed", exitCode: 0, suggestedAction: "refreshed", lock };
    });
  }

  /**
   * F3: non-mutating active-lock read for `git verify` — returns [] on a missing dir
   * (NEVER `ensureDir`s, so verify can run on every commit / a read-only FS).
   */
  async readActiveLocksReadOnly(): Promise<FileLockRecord[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.activeDir);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
    const locks: FileLockRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        locks.push(JSON.parse(await readText(path.join(this.activeDir, name))) as FileLockRecord);
      } catch {
        // Skip-and-tolerate one corrupt lock file so verify never aborts a commit.
      }
    }
    return locks.sort((left, right) => left.lockId.localeCompare(right.lockId));
  }

  /** F3: classify the read-only active set (no writes) for the verify engine. */
  async classifyActiveReadOnly(now: Date = this.now()): Promise<ClassifiedLock[]> {
    const locks = await this.readActiveLocksReadOnly();
    return Promise.all(locks.map(async (lock) => this.classifyLock(lock, now)));
  }

  /** Resolve the caller's owner (for `git verify` ownership annotation). */
  resolveOwner(agentId?: string | null): LockOwner {
    return this.identifyOwner(agentId ?? null);
  }

  async status(
    request: LockResourceRequest = {},
    options: MineFilterOptions = {},
  ): Promise<LockOperationResult> {
    const resources = await this.normalizeRequestedResources(request, false);
    const now = this.now();
    const locks = await this.readActiveLocks();
    const classified = await Promise.all(locks.map(async (lock) => this.classifyLock(lock, now)));
    const matching = this.applyMineFilter(
      resources.length === 0
        ? classified
        : classified.filter((item) => resourceSetsConflict(resources, item.lock.resources)),
      options,
    );
    return {
      kind: "status",
      exitCode: 0,
      suggestedAction: "status",
      locks: matching,
      resources,
    };
  }

  async board(
    request: LockResourceRequest = {},
    options: MineFilterOptions = {},
  ): Promise<LockOperationResult> {
    const resources = await this.normalizeRequestedResources(request, false);
    const now = this.now();
    const locks = await this.readActiveLocks();
    const classified = await Promise.all(locks.map(async (lock) => this.classifyLock(lock, now)));
    const matching = this.applyMineFilter(
      resources.length === 0
        ? classified
        : classified.filter((item) => resourceSetsConflict(resources, item.lock.resources)),
      options,
    );
    const byAgent = new Map<string, BoardLock[]>();
    for (const item of matching) {
      const agentId = lockOwnerAgentId(item.lock.owner);
      const rows = byAgent.get(agentId) ?? [];
      rows.push({
        lockId: item.lock.lockId,
        status: item.status,
        resources: item.lock.resources.map((resource) => resource.value),
        reason: item.lock.reason,
        when: boardWhen(item, now, this.unknownLivenessGraceMs),
        reclaimable: item.status === "reclaimable",
      });
      byAgent.set(agentId, rows);
    }
    const board: BoardAgent[] = [...byAgent.entries()].map(([agentId, agentLocks]) => ({
      agentId,
      locks: agentLocks,
    }));
    return {
      kind: "board",
      exitCode: 0,
      suggestedAction: "status",
      board,
      resources,
    };
  }

  async prune(dryRun = false): Promise<LockOperationResult> {
    const now = this.now();
    return this.withMutex(async () => {
      const locks = await this.readActiveLocks();
      const classified = await Promise.all(locks.map(async (lock) => this.classifyLock(lock, now)));
      const pruned = classified
        .filter((item) => item.status === "reclaimable")
        .map((item) => item.lock);
      if (dryRun) {
        return {
          kind: "pruned",
          exitCode: 0,
          suggestedAction: "pruned",
          pruned,
          dryRun: true,
        };
      }
      await this.reclaimLocks(pruned, {});
      return {
        kind: "pruned",
        exitCode: 0,
        suggestedAction: "pruned",
        pruned,
        dryRun: false,
      };
    });
  }

  private async reclaimLocks(
    locks: FileLockRecord[],
    details: Record<string, unknown>,
  ): Promise<void> {
    for (const lock of locks) {
      await fs.rm(this.lockPath(lock.lockId), { force: true });
      // F4: advance the persisted @git/index generation when an index lease is reclaimed,
      // so a re-mint cannot reuse a prior fence token even if it happened in the same tick.
      if (lock.resources.some((resource) => resource.kind === "git")) {
        await this.bumpGitIndexGeneration();
      }
      await this.appendEvent("pruned", lock, details);
    }
  }

  /** Remove a lock file (release path — no generation bump; a re-acquire bumps it). */
  private async removeLock(lock: FileLockRecord): Promise<void> {
    await fs.rm(this.lockPath(lock.lockId), { force: true });
  }

  /** F1: refresh + return the caller's own covering lock instead of self-conflicting. */
  private async tryIdempotentAcquire(
    conflicts: LockConflict[],
    resources: LockResource[],
    owner: LockOwner,
    ttlMs: number,
    now: Date,
  ): Promise<LockOperationResult | null> {
    const callerId = lockOwnerAgentId(owner);
    if (!conflicts.every((conflict) => lockOwnerAgentId(conflict.lock.owner) === callerId)) {
      return null;
    }
    const covering = conflicts.find((conflict) =>
      resourcesCover(conflict.lock.resources, resources),
    );
    if (!covering) return null;
    const refreshed: FileLockRecord = {
      ...covering.lock,
      ttlMs,
      lastHeartbeatAt: iso(now),
      leaseExpiresAt: iso(new Date(now.getTime() + ttlMs)),
    };
    await this.writeLock(refreshed);
    await this.appendEvent("refreshed", refreshed, { cause: "idempotent-acquire" });
    await this.extendOwnSiblingLeases(callerId, refreshed.lockId, now);
    // F4: a re-acquired @git/index lease must still return its fence token (same generation).
    const isGitIndex = refreshed.resources.some((resource) => resource.kind === "git");
    return {
      kind: "acquired",
      exitCode: 0,
      suggestedAction: "acquired",
      lock: refreshed,
      resources: refreshed.resources,
      ...(isGitIndex ? { gitToken: gitIndexToken(refreshed.generation) } : {}),
    };
  }

  private applyMineFilter(items: ClassifiedLock[], options: MineFilterOptions): ClassifiedLock[] {
    if (!options.mine) return items;
    const callerId = lockOwnerAgentId(this.identifyOwner(options.agentId ?? null));
    return items.filter((item) => lockOwnerAgentId(item.lock.owner) === callerId);
  }

  private requireReliableOwner(agentId: string | null | undefined): LockOwner {
    const caller = this.identifyOwner(agentId ?? null);
    if (!isReliableOwnerIdentity(caller)) {
      throw new LockCommandError(
        `--mine needs a stable identity but resolved '${lockOwnerAgentId(caller)}' (${caller.source}). ` +
          `Set AGENTLOCKS_HARNESS_AGENT_ID, pass --agent-id, or set AGENTLOCKS_AGENT_ID.`,
        2,
      );
    }
    return caller;
  }

  private async findLock(lockId: string): Promise<FileLockRecord | null> {
    const lockPath = this.lockPath(lockId);
    if (!(await pathExists(lockPath))) return null;
    return JSON.parse(await readText(lockPath)) as FileLockRecord;
  }

  private async readGitIndexGeneration(): Promise<number> {
    try {
      const raw = await readText(path.join(this.lockRoot, GIT_INDEX_GENERATION_FILE));
      const value = Number.parseInt(raw.trim(), 10);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (error) {
      if (isNotFoundError(error)) return 0;
      throw error;
    }
  }

  /** Read + increment the persisted @git/index generation counter. MUST be called under the mutex. */
  private async bumpGitIndexGeneration(): Promise<number> {
    await ensureDir(this.lockRoot);
    const next = (await this.readGitIndexGeneration()) + 1;
    const target = path.join(this.lockRoot, GIT_INDEX_GENERATION_FILE);
    await writeFileAtomic(target, `${next}\n`);
    return next;
  }

  private async extendOwnSiblingLeases(
    callerAgentId: string,
    primaryLockId: string,
    now: Date,
  ): Promise<void> {
    if (!this.keepAliveOnMutation) return;
    const locks = await this.readActiveLocks();
    const createdFloor = now.getTime() - this.maxTtlMs;
    for (const lock of locks) {
      if (lock.lockId === primaryLockId) continue;
      if (lockOwnerAgentId(lock.owner) !== callerAgentId) continue;
      const created = Date.parse(lock.createdAt);
      // Do not keep an over-grab alive forever: a lock older than the max lease
      // is allowed to lapse and reclaim on its own schedule.
      if (!Number.isFinite(created) || created <= createdFloor) continue;
      const refreshed: FileLockRecord = {
        ...lock,
        lastHeartbeatAt: iso(now),
        leaseExpiresAt: iso(new Date(now.getTime() + lock.ttlMs)),
      };
      await this.writeLock(refreshed);
      await this.appendEvent("refreshed", refreshed, { cause: "keep-alive" });
    }
  }

  private identifyOwner(agentId: string | null) {
    const options: IdentifyOwnerOptions = {
      cwd: this.cwd,
      agentId,
      env: this.env,
      fallbackPrefix: this.fallbackOwnerPrefix,
    };
    if (this.ownerEnvKeys) options.envKeys = this.ownerEnvKeys;
    if (this.ownerHarnesses) options.harnesses = this.ownerHarnesses;
    return identifyLockOwner(options);
  }

  private async normalizeRequestedResources(
    request: LockResourceRequest,
    requireAny = true,
  ): Promise<LockResource[]> {
    const resources = await normalizeLockResources({
      cwd: this.cwd,
      paths: request.paths ?? [],
      globs: request.globs ?? [],
      includeGitIndex: Boolean(request.includeGitIndex),
    });
    if (requireAny && resources.length === 0) {
      throw new LockCommandError("At least one lock resource is required.", 2);
    }
    return resources;
  }

  private async findConflicts(
    resources: LockResource[],
    locks: FileLockRecord[],
    now: Date,
  ): Promise<LockConflict[]> {
    const conflicts: LockConflict[] = [];
    for (const lock of locks) {
      const overlapping = conflictingResources(resources, lock.resources);
      if (overlapping.length === 0) continue;
      const classified = await this.classifyLock(lock, now);
      conflicts.push({
        lock,
        status: classified.status,
        liveness: classified.liveness,
        resources: overlapping,
      });
    }
    return conflicts;
  }

  private async classifyLock(lock: FileLockRecord, now: Date): Promise<ClassifiedLock> {
    const expiresAt = Date.parse(lock.leaseExpiresAt);
    if (Number.isFinite(expiresAt) && now.getTime() <= expiresAt) {
      return { lock, status: "held", liveness: null };
    }

    const liveness = await this.sessionProbe(lock.owner, now);
    if (liveness.status === "live") return { lock, status: "expired-live", liveness };
    if (liveness.status === "dead") return { lock, status: "reclaimable", liveness };

    const unknownAgeMs = Number.isFinite(expiresAt)
      ? now.getTime() - expiresAt
      : Number.POSITIVE_INFINITY;
    if (unknownAgeMs <= this.unknownLivenessGraceMs) {
      return { lock, status: "expired-unknown", liveness };
    }
    return { lock, status: "reclaimable", liveness };
  }

  private async readActiveLocks(): Promise<FileLockRecord[]> {
    await ensureDir(this.activeDir);
    const entries = await fs.readdir(this.activeDir, { withFileTypes: true });
    const locks: FileLockRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = await readText(path.join(this.activeDir, entry.name));
      locks.push(JSON.parse(raw) as FileLockRecord);
    }
    return locks.sort((left, right) => left.lockId.localeCompare(right.lockId));
  }

  private async requireLock(lockId: string): Promise<FileLockRecord> {
    const lockPath = this.lockPath(lockId);
    if (!(await pathExists(lockPath))) {
      throw new LockCommandError(
        `Lock not found: ${lockId}`,
        2,
        "lock_not_found",
        "agentlocks status --id-only",
      );
    }
    return JSON.parse(await readText(lockPath)) as FileLockRecord;
  }

  private async writeLock(lock: FileLockRecord): Promise<void> {
    await ensureDir(this.activeDir);
    const target = this.lockPath(lock.lockId);
    await writeFileAtomic(target, `${formatJsonArtifact(lock)}\n`);
  }

  private async appendEvent(
    type: string,
    lock: FileLockRecord,
    details: Record<string, unknown>,
  ): Promise<void> {
    await ensureDir(this.lockRoot);
    const event = {
      timestamp: iso(this.now()),
      type,
      lockId: lock.lockId,
      owner: lock.owner,
      reason: lock.reason,
      ...details,
    };
    await fs.appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  private lockPath(lockId: string): string {
    if (!/^[A-Za-z0-9_.:-]+$/.test(lockId)) {
      throw new LockCommandError(`Invalid lock id: ${lockId}`, 2);
    }
    return path.join(this.activeDir, `${lockId}.json`);
  }

  private async withMutex<T>(operation: () => Promise<T>): Promise<T> {
    await ensureDir(this.lockRoot);
    const ownerPath = path.join(this.mutexDir, "owner.json");
    for (let attempt = 0; attempt < this.mutexAttempts; attempt++) {
      try {
        await fs.mkdir(this.mutexDir);
        const nonce = randomBytes(12).toString("hex");
        await fs.writeFile(
          ownerPath,
          `${JSON.stringify({
            hostname: os.hostname(),
            pid: process.pid,
            nonce,
            createdAt: iso(this.now()),
          })}\n`,
          "utf8",
        );
        try {
          return await operation();
        } finally {
          // Only delete the mutex when we can CONFIRM it is still ours (owner.json carries our
          // nonce). If our hold was reclaimed mid-operation and a successor re-acquired, the nonce
          // differs, and if that successor is between its mkdir and its owner.json write, the read
          // returns null. In BOTH cases we must NOT remove the directory: doing so would evict a
          // live successor (and, in the null case, make its owner.json write fail with ENOENT). A
          // genuinely-orphaned dir (reclaimed, no successor yet) is left for the next staleness
          // reclaim. Never a double-acquire, never a deleted successor.
          const owner = await readMutexOwner(ownerPath);
          if (owner && owner.nonce === nonce) {
            await fs.rm(this.mutexDir, { recursive: true, force: true });
          }
        }
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
        if (await this.reclaimStaleMutex()) continue;
        await sleep(this.mutexSleepMs);
      }
    }
    throw new LockCommandError("Timed out waiting for lock registry mutex.", 2);
  }

  private async reclaimStaleMutex(): Promise<boolean> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(this.mutexDir);
    } catch {
      return true;
    }
    const ageMs = this.now().getTime() - stat.mtimeMs;
    if (ageMs <= REGISTRY_MUTEX_STALE_MS) return false;
    // Stale by mtime, but refuse to evict a holder that is provably live (recorded on this host
    // with a still-running pid), up to a ceiling that bounds pid-reuse and an indefinitely-wedged
    // holder. owner.json is the evidence the prior design wrote but never consulted, which let a
    // merely-slow live holder be barged into the critical section (a double-acquire hazard).
    const owner = await readMutexOwner(path.join(this.mutexDir, "owner.json"));
    if (
      owner &&
      owner.hostname === os.hostname() &&
      ageMs <= REGISTRY_MUTEX_LIVE_CEILING_MS &&
      isProcessAlive(owner.pid)
    ) {
      return false;
    }
    await fs.rm(this.mutexDir, { recursive: true, force: true });
    return true;
  }

  private normalizeTtl(ttlMs: number | null | undefined): number {
    const value = ttlMs ?? this.defaultTtlMs;
    if (!Number.isInteger(value) || value <= 0) {
      throw new LockCommandError(`Lock TTL must be a positive integer: ${value}`, 2);
    }
    if (value > this.maxTtlMs) {
      throw new LockCommandError(`Lock TTL must be <= ${this.maxTtlMs}.`, 2);
    }
    return value;
  }

  private assertLockOwner(lock: FileLockRecord, agentId: string | null | undefined): void {
    const caller = this.identifyOwner(agentId ?? null);
    const callerSessionId = lockOwnerAgentId(caller);
    const lockOwnerId = lockOwnerAgentId(lock.owner);
    if (callerSessionId === lockOwnerId) return;
    throw new LockCommandError(
      `Lock ${lock.lockId} is owned by ${lockOwnerId}; current owner is ${callerSessionId}.`,
      3,
    );
  }
}

function conflictResult(
  resources: LockResource[],
  conflicts: LockConflict[],
  now: Date,
  graceMs: number,
): LockOperationResult {
  const action = conflicts.every((conflict) => conflict.status === "reclaimable")
    ? "prune_then_retry"
    : "retry_later";
  const aheadOf = new Set(conflicts.map((conflict) => lockOwnerAgentId(conflict.lock.owner))).size;
  // An honest floor below which retrying cannot succeed (an expired-live holder
  // is not time-bounded, so omit the floor entirely when one is present).
  const hasExpiredLive = conflicts.some((conflict) => conflict.status === "expired-live");
  let minRetryAfterMs: number | undefined;
  if (!hasExpiredLive && conflicts.length > 0) {
    minRetryAfterMs = Math.max(
      0,
      ...conflicts.map((conflict) => {
        const expiry = Date.parse(conflict.lock.leaseExpiresAt);
        if (!Number.isFinite(expiry)) return 0;
        if (conflict.status === "reclaimable") return 0;
        if (conflict.status === "expired-unknown") return expiry + graceMs - now.getTime();
        return expiry - now.getTime();
      }),
    );
  }
  return {
    kind: "conflict",
    exitCode: 3,
    suggestedAction: action,
    resources,
    conflicts,
    aheadOf,
    ...(minRetryAfterMs !== undefined ? { minRetryAfterMs } : {}),
  };
}

function boardWhen(item: ClassifiedLock, now: Date, graceMs: number): string {
  const expiry = Date.parse(item.lock.leaseExpiresAt);
  switch (item.status) {
    case "held":
      return Number.isFinite(expiry) ? `expires in ${humanizeMs(expiry - now.getTime())}` : "held";
    case "expired-live":
      return "owner active";
    case "expired-unknown":
      return Number.isFinite(expiry)
        ? `reclaimable in ${humanizeMs(expiry + graceMs - now.getTime())}`
        : "reclaim pending";
    case "reclaimable":
      return "reclaimable now";
    default:
      return item.status;
  }
}

function humanizeMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 60_000) return `${Math.round(clamped / 1000)}s`;
  return `${Math.round(clamped / 60_000)}m`;
}

function normalizedReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) throw new LockCommandError("Lock reason is required.", 2);
  return trimmed;
}

function newLockId(now: Date): string {
  return `lock_${iso(now).replace(/[-:]/g, "")}_${randomBytes(4).toString("hex")}`;
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** F4: render the shell-safe `@git/index` fence token for a generation (`g<n>`). */
export function gitIndexToken(generation: number | undefined): string {
  return `g${generation ?? 0}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface MutexOwnerRecord {
  hostname?: string;
  pid?: number;
  nonce?: string;
  createdAt?: string;
}

async function readMutexOwner(ownerPath: string): Promise<MutexOwnerRecord | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(ownerPath, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as MutexOwnerRecord) : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number | undefined): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH = no such process (dead). EPERM = process exists but owned by another user (alive).
    return (error as { code?: string }).code === "EPERM";
  }
}
