import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFileAtomic } from "../src/io";

// writeFileAtomic is the Windows-safe temp-then-rename replace used by the lock core. POSIX renames
// atomically on the first attempt, so the retry path is exercised here via an injected rename on
// every OS. A "no leaked temp file" assertion guards the cleanup contract on each failure mode.

test("writes full content to a fresh path", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "nested", "fresh.json");
    await writeFileAtomic(target, "hello\n");
    expect(await readFile(target, "utf8")).toBe("hello\n");
    await expectNoTempFiles(path.dirname(target));
  });
});

test("overwrites an existing target with content fully replaced", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "replace.json");
    await writeFile(target, "old-and-longer-contents\n", "utf8");
    await writeFileAtomic(target, "new\n");
    expect(await readFile(target, "utf8")).toBe("new\n");
    await expectNoTempFiles(workspace);
  });
});

test("retries a rename that throws EPERM then succeeds, leaving no temp file", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "retry.json");
    const realRename = (await import("node:fs/promises")).rename;
    let calls = 0;
    const sleeps: number[] = [];
    await writeFileAtomic(target, "ok\n", {
      rename: async (from, to) => {
        calls += 1;
        if (calls <= 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
        await realRename(from, to);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(calls).toBe(4);
    expect(sleeps).toHaveLength(3);
    expect(await readFile(target, "utf8")).toBe("ok\n");
    await expectNoTempFiles(workspace);
  });
});

test("rejects when rename always throws EPERM and leaves no temp file behind", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "exhausted.json");
    let calls = 0;
    await expect(
      writeFileAtomic(target, "never\n", {
        attempts: 5,
        rename: async () => {
          calls += 1;
          throw Object.assign(new Error("locked"), { code: "EPERM" });
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow("locked");
    expect(calls).toBe(5);
    await expectNoTempFiles(workspace);
  });
});

test("rethrows a non-retryable rename error immediately without retrying", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "fatal.json");
    let calls = 0;
    await expect(
      writeFileAtomic(target, "nope\n", {
        rename: async () => {
          calls += 1;
          throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
        },
        sleep: async () => {},
      }),
    ).rejects.toThrow("cross-device");
    expect(calls).toBe(1);
    await expectNoTempFiles(workspace);
  });
});

async function expectNoTempFiles(dir: string): Promise<void> {
  const entries = await readdir(dir);
  expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
}

async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-atomic-"));
  try {
    await fn(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
