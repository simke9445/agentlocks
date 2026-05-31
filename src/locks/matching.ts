import type { LockResource } from "./types";
import { GIT_INDEX_RESOURCE } from "./types";

export function resourcesConflict(left: LockResource, right: LockResource): boolean {
  if (left.kind === "git" || right.kind === "git") {
    return left.kind === "git" && right.kind === "git" && left.value === GIT_INDEX_RESOURCE;
  }
  if (left.kind === "path" && right.kind === "path") return left.value === right.value;
  if (left.kind === "path" && right.kind === "glob") return globMatches(right.value, left.value);
  if (left.kind === "glob" && right.kind === "path") return globMatches(left.value, right.value);
  return globsMayOverlap(left.value, right.value);
}

export function conflictingResources(
  requested: LockResource[],
  existing: LockResource[],
): LockResource[] {
  return requested.filter((request) => existing.some((held) => resourcesConflict(request, held)));
}

export function resourceSetsConflict(left: LockResource[], right: LockResource[]): boolean {
  return left.some((leftResource) =>
    right.some((rightResource) => resourcesConflict(leftResource, rightResource)),
  );
}

/**
 * Direction-aware coverage: does holding `held` fully cover `requested`?
 *
 * Unlike {@link resourcesConflict} (symmetric *overlap*), this asks whether a held
 * resource is sufficient to satisfy a request — used by F1 idempotent acquire and the
 * F3 `git verify` engine. A held glob may cover a narrower request, but a held narrow
 * path must NOT "cover" a broader request.
 *
 * Rules:
 * - `@git/index` covers only `@git/index` (and a file resource never covers/!covered-by it).
 * - held `path` covers a requested `path` iff equal.
 * - held `glob` covers a requested concrete `path` iff `globMatches(held, path)`.
 * - held `path` never covers a requested `glob` (a point cannot contain a set).
 * - held `glob` covers a requested `glob` iff string-equal only — `globMatches` tests one
 *   string against one pattern, which is NOT glob-language containment (held `src/*` would
 *   `globMatches` the literal `src/**` yet does not cover what `src/**` admits).
 */
export function resourceCovers(held: LockResource, requested: LockResource): boolean {
  if (held.kind === "git" || requested.kind === "git") {
    return held.kind === "git" && requested.kind === "git";
  }
  if (requested.kind === "path") {
    if (held.kind === "path") return held.value === requested.value;
    return globMatches(held.value, requested.value);
  }
  // requested.kind === "glob"
  if (held.kind === "path") return false;
  return held.value === requested.value;
}

/** Every `requested` resource is covered by at least one `held` resource (direction-aware). */
export function resourcesCover(held: LockResource[], requested: LockResource[]): boolean {
  return requested.every((request) =>
    held.some((heldResource) => resourceCovers(heldResource, request)),
  );
}

export function globMatches(pattern: string, filePath: string): boolean {
  return globToRegExp(pattern).test(filePath);
}

function globsMayOverlap(left: string, right: string): boolean {
  const leftPrefix = staticPrefix(left);
  const rightPrefix = staticPrefix(right);
  if (leftPrefix === "" || rightPrefix === "") return true;
  return leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix);
}

function staticPrefix(pattern: string): string {
  const firstGlob = pattern.search(/[*?]/);
  const rawPrefix = firstGlob === -1 ? pattern : pattern.slice(0, firstGlob);
  const slashIndex = rawPrefix.lastIndexOf("/");
  if (slashIndex === -1) return "";
  return rawPrefix.slice(0, slashIndex + 1);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index++;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char?.replace(/[|\\{}()[\]^$+?.]/g, "\\$&") ?? "";
  }
  source += "$";
  return new RegExp(source);
}
