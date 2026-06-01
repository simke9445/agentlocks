export const LOCK_SCHEMA_VERSION = 1;
export const DEFAULT_LOCK_TTL_MS = 600_000;
export const MAX_LOCK_TTL_MS = 1_800_000;
// Grace applied after lease expiry when liveness cannot be proven. Short by
// default: an un-probeable owner is not evidence of life, so a dead generic or
// Claude Code lock becomes reclaimable shortly after its lease lapses.
export const DEFAULT_UNKNOWN_LIVENESS_GRACE_MS = 90_000;
// Maximum age of a Claude Code session transcript still treated as "live".
export const CLAUDECODE_LIVENESS_STALE_MS = 300_000;
export const REGISTRY_MUTEX_STALE_MS = 30_000;
// A registry mutex stale by mtime is reclaimed — UNLESS owner.json records a live process on
// this host, in which case it is protected up to this ceiling (which bounds pid-reuse and an
// indefinitely-wedged holder). Far above any real registry operation (all local-FS, ms-scale).
export const REGISTRY_MUTEX_LIVE_CEILING_MS = 600_000;
export const GIT_INDEX_RESOURCE = "@git/index";

export type LockResourceKind = "path" | "glob" | "git";
export type LockOwnerHarness = "codex" | "claude-code" | "agentlocks";
export type LockOwnerHarnessScope = "agent" | "main" | "session" | "fallback";

export interface LockResource {
  kind: LockResourceKind;
  value: string;
}

export interface LockOwner {
  agentId: string;
  hostname: string;
  pid: number;
  cwd: string;
  source: string;
  harness?: LockOwnerHarness;
  harnessScope?: LockOwnerHarnessScope;
  rawSessionId?: string;
  harnessAgentId?: string;
  agentType?: string;
}

export type GenericLockOwner = LockOwner;

export interface FileLockRecord {
  schemaVersion: 1;
  lockId: string;
  state: "held";
  resources: LockResource[];
  owner: LockOwner;
  reason: string;
  createdAt: string;
  lastHeartbeatAt: string;
  leaseExpiresAt: string;
  ttlMs: number;
  /**
   * F4 fencing generation, stamped onto an `@git/index` lock from the persisted
   * monotonic counter when the lease is minted. Absent on path/glob locks.
   */
  generation?: number;
}

/** Persisted, monotonic `@git/index` lease counter (survives release/reclaim). */
export const GIT_INDEX_GENERATION_FILE = "git-index.generation";

export type LockLeaseStatus =
  | "held"
  | "expired-live"
  | "expired-unknown"
  | "reclaimable"
  | "released";

export type SessionLivenessStatus = "live" | "dead" | "unknown";

export interface SessionLiveness {
  status: SessionLivenessStatus;
  evidence: string;
}

export interface ClassifiedLock {
  lock: FileLockRecord;
  status: LockLeaseStatus;
  liveness: SessionLiveness | null;
}

export type SuggestedLockAction =
  | "acquired"
  | "retry_later"
  | "release_and_retry"
  | "prune_then_retry"
  | "released"
  | "refreshed"
  | "status"
  | "pruned"
  | "identified"
  | "verified";

export interface LockConflict {
  lock: FileLockRecord;
  status: LockLeaseStatus;
  liveness: SessionLiveness | null;
  resources: LockResource[];
}

export interface BoardLock {
  lockId: string;
  status: LockLeaseStatus;
  resources: string[];
  reason: string;
  when: string;
  reclaimable: boolean;
}

export interface BoardAgent {
  agentId: string;
  locks: BoardLock[];
}

export type GitVerifyState = "ordinary" | "merge_or_sequencer" | "no_staged_changes";

export interface GitVerifyCaller {
  agentId: string;
  source: string;
  harnessScope?: LockOwnerHarnessScope;
  reliable: boolean;
}

export interface GitVerifyCoveredBy {
  lockId: string;
  resource: string;
  owner: string;
  ownedByCaller: boolean;
}

export interface GitVerifyCovered {
  path: string;
  coveredBy: GitVerifyCoveredBy;
}

export interface GitVerifyUncovered {
  path: string;
  testedAgainst: string[];
  hint?: string;
}

export interface GitVerifyRename {
  from: string;
  to: string;
  covered: boolean;
}

/** The `agentlocks git verify` advisory report (GIT_HOOK_SPEC §3.8). */
export interface GitVerifyReport {
  ok: boolean;
  state: GitVerifyState;
  caller: GitVerifyCaller;
  stagedTotal: number;
  covered: GitVerifyCovered[];
  foreignCovered: GitVerifyCovered[];
  uncovered: GitVerifyUncovered[];
  renames: GitVerifyRename[];
}

export interface LockOperationResult {
  kind:
    | "acquired"
    | "conflict"
    | "refreshed"
    | "released"
    | "status"
    | "board"
    | "pruned"
    | "identified"
    | "verified";
  exitCode: number;
  suggestedAction: SuggestedLockAction;
  lock?: FileLockRecord;
  locks?: ClassifiedLock[];
  board?: BoardAgent[];
  resources?: LockResource[];
  conflicts?: LockConflict[];
  pruned?: FileLockRecord[];
  reclaimed?: FileLockRecord[];
  minRetryAfterMs?: number;
  aheadOf?: number;
  dryRun?: boolean;
  owner?: LockOwner;
  /** F4: shell-safe `@git/index` fence token returned by `git begin`. */
  gitToken?: string;
  /** F4: ids refreshed by `git begin` before acquiring `@git/index`. */
  refreshedLockIds?: string[];
  /** F3: the `git verify` advisory report. */
  verify?: GitVerifyReport;
  /** F2: the caller's own locks affected by an id-less `release --mine` / `refresh --mine`. */
  affectedLocks?: FileLockRecord[];
}

interface LockCommandOutputOptions {
  json: boolean;
  idOnly: boolean;
  verbose?: boolean;
}

export type LockCommand =
  | ({
      name: "acquire";
      paths: string[];
      globs: string[];
      reason: string;
      ttlMs: number | null;
      agentId: string | null;
      reclaimConflicts?: boolean;
    } & LockCommandOutputOptions)
  | ({
      name: "expand";
      lockId: string;
      paths: string[];
      globs: string[];
      ttlMs: number | null;
      agentId: string | null;
    } & LockCommandOutputOptions)
  | ({
      name: "refresh";
      lockIds: string[];
      ttlMs: number | null;
      agentId: string | null;
      mine?: boolean;
    } & LockCommandOutputOptions)
  | ({
      name: "release";
      lockIds: string[];
      agentId: string | null;
      mine?: boolean;
    } & LockCommandOutputOptions)
  | ({
      name: "status";
      paths: string[];
      globs: string[];
      mine?: boolean;
    } & LockCommandOutputOptions)
  | ({
      name: "board";
      paths: string[];
      globs: string[];
      mine?: boolean;
    } & LockCommandOutputOptions)
  | ({ name: "prune"; dryRun: boolean } & LockCommandOutputOptions)
  | ({ name: "identify"; agentId: string | null } & LockCommandOutputOptions)
  | ({
      name: "git-begin";
      reason: string;
      ttlMs: number | null;
      agentId: string | null;
      refreshLockIds: string[];
    } & LockCommandOutputOptions)
  | ({
      name: "git-end";
      lockIds: string[];
      releaseLockIds: string[];
      agentId: string | null;
      gitToken?: string | null;
    } & LockCommandOutputOptions)
  | ({
      name: "git-verify";
      includeUnstaged: boolean;
      pathspec: string[];
      pathspecMode: "only" | "include" | null;
    } & LockCommandOutputOptions);

export class LockCommandError extends Error {
  readonly exitCode: number;
  readonly code: string;
  // Optional copy-pasteable recovery command surfaced to the agent as a `next:` line (Axiom 6).
  readonly next?: string;

  constructor(message: string, exitCode: number, code = "lock_command_error", next?: string) {
    super(message);
    this.name = "LockCommandError";
    this.exitCode = exitCode;
    this.code = code;
    if (next !== undefined) this.next = next;
  }
}
