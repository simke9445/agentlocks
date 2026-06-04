import { promises as fs } from "node:fs";
import path from "node:path";
import type { LockResource } from "./types";
import { GIT_INDEX_RESOURCE, LockCommandError } from "./types";

const globChars = /[*?]|\[[^\]/]+\]/;

export interface NormalizeResourcesOptions {
  cwd: string;
  resources?: string[];
  includeGitIndex?: boolean;
}

export async function normalizeLockResources(
  options: NormalizeResourcesOptions,
): Promise<LockResource[]> {
  const resources: LockResource[] = [];
  if (options.includeGitIndex) resources.push({ kind: "git", value: GIT_INDEX_RESOURCE });
  for (const rawResource of options.resources ?? []) {
    resources.push(await normalizeResourceSpec(rawResource, options.cwd));
  }
  return dedupeResources(resources);
}

export function dedupeResources(resources: LockResource[]): LockResource[] {
  const seen = new Set<string>();
  const deduped: LockResource[] = [];
  for (const resource of resources) {
    const key = `${resource.kind}:${resource.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(resource);
  }
  return deduped;
}

export function unionResources(left: LockResource[], right: LockResource[]): LockResource[] {
  return dedupeResources([...left, ...right]);
}

export async function normalizePathResource(rawPath: string, cwd: string): Promise<LockResource> {
  const value = normalizeRepoRelativeInput(rawPath, "path");
  if (isGlobResourceSpec(value)) {
    throw new LockCommandError(`Path lock must not contain glob characters: ${rawPath}`, 2);
  }
  await assertExistingPathStaysInsideRepo(value, cwd);
  return { kind: "path", value };
}

export function normalizeGlobResource(rawGlob: string): LockResource {
  return { kind: "glob", value: normalizeRepoRelativeInput(rawGlob, "glob") };
}

export async function normalizeResourceSpec(
  rawResource: string,
  cwd: string,
): Promise<LockResource> {
  const value = normalizeRepoRelativeInput(rawResource, "resource");
  if (isGlobResourceSpec(value)) return { kind: "glob", value };
  await assertExistingPathStaysInsideRepo(value, cwd);
  return { kind: "path", value };
}

export function isGlobResourceSpec(value: string): boolean {
  return globChars.test(value);
}

function normalizeRepoRelativeInput(rawValue: string, label: string): string {
  const trimmed = rawValue.trim();
  if (trimmed === "") throw new LockCommandError(`Lock ${label} must not be empty.`, 2);
  if (trimmed.includes("\0")) {
    throw new LockCommandError(`Lock ${label} contains an invalid null byte.`, 2);
  }
  if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new LockCommandError(`Lock ${label} must be repo-relative: ${rawValue}`, 2);
  }

  const posixInput = trimmed.replace(/\\/g, "/");
  const normalized = path.posix.normalize(posixInput).replace(/^\.\/+/, "");
  if (normalized === "." || normalized === "") {
    throw new LockCommandError(`Lock ${label} must name a file or glob: ${rawValue}`, 2);
  }
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new LockCommandError(`Lock ${label} must stay inside the repository: ${rawValue}`, 2);
  }
  return normalized;
}

async function assertExistingPathStaysInsideRepo(repoPath: string, cwd: string): Promise<void> {
  const absolute = path.resolve(cwd, repoPath);
  const relative = path.relative(cwd, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LockCommandError(`Lock path must stay inside the repository: ${repoPath}`, 2);
  }

  try {
    await fs.lstat(absolute);
  } catch {
    return;
  }

  const real = await fs.realpath(absolute);
  const realCwd = await fs.realpath(cwd);
  const realRelative = path.relative(realCwd, real);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new LockCommandError(`Lock path resolves outside the repository: ${repoPath}`, 2);
  }
}
