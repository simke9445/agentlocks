import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

// Rename errors that, on Windows, mean a concurrent reader / antivirus / search indexer holds a
// transient handle on the target. POSIX rename atomically replaces and never surfaces these, so the
// retry below is a no-op there.
const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOENT"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Atomically replace `targetPath` with `contents` via temp-then-rename.
 *
 * On POSIX the rename replaces the target in one syscall and the first attempt succeeds. On Windows
 * `MoveFileEx(REPLACE_EXISTING)` intermittently throws EPERM/EACCES/EBUSY/ENOENT when something
 * holds a handle on the target; we retry with bounded backoff (the `write-file-atomic` pattern). The
 * temp file is always removed on failure so it can never leak. `rename`/`sleep`/`attempts` are
 * injectable for testing; the defaults give zero behavior change on POSIX.
 */
export async function writeFileAtomic(
  targetPath: string,
  contents: string,
  opts?: {
    rename?: (from: string, to: string) => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
    attempts?: number;
  },
): Promise<void> {
  const rename = opts?.rename ?? fs.rename;
  const sleep = opts?.sleep ?? defaultSleep;
  const attempts = opts?.attempts ?? 10;

  await ensureDir(path.dirname(targetPath));
  // Same directory as the target so the rename stays on one filesystem (never EXDEV). The random
  // suffix prevents collisions between two writers in the same process+millisecond.
  const temp = `${targetPath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temp, contents, "utf8");

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(temp, targetPath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= attempts || !code || !RETRYABLE_RENAME_CODES.has(code)) throw error;
        // Bounded backoff capped so ~10 attempts total well under ~1s.
        await sleep(Math.min(100, attempt * 10));
      }
    }
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
