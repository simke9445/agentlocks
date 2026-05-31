import { loadLockpickConfig, type ResolvedLockpickConfig, renderLockpickCommand } from "../config";
import { runGitVerify } from "./git-verify";
import { FileLockRegistry, type FileLockRegistryOptions } from "./registry";
import {
  createHarnessSessionProbe,
  createUnknownSessionProbe,
  lockOwnerAgentId,
  lockOwnerSource,
  probeClaudeCodeSessionLiveness,
  probeCodexSessionLiveness,
} from "./session";
import type {
  BoardAgent,
  ClassifiedLock,
  GitVerifyReport,
  LockCommand,
  LockConflict,
  LockOperationResult,
  LockResource,
} from "./types";
import { LockCommandError } from "./types";

export interface LockCommandOutput {
  exitCode: number;
  text: string;
  json?: unknown;
  stderr?: string;
}

export interface ExecuteLockCommandOptions {
  cwd?: string;
  config?: ResolvedLockpickConfig;
  registryOptions?: Partial<FileLockRegistryOptions>;
}

async function buildRegistry(
  cwdOrOptions: string | ExecuteLockCommandOptions,
): Promise<{ registry: FileLockRegistry; config: ResolvedLockpickConfig }> {
  const options = typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : cwdOrOptions;
  const config =
    options.config ?? (await loadLockpickConfig({ cwd: options.cwd ?? process.cwd() }));
  const registry = new FileLockRegistry({
    cwd: config.root,
    lockRoot: config.lockRoot,
    ownerEnvKeys: config.owner.envKeys,
    ownerHarnesses: config.owner.harnesses,
    fallbackOwnerPrefix: config.owner.fallbackPrefix,
    defaultTtlMs: config.defaults.ttlMs,
    maxTtlMs: config.defaults.maxTtlMs,
    unknownLivenessGraceMs: config.defaults.unknownLivenessGraceMs,
    autoReclaimOnConflict: config.defaults.autoReclaimOnConflict,
    keepAliveOnMutation: config.defaults.keepAliveOnMutation,
    sessionProbe:
      config.liveness.adapter === "codex"
        ? probeCodexSessionLiveness
        : config.liveness.adapter === "claude-code"
          ? probeClaudeCodeSessionLiveness
          : config.liveness.adapter === "auto"
            ? createHarnessSessionProbe()
            : createUnknownSessionProbe(),
    ...options.registryOptions,
  });
  return { registry, config };
}

/**
 * F4: verify (and optionally refresh) the `@git/index` fence token. Used by the
 * `runCommit` foreground keep-alive. Returns exit 3 (LockCommandError) on a lost lease.
 */
export async function verifyGitFence(
  gitLockId: string,
  gitToken: string,
  agentId: string | null,
  fenceOptions: { refresh?: boolean },
  cwdOrOptions: string | ExecuteLockCommandOptions = process.cwd(),
): Promise<LockCommandOutput> {
  const { registry } = await buildRegistry(cwdOrOptions);
  try {
    await registry.verifyGitIndexToken(gitLockId, gitToken, agentId, fenceOptions);
    return { exitCode: 0, text: "" };
  } catch (error) {
    if (error instanceof LockCommandError) {
      return { exitCode: error.exitCode, text: "", stderr: error.message };
    }
    throw error;
  }
}

export async function executeLockCommand(
  command: LockCommand,
  cwdOrOptions: string | ExecuteLockCommandOptions = process.cwd(),
): Promise<LockCommandOutput> {
  // The directory the command was INVOKED from (may be a subdir) — git verify resolves
  // pathspecs relative to this, not the repo root (the hook runs verify in its effective cwd).
  const invocationCwd =
    typeof cwdOrOptions === "string" ? cwdOrOptions : (cwdOrOptions.cwd ?? process.cwd());
  const { registry, config } = await buildRegistry(cwdOrOptions);
  const results: LockOperationResult[] = [];
  switch (command.name) {
    case "acquire":
      results.push(
        await registry.acquire({
          paths: command.paths,
          globs: command.globs,
          reason: command.reason,
          ttlMs: command.ttlMs,
          agentId: command.agentId,
          ...(command.reclaimConflicts !== undefined
            ? { reclaimConflicts: command.reclaimConflicts }
            : {}),
        }),
      );
      break;
    case "expand":
      results.push(
        await registry.expand({
          lockId: command.lockId,
          paths: command.paths,
          globs: command.globs,
          ttlMs: command.ttlMs,
          agentId: command.agentId,
        }),
      );
      break;
    case "refresh":
      if (command.mine) {
        results.push(await registry.refreshMine(command.ttlMs, command.agentId));
        break;
      }
      for (const lockId of requireLockIds(command.lockIds, "refresh")) {
        results.push(await registry.refresh(lockId, command.ttlMs, command.agentId));
      }
      break;
    case "release":
      if (command.mine) {
        results.push(await registry.releaseMine(command.agentId));
        break;
      }
      for (const lockId of requireLockIds(command.lockIds, "release")) {
        results.push(await registry.release(lockId, command.agentId));
      }
      break;
    case "status":
      results.push(
        await registry.status(
          { paths: command.paths, globs: command.globs },
          command.mine ? { mine: true } : {},
        ),
      );
      break;
    case "board":
      results.push(
        await registry.board(
          { paths: command.paths, globs: command.globs },
          command.mine ? { mine: true } : {},
        ),
      );
      break;
    case "prune":
      results.push(await registry.prune(command.dryRun));
      break;
    case "identify":
      results.push(registry.identify(command.agentId));
      break;
    case "git-begin":
      for (const lockId of command.refreshLockIds) {
        results.push(await registry.refresh(lockId, command.ttlMs, command.agentId));
      }
      results.push(
        await registry.acquire({
          includeGitIndex: true,
          reason: command.reason,
          ttlMs: command.ttlMs,
          agentId: command.agentId,
        }),
      );
      break;
    case "git-end": {
      const endIds = requireLockIds(command.lockIds, "git end");
      // F4 backstop: re-verify the fence token on the @git/index lease before releasing.
      if (command.gitToken && endIds[0]) {
        await registry.verifyGitIndexToken(endIds[0], command.gitToken, command.agentId);
      }
      for (const lockId of endIds) {
        results.push(await registry.release(lockId, command.agentId));
      }
      for (const lockId of command.releaseLockIds) {
        results.push(await registry.release(lockId, command.agentId));
      }
      break;
    }
    case "git-verify":
      results.push(
        await runGitVerify(registry, {
          cwd: invocationCwd,
          includeUnstaged: command.includeUnstaged,
          pathspec: command.pathspec,
          pathspecMode: command.pathspecMode,
        }),
      );
      break;
  }

  const result = renderCommandResults(command, results, config);
  return {
    exitCode: result.exitCode,
    text: result.text,
    json: result.json,
    ...(result.stderr !== undefined ? { stderr: result.stderr } : {}),
  };
}

function renderCommandResults(
  command: LockCommand,
  results: LockOperationResult[],
  config: ResolvedLockpickConfig,
): { exitCode: number; text: string; json: unknown; stderr?: string } {
  const exitCode = results.find((result) => result.exitCode !== 0)?.exitCode ?? 0;
  if (command.name === "git-begin" && exitCode === 0) {
    return renderGitBegin(command, results, config, exitCode);
  }
  if (command.name === "git-verify") {
    return renderGitVerify(results);
  }
  const isBatch = results.length !== 1;
  const firstResult = results[0];
  const emptyJson = { kind: "batch", exitCode, results: [] };
  const fullJson = isBatch ? { kind: "batch", exitCode, results } : (firstResult ?? emptyJson);
  const json =
    command.verbose === true
      ? fullJson
      : isBatch
        ? {
            kind: "batch",
            exitCode,
            results: results.map((result) => compactLockJson(result)),
          }
        : firstResult
          ? compactLockJson(firstResult)
          : emptyJson;
  const rendered = renderCommandText(command, results, config, exitCode);
  return {
    exitCode,
    text: rendered.text,
    json,
    ...(rendered.stderr !== undefined ? { stderr: rendered.stderr } : {}),
  };
}

function renderGitBegin(
  command: LockCommand,
  results: LockOperationResult[],
  config: ResolvedLockpickConfig,
  exitCode: number,
): { exitCode: number; text: string; json: unknown; stderr?: string } {
  const acquired = results.find((result) => result.kind === "acquired");
  const refreshed = results.filter((result) => result.kind === "refreshed");
  const lockId = acquired?.lock?.lockId ?? null;
  const gitToken = acquired?.gitToken ?? null;
  const refreshedLockIds = refreshed
    .map((result) => result.lock?.lockId)
    .filter((id): id is string => Boolean(id));
  const json = {
    kind: "git-begin",
    exitCode,
    lock_id: lockId,
    git_token: gitToken,
    refreshed_lock_ids: refreshedLockIds,
  };
  // --id-only: exactly two shell-safe lines (lock id, then fence token).
  const text =
    command.idOnly === true
      ? [lockId, gitToken].filter((value): value is string => Boolean(value)).join("\n")
      : renderResults(results, command.verbose === true, config);
  return { exitCode, text, json };
}

function renderGitVerify(results: LockOperationResult[]): {
  exitCode: number;
  text: string;
  json: unknown;
  stderr?: string;
} {
  const report = results[0]?.verify;
  const json = report
    ? gitVerifyJson(report)
    : { ok: true, command: "git verify", state: "no_staged_changes" };
  const stderr = report ? gitVerifyFindings(report) : undefined;
  const text = report ? gitVerifySummary(report) : "git verify: no staged changes";
  // Advisory: always exit 0.
  return { exitCode: 0, text, json, ...(stderr !== undefined ? { stderr } : {}) };
}

function gitVerifyCoveredJson(entry: GitVerifyReport["covered"][number]): Record<string, unknown> {
  return {
    path: entry.path,
    covered_by: {
      lock_id: entry.coveredBy.lockId,
      resource: entry.coveredBy.resource,
      owner: entry.coveredBy.owner,
      owned_by_caller: entry.coveredBy.ownedByCaller,
    },
  };
}

function gitVerifyJson(report: GitVerifyReport): Record<string, unknown> {
  return {
    ok: report.ok,
    command: "git verify",
    caller: {
      agent_id: report.caller.agentId,
      source: report.caller.source,
      harness_scope: report.caller.harnessScope ?? null,
      reliable: report.caller.reliable,
    },
    state: report.state,
    staged_total: report.stagedTotal,
    covered: report.covered.map(gitVerifyCoveredJson),
    foreign_covered: report.foreignCovered.map(gitVerifyCoveredJson),
    uncovered: report.uncovered.map((entry) => ({
      path: entry.path,
      tested_against: entry.testedAgainst,
      ...(entry.hint !== undefined ? { hint: entry.hint } : {}),
    })),
    renames: report.renames.map((entry) => ({
      from: entry.from,
      to: entry.to,
      covered: entry.covered,
    })),
  };
}

function gitVerifyFindings(report: GitVerifyReport): string | undefined {
  if (report.state === "merge_or_sequencer") {
    return "merge/sequencer commit in progress — lock check skipped";
  }
  if (report.state === "no_staged_changes") return undefined;
  const lines: string[] = [];
  for (const entry of report.uncovered) {
    lines.push(`unlocked: ${entry.path}${entry.hint !== undefined ? ` (${entry.hint})` : ""}`);
  }
  for (const entry of report.foreignCovered) {
    lines.push(`locked by another agent: ${entry.path} (held by ${entry.coveredBy.owner})`);
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function gitVerifySummary(report: GitVerifyReport): string {
  if (report.state === "merge_or_sequencer")
    return "git verify: merge/sequencer in progress — skipped";
  if (report.state === "no_staged_changes") return "git verify: no staged changes";
  return `git verify: ${report.covered.length} covered, ${report.uncovered.length} unlocked, ${report.foreignCovered.length} foreign-covered`;
}

function renderCommandText(
  command: LockCommand,
  results: LockOperationResult[],
  config: ResolvedLockpickConfig,
  exitCode: number,
): { text: string; stderr?: string } {
  if (command.idOnly && exitCode === 0) {
    return { text: renderLockIds(command, results) };
  }
  const single = results.length === 1 ? results[0] : undefined;
  if (single && single.kind === "conflict" && command.verbose !== true) {
    const { data, next } = conflictRender(single, config);
    return { text: data.join("\n"), stderr: next };
  }
  return { text: renderResults(results, command.verbose === true, config) };
}

function compactLockJson(result: LockOperationResult): Record<string, unknown> {
  switch (result.kind) {
    case "acquired": {
      const base = {
        kind: result.kind,
        exitCode: result.exitCode,
        lock_id: result.lock?.lockId ?? null,
      };
      if (result.reclaimed && result.reclaimed.length > 0) {
        return { ...base, reclaimed_lock_ids: result.reclaimed.map((lock) => lock.lockId) };
      }
      return base;
    }
    case "refreshed":
    case "released":
      if (result.affectedLocks) {
        return {
          kind: result.kind,
          exitCode: result.exitCode,
          lock_count: result.affectedLocks.length,
          lock_ids: result.affectedLocks.map((lock) => lock.lockId),
        };
      }
      return {
        kind: result.kind,
        exitCode: result.exitCode,
        lock_id: result.lock?.lockId ?? null,
      };
    case "verified":
      return result.verify
        ? gitVerifyJson(result.verify)
        : { kind: "verified", exitCode: result.exitCode };
    case "conflict":
      return {
        kind: "conflict",
        exitCode: result.exitCode,
        suggested_action: result.suggestedAction,
        ahead_of: result.aheadOf ?? 0,
        ...(result.minRetryAfterMs !== undefined ? { retry_after_ms: result.minRetryAfterMs } : {}),
        conflicts: (result.conflicts ?? []).map((conflict) => ({
          lock_id: conflict.lock.lockId,
          owner: lockOwnerAgentId(conflict.lock.owner),
          reason: conflict.lock.reason,
          status: conflict.status,
          resources: conflict.resources.map((resource) => resource.value),
        })),
      };
    case "status":
      return {
        kind: "status",
        exitCode: result.exitCode,
        lock_count: result.locks?.length ?? 0,
        lock_ids: (result.locks ?? []).map((item) => item.lock.lockId),
        locks: (result.locks ?? []).map((item) => ({
          lock_id: item.lock.lockId,
          status: item.status,
        })),
      };
    case "board": {
      const agents = result.board ?? [];
      return {
        kind: "board",
        exitCode: result.exitCode,
        agent_count: agents.length,
        lock_count: agents.reduce((total, agent) => total + agent.locks.length, 0),
        agents: agents.map((agent) => ({
          agent: agent.agentId,
          locks: agent.locks.map((lock) => ({
            lock_id: lock.lockId,
            status: lock.status,
            resources: lock.resources,
            reclaimable: lock.reclaimable,
          })),
        })),
      };
    }
    case "pruned":
      return {
        kind: "pruned",
        exitCode: result.exitCode,
        dry_run: Boolean(result.dryRun),
        pruned_count: result.pruned?.length ?? 0,
        pruned_lock_ids: (result.pruned ?? []).map((lock) => lock.lockId),
      };
    case "identified":
      return {
        kind: "identified",
        exitCode: result.exitCode,
        agent_id: result.owner ? lockOwnerAgentId(result.owner) : null,
        source: result.owner ? lockOwnerSource(result.owner) : null,
        harness: result.owner?.harness ?? null,
        harness_scope: result.owner?.harnessScope ?? null,
      };
  }
}

function renderResults(
  results: LockOperationResult[],
  verbose: boolean,
  config: ResolvedLockpickConfig,
): string {
  return results.map((result) => renderLockResult(result, verbose, config)).join("\n");
}

function renderLockIds(command: LockCommand, results: LockOperationResult[]): string {
  const idResults =
    command.name === "git-begin"
      ? results.filter((result) => result.kind === "acquired")
      : results.filter((result) => result.lock);
  const statusIds = results.flatMap((result) =>
    result.kind === "status" ? (result.locks ?? []).map((item) => item.lock.lockId) : [],
  );
  const boardIds = results.flatMap((result) =>
    result.kind === "board"
      ? (result.board ?? []).flatMap((agent) => agent.locks.map((lock) => lock.lockId))
      : [],
  );
  const prunedIds = results.flatMap((result) =>
    result.kind === "pruned" ? (result.pruned ?? []).map((lock) => lock.lockId) : [],
  );
  const mineIds = results.flatMap((result) =>
    result.affectedLocks ? result.affectedLocks.map((lock) => lock.lockId) : [],
  );
  const lockIds = idResults.map((result) => result.lock?.lockId).filter((id): id is string => !!id);
  const ids = [...statusIds, ...boardIds, ...prunedIds, ...mineIds, ...lockIds];
  return ids.join("\n");
}

function requireLockIds(lockIds: string[], action: string): string[] {
  if (lockIds.length === 0) {
    throw new LockCommandError(`At least one lock id is required for ${action}.`, 2);
  }
  return lockIds;
}

export function renderLockResult(
  result: LockOperationResult,
  verbose = false,
  config?: ResolvedLockpickConfig,
): string {
  switch (result.kind) {
    case "acquired":
      if (!verbose) return `lock acquired: ${result.lock?.lockId ?? "<unknown>"}`;
      return [
        `lock acquired: ${result.lock?.lockId ?? "<unknown>"}`,
        ...(result.reclaimed && result.reclaimed.length > 0
          ? [`reclaimed: ${result.reclaimed.map((lock) => lock.lockId).join(", ")}`]
          : []),
        ...renderResources(result.lock?.resources ?? []),
      ].join("\n");
    case "conflict": {
      const { data, next } = conflictRender(result, config);
      return [...data, next].join("\n");
    }
    case "refreshed":
      if (result.affectedLocks) return renderMineSummary("refreshed", result.affectedLocks);
      return `lock refreshed: ${result.lock?.lockId ?? "<unknown>"}`;
    case "released":
      if (result.affectedLocks) return renderMineSummary("released", result.affectedLocks);
      return `lock released: ${result.lock?.lockId ?? "<unknown>"}`;
    case "verified":
      return result.verify ? gitVerifySummary(result.verify) : "git verify: no report";
    case "status":
      return verbose ? renderStatus(result.locks ?? []) : renderStatusSummary(result.locks ?? []);
    case "board":
      return renderBoard(result.board ?? []);
    case "pruned":
      return result.dryRun
        ? `prunable locks: ${result.pruned?.length ?? 0}`
        : `pruned locks: ${result.pruned?.length ?? 0}`;
    case "identified":
      if (!verbose) return `agent id: ${agentIdText(result.owner)}`;
      return [
        `agent id: ${agentIdText(result.owner)}`,
        `source: ${result.owner ? (lockOwnerSource(result.owner) ?? "<unknown>") : "<unknown>"}`,
        `harness: ${result.owner?.harness ?? "<none>"}`,
        `harness scope: ${result.owner?.harnessScope ?? "<none>"}`,
        `hostname: ${result.owner?.hostname ?? "<unknown>"}`,
        `pid: ${result.owner?.pid ?? "<unknown>"}`,
      ].join("\n");
  }
}

function renderResources(resources: LockResource[]): string[] {
  if (resources.length === 0) return ["resources: none"];
  return ["resources:", ...resources.map((resource) => `- ${resource.kind} ${resource.value}`)];
}

function renderMineSummary(verb: string, locks: { lockId: string }[]): string {
  if (locks.length === 0)
    return `no locks to ${verb === "released" ? "release" : "refresh"} (none held)`;
  return `${verb} ${locks.length} lock(s): ${locks.map((lock) => lock.lockId).join(", ")}`;
}

function conflictRender(
  result: LockOperationResult,
  config: ResolvedLockpickConfig | undefined,
): { data: string[]; next: string } {
  const conflicts = result.conflicts ?? [];
  const next = conflictNextLine(result.suggestedAction, config);
  if (conflicts.length <= 1) {
    const first = conflicts[0];
    if (!first) return { data: ["lock conflict"], next };
    return {
      data: [
        `lock conflict: ${first.resources.map((resource) => resource.value).join(", ")}`,
        `held by: ${lockOwnerAgentId(first.lock.owner)}`,
        `reason: ${first.lock.reason}`,
        `status: ${first.status}, ${conflictLeaseText(first.lock)}`,
      ],
      next,
    };
  }
  // Multiple holders: lead with the binding constraint (non-reclaimable holders
  // first) so an agent does not prune around a still-live blocker.
  const ordered = [...conflicts].sort((left, right) => conflictRank(left) - conflictRank(right));
  const shown = ordered.slice(0, 3);
  const totalUnits = conflicts.reduce((sum, conflict) => sum + conflict.resources.length, 0);
  const data = [`lock conflict: ${totalUnits} unit(s) across ${conflicts.length} holders`];
  for (const conflict of shown) {
    data.push(
      `- ${conflict.resources.map((resource) => resource.value).join(", ")} | ${lockOwnerAgentId(
        conflict.lock.owner,
      )} (${conflict.status}, ${conflictLeaseText(conflict.lock)})`,
    );
  }
  if (conflicts.length > shown.length) {
    const reclaimable = conflicts.filter((conflict) => conflict.status === "reclaimable").length;
    data.push(`+${conflicts.length - shown.length} more holders (${reclaimable} reclaimable)`);
  }
  return { data, next };
}

function conflictRank(conflict: LockConflict): number {
  return conflict.status === "reclaimable" ? 1 : 0;
}

function conflictLeaseText(lock: LockConflict["lock"]): string {
  const expiresAt = Date.parse(lock.leaseExpiresAt);
  return Number.isFinite(expiresAt)
    ? `expires ${new Date(expiresAt).toISOString().replace(/\.\d{3}Z$/, "Z")}`
    : "lease expiry unknown";
}

function conflictNextLine(action: string, config: ResolvedLockpickConfig | undefined): string {
  const pruneCommand = config ? renderLockpickCommand(config, ["prune"]) : "lockpick prune";
  const next =
    action === "prune_then_retry"
      ? `${pruneCommand}, then retry`
      : "work on unrelated unlocked files, then retry";
  return `next: ${next}`;
}

function renderStatus(locks: ClassifiedLock[]): string {
  if (locks.length === 0) return "No active locks.";
  return locks
    .map((item) =>
      [
        `lock: ${item.lock.lockId}`,
        `status: ${item.status}`,
        `owner: ${lockOwnerAgentId(item.lock.owner)}`,
        `reason: ${item.lock.reason}`,
        ...renderResources(item.lock.resources),
      ].join("\n"),
    )
    .join("\n\n");
}

function renderBoard(board: BoardAgent[]): string {
  if (board.length === 0) return "No active locks.";
  const total = board.reduce((sum, agent) => sum + agent.locks.length, 0);
  const blocks = board.map((agent) =>
    [
      `agent ${agent.agentId}`,
      ...agent.locks.map(
        (lock) =>
          `- ${lock.resources.join(", ")} (${lock.reason}) | ${lock.status}, ${lock.when}${
            lock.reclaimable ? " -> prune, then acquire" : ""
          }`,
      ),
    ].join("\n"),
  );
  return [`board: ${total} active lock(s) across ${board.length} agent(s)`, ...blocks].join("\n");
}

function agentIdText(owner: LockOperationResult["owner"]): string {
  return owner ? lockOwnerAgentId(owner) : "<unknown>";
}

function renderStatusSummary(locks: ClassifiedLock[]): string {
  if (locks.length === 0) return "No active locks.";
  return `active locks: ${locks.length}`;
}
