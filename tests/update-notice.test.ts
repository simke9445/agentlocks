import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isNewerVersion,
  maybePrintUpdateNotice,
  renderUpdateNotice,
} from "../src/cli/update-notice";

test("version comparison handles semver releases", () => {
  expect(isNewerVersion("0.1.2", "0.1.1")).toBe(true);
  expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
  expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
  expect(isNewerVersion("0.1.1", "0.1.1")).toBe(false);
  expect(isNewerVersion("0.1.1", "0.1.2")).toBe(false);
  expect(isNewerVersion("0.1.2", "0.1.2-beta.1")).toBe(true);
  expect(isNewerVersion("0.1.2-beta.1", "0.1.2")).toBe(false);
});

test("renders update command guidance", () => {
  expect(renderUpdateNotice("0.1.1", "0.1.2")).toContain(
    "New Agentlocks version available: 0.1.1 -> 0.1.2",
  );
  expect(renderUpdateNotice("0.1.1", "0.1.2")).toContain("bun update -g --latest agentlocks");
  expect(renderUpdateNotice("0.1.1", "0.1.2")).toContain("npm install -g agentlocks@latest");
});

test("prints update notice when forced and registry has a newer version", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-update-notice-"));
  try {
    const stderr = captureStderr(true);
    await maybePrintUpdateNotice({
      cachePath: path.join(workspace, "cache.json"),
      currentVersion: "0.1.1",
      env: { AGENTLOCKS_UPDATE_CHECK: "1" },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ version: "0.1.2" }),
      }),
      now: new Date("2026-05-27T10:00:00Z"),
      stderr,
    });

    expect(stderr.output).toContain("New Agentlocks version available: 0.1.1 -> 0.1.2");
    expect(stderr.output).toContain("Update with: bun update -g --latest agentlocks");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("queries the unscoped agentlocks registry URL, not a scoped one", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-update-notice-"));
  try {
    let requestedUrl = "";
    await maybePrintUpdateNotice({
      cachePath: path.join(workspace, "cache.json"),
      currentVersion: "0.1.1",
      env: { AGENTLOCKS_UPDATE_CHECK: "1" },
      fetchImpl: async (url) => {
        requestedUrl = url;
        return { ok: true, json: async () => ({ version: "0.1.1" }) };
      },
      now: new Date("2026-05-27T10:00:00Z"),
      stderr: captureStderr(true),
    });

    // Regression guard for the 0.5.0 rename, which find-replaced lockpick -> agentlocks
    // but kept the scope prefix, leaving this pointed at the nonexistent
    // @simke9445/agentlocks so every check 404'd and the notice never fired. The
    // published package is the unscoped `agentlocks`.
    expect(requestedUrl).toBe("https://registry.npmjs.org/agentlocks/latest");
    expect(requestedUrl).not.toContain("@simke9445");
    expect(requestedUrl).not.toContain("%2f");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("prints the notice from a fresh cache on every run without refetching", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-update-notice-"));
  try {
    const cachePath = path.join(workspace, "cache.json");
    const now = new Date("2026-05-27T10:00:00Z");
    await writeFile(
      cachePath,
      JSON.stringify({
        checkedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        latestVersion: "0.1.2",
      }),
      "utf8",
    );

    let fetchCalled = false;
    const stderr = captureStderr(true);
    await maybePrintUpdateNotice({
      cachePath,
      currentVersion: "0.1.1",
      env: { AGENTLOCKS_UPDATE_CHECK: "1" },
      fetchImpl: async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({ version: "0.1.2" }) };
      },
      now,
      stderr,
    });

    expect(fetchCalled).toBe(false);
    expect(stderr.output).toContain("New Agentlocks version available: 0.1.1 -> 0.1.2");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("refetches once the cache is older than an hour", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agentlocks-update-notice-"));
  try {
    const cachePath = path.join(workspace, "cache.json");
    const now = new Date("2026-05-27T10:00:00Z");
    // Two hours old: stale under the 1h TTL, but fresh under the old 24h TTL. The
    // cached version matches current, so only a real refetch can produce the notice.
    await writeFile(
      cachePath,
      JSON.stringify({
        checkedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        latestVersion: "0.1.1",
      }),
      "utf8",
    );

    let fetchCalled = false;
    const stderr = captureStderr(true);
    await maybePrintUpdateNotice({
      cachePath,
      currentVersion: "0.1.1",
      env: { AGENTLOCKS_UPDATE_CHECK: "1" },
      fetchImpl: async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({ version: "0.1.2" }) };
      },
      now,
      stderr,
    });

    expect(fetchCalled).toBe(true);
    expect(stderr.output).toContain("New Agentlocks version available: 0.1.1 -> 0.1.2");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("skips update checks for machine-readable commands", async () => {
  let called = false;
  const stderr = captureStderr(true);
  await maybePrintUpdateNotice({
    argv: ["status", "--json"],
    currentVersion: "0.1.1",
    env: {},
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ version: "0.1.2" }) };
    },
    stderr,
  });

  expect(called).toBe(false);
  expect(stderr.output).toBe("");
});

test("skips update checks outside interactive stderr by default", async () => {
  let called = false;
  const stderr = captureStderr(false);
  await maybePrintUpdateNotice({
    currentVersion: "0.1.1",
    env: {},
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ version: "0.1.2" }) };
    },
    stderr,
  });

  expect(called).toBe(false);
  expect(stderr.output).toBe("");
});

function captureStderr(isTTY: boolean): Pick<NodeJS.WriteStream, "isTTY" | "write"> & {
  output: string;
} {
  return {
    isTTY,
    output: "",
    write(chunk: string | Uint8Array) {
      this.output += String(chunk);
      return true;
    },
  } as Pick<NodeJS.WriteStream, "isTTY" | "write"> & { output: string };
}
