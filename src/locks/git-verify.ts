import { spawn } from "node:child_process";
import path from "node:path";
import { pathExists } from "../io";
import { resourceCovers } from "./matching";
import type { FileLockRegistry } from "./registry";
import { isReliableOwnerIdentity, lockOwnerAgentId } from "./session";
import type {
  ClassifiedLock,
  GitVerifyCovered,
  GitVerifyReport,
  GitVerifyState,
  GitVerifyUncovered,
  LockOperationResult,
  LockResource,
} from "./types";

export interface GitVerifyOptions {
  cwd: string;
  includeUnstaged: boolean;
  pathspec: string[];
  pathspecMode: "only" | "include" | null;
  agentId?: string | null;
}

interface GitCapture {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function captureGit(args: string[], cwd: string): Promise<GitCapture> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolve({ code: 127, stdout: Buffer.alloc(0), stderr: "git spawn failed" });
      return;
    }
    const out: Buffer[] = [];
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => out.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", () =>
      resolve({ code: 127, stdout: Buffer.alloc(0), stderr: "git not found" }),
    );
    child.on("close", (code) =>
      resolve({ code: code ?? 0, stdout: Buffer.concat(out), stderr: err }),
    );
  });
}

interface NameStatusUnit {
  /** Representative path used for coverage/listing (the new path for renames). */
  pathValue: string;
  /** All paths whose coverage satisfies this unit (both endpoints for a rename). */
  candidates: string[];
  rename?: { from: string; to: string };
}

/** Parse `--name-status -z -M` NUL-framed output into coverage units. */
function parseNameStatusZ(stdout: Buffer): NameStatusUnit[] {
  const fields = stdout.toString("utf8").split("\0");
  const units: NameStatusUnit[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index];
    if (!status) {
      index++;
      continue;
    }
    if (status[0] === "R" || status[0] === "C") {
      const from = fields[index + 1];
      const to = fields[index + 2];
      index += 3;
      if (from && to) {
        units.push({ pathValue: to, candidates: [from, to], rename: { from, to } });
      }
      continue;
    }
    const filePath = fields[index + 1];
    index += 2;
    if (filePath) units.push({ pathValue: filePath, candidates: [filePath] });
  }
  return units;
}

function dedupeUnits(units: NameStatusUnit[]): NameStatusUnit[] {
  const seen = new Set<string>();
  const out: NameStatusUnit[] = [];
  for (const unit of units) {
    const key = unit.rename ? `R:${unit.rename.from}->${unit.rename.to}` : `P:${unit.pathValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(unit);
  }
  return out;
}

const QUOTE_PATH_FLAG = ["-c", "core.quotePath=false"] as const;

async function inProgressMergeOrSequencer(cwd: string): Promise<boolean> {
  const dir = await captureGit(["rev-parse", "--git-dir"], cwd);
  if (dir.code !== 0) return false;
  const gitDir = path.resolve(cwd, dir.stdout.toString("utf8").trim());
  const markers = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"];
  for (const marker of markers) {
    if (await pathExists(path.join(gitDir, marker))) return true;
  }
  return false;
}

/** Compute the EFFECTIVE committed set for the requested commit form (GIT_HOOK_SPEC §3.5a). */
async function enumerateEffectiveSet(options: GitVerifyOptions): Promise<NameStatusUnit[]> {
  const { cwd } = options;
  const units: NameStatusUnit[] = [];

  if (options.pathspec.length > 0 && options.pathspecMode === "only") {
    // `git commit -- <pathspec>` / `--only`: ONLY those paths (vs HEAD), ignore the rest of the index.
    const res = await captureGit(
      [...QUOTE_PATH_FLAG, "diff", "HEAD", "--name-status", "-z", "-M", "--", ...options.pathspec],
      cwd,
    );
    units.push(...parseNameStatusZ(res.stdout));
    return dedupeUnits(units);
  }

  // Base: the staged index.
  const staged = await captureGit(
    [...QUOTE_PATH_FLAG, "diff", "--cached", "--name-status", "-z", "-M"],
    cwd,
  );
  units.push(...parseNameStatusZ(staged.stdout));

  if (options.includeUnstaged) {
    // `git commit -a`: union tracked-but-unstaged modified/deleted.
    const worktree = await captureGit(
      [...QUOTE_PATH_FLAG, "diff", "--name-status", "-z", "-M"],
      cwd,
    );
    units.push(...parseNameStatusZ(worktree.stdout));
  }

  if (options.pathspec.length > 0 && options.pathspecMode === "include") {
    // `git commit --include <pathspec>`: index UNION the named paths' changes.
    const included = await captureGit(
      [...QUOTE_PATH_FLAG, "diff", "HEAD", "--name-status", "-z", "-M", "--", ...options.pathspec],
      cwd,
    );
    units.push(...parseNameStatusZ(included.stdout));
  }

  return dedupeUnits(units);
}

interface Candidate {
  lock: ClassifiedLock["lock"];
  resource: LockResource;
}

function coveringCandidate(candidates: Candidate[], filePath: string): Candidate | null {
  const requested: LockResource = { kind: "path", value: filePath };
  for (const candidate of candidates) {
    if (resourceCovers(candidate.resource, requested)) return candidate;
  }
  return null;
}

function subdirHint(filePath: string, candidates: Candidate[]): string | undefined {
  // §3.6: a bare lock stored from a subdir won't match a root-relative staged path.
  for (const candidate of candidates) {
    if (candidate.resource.kind !== "path") continue;
    const value = candidate.resource.value;
    if (!value.includes("/") && filePath.endsWith(`/${value}`)) {
      return `held lock '${value}' looks subdir-relative; staged path is '${filePath}' — re-acquire with the repo-root-relative path`;
    }
  }
  return undefined;
}

export async function runGitVerify(
  registry: FileLockRegistry,
  options: GitVerifyOptions,
): Promise<LockOperationResult> {
  const caller = registry.resolveOwner(options.agentId ?? null);
  const reliable = isReliableOwnerIdentity(caller);
  const callerId = lockOwnerAgentId(caller);
  const callerAnnotation: GitVerifyReport["caller"] = {
    agentId: callerId,
    source: caller.source,
    reliable,
    ...(caller.harnessScope !== undefined ? { harnessScope: caller.harnessScope } : {}),
  };

  let state: GitVerifyState = "ordinary";
  let units: NameStatusUnit[] = [];
  try {
    if (await inProgressMergeOrSequencer(options.cwd)) {
      state = "merge_or_sequencer";
    } else {
      units = await enumerateEffectiveSet(options);
      if (units.length === 0) state = "no_staged_changes";
    }
  } catch {
    // Fail open: any git/IO error yields an empty, advisory report.
    state = "no_staged_changes";
    units = [];
  }

  const covered: GitVerifyCovered[] = [];
  const foreignCovered: GitVerifyCovered[] = [];
  const uncovered: GitVerifyUncovered[] = [];
  const renames: GitVerifyReport["renames"] = [];

  if (state === "ordinary") {
    // Non-reclaimable path/glob locks are the only coverage candidates (finding #7).
    const classified = await registry.classifyActiveReadOnly();
    const candidates: Candidate[] = [];
    for (const item of classified) {
      if (item.status === "reclaimable") continue;
      for (const resource of item.lock.resources) {
        if (resource.kind === "git") continue;
        candidates.push({ lock: item.lock, resource });
      }
    }

    for (const unit of units) {
      let hit: Candidate | null = null;
      for (const filePath of unit.candidates) {
        hit = coveringCandidate(candidates, filePath);
        if (hit) break;
      }
      if (unit.rename) {
        renames.push({ from: unit.rename.from, to: unit.rename.to, covered: Boolean(hit) });
      }
      if (hit) {
        const ownedByCaller = reliable && lockOwnerAgentId(hit.lock.owner) === callerId;
        const entry: GitVerifyCovered = {
          path: unit.pathValue,
          coveredBy: {
            lockId: hit.lock.lockId,
            resource: hit.resource.value,
            owner: lockOwnerAgentId(hit.lock.owner),
            ownedByCaller,
          },
        };
        if (ownedByCaller || !reliable) covered.push(entry);
        else foreignCovered.push(entry);
      } else {
        const testedAgainst = candidates.map((candidate) => candidate.resource.value);
        const hint = subdirHint(unit.pathValue, candidates);
        uncovered.push({
          path: unit.pathValue,
          testedAgainst,
          ...(hint !== undefined ? { hint } : {}),
        });
      }
    }
  }

  const report: GitVerifyReport = {
    ok: true,
    state,
    caller: callerAnnotation,
    stagedTotal: units.length,
    covered,
    foreignCovered,
    uncovered,
    renames,
  };

  return {
    kind: "verified",
    exitCode: 0,
    suggestedAction: "verified",
    verify: report,
  };
}
