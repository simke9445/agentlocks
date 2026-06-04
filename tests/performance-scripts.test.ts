import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();

test("performance scripts expose help and deterministic self-tests", async () => {
  const latencyHelp = await execFileAsync("node", [
    path.join(root, "scripts/performance/latency-benchmark.mjs"),
    "--help",
  ]);
  expect(latencyHelp.stdout).toContain("--samples");

  await execFileAsync("node", [
    path.join(root, "scripts/performance/latency-benchmark.mjs"),
    "--self-test",
  ]);

  const sizeHelp = await execFileAsync("node", [
    path.join(root, "scripts/performance/measure-size.mjs"),
    "--help",
  ]);
  expect(sizeHelp.stdout).toContain("--out-dir");
});

test("performance scripts can generate minimal local artifacts", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "agentlocks-perf-script-test-"));
  try {
    await execFileAsync("bun", ["run", "build"], { cwd: root });

    await execFileAsync("node", [
      path.join(root, "scripts/performance/measure-size.mjs"),
      "--skip-build",
      "--skip-clean-check",
      "--out-dir",
      outDir,
    ]);

    await execFileAsync("node", [
      path.join(root, "scripts/performance/latency-benchmark.mjs"),
      "--skip-clean-check",
      "--out-dir",
      outDir,
      "--samples",
      "1",
      "--warmups",
      "0",
      "--bootstrap",
      "10",
      "--variants",
      "direct",
      "--active-counts",
      "0",
      "--scenarios",
      "module_load,status_json",
    ]);

    const size = JSON.parse(await readFile(path.join(outDir, "size.json"), "utf8")) as {
      bundle?: { raw_bytes?: unknown; first_line?: unknown };
    };
    expect(size.bundle?.raw_bytes).toBeGreaterThan(0);
    expect(size.bundle?.first_line).toBe("#!/usr/bin/env node");

    const latency = JSON.parse(await readFile(path.join(outDir, "latency.json"), "utf8")) as {
      cases?: unknown[];
    };
    expect(latency.cases?.length).toBe(2);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
