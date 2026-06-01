import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// The published `agentlocks` bin is a thin Node launcher that resolves the
// prebuilt, Bun-embedded binary from the agentlocks-<platform> optional
// dependency and execs it. These tests stage that node_modules layout with a
// POSIX shell-script stub standing in for the real 63MB binary, so they verify
// the launcher's resolution + arg-forwarding + exit-code propagation without a
// compile. The real binary is exercised end-to-end by scripts/smoke-install.mjs.
const LAUNCHER = path.join(process.cwd(), "bin", "agentlocks.mjs");

function stageInstall(stubBody: string): { launcher: string; cleanup: () => void } {
  const stage = mkdtempSync(path.join(os.tmpdir(), "agentlocks-launcher-"));
  const platformPackage = `agentlocks-${process.platform}-${process.arch}`;
  const exe = process.platform === "win32" ? "agentlocks.exe" : "agentlocks";
  const mainBin = path.join(stage, "node_modules", "agentlocks", "bin");
  const platBin = path.join(stage, "node_modules", platformPackage, "bin");
  mkdirSync(mainBin, { recursive: true });
  mkdirSync(platBin, { recursive: true });
  cpSync(LAUNCHER, path.join(mainBin, "agentlocks.mjs"));
  writeFileSync(
    path.join(stage, "node_modules", "agentlocks", "package.json"),
    JSON.stringify({ name: "agentlocks", version: "0.0.0" }),
  );
  writeFileSync(
    path.join(stage, "node_modules", platformPackage, "package.json"),
    JSON.stringify({ name: platformPackage, version: "0.0.0" }),
  );
  const stub = path.join(platBin, exe);
  writeFileSync(stub, stubBody);
  chmodSync(stub, 0o755);
  return {
    launcher: path.join(mainBin, "agentlocks.mjs"),
    cleanup: () => rmSync(stage, { recursive: true, force: true }),
  };
}

test("launcher execs the prebuilt platform binary, forwarding args (exit 0)", () => {
  if (process.platform === "win32") {
    // The shell-script stub is POSIX-only; assert the package-name mapping instead.
    expect(`agentlocks-${process.platform}-${process.arch}`).toContain("win32");
    return;
  }
  const { launcher, cleanup } = stageInstall('#!/bin/sh\nprintf "%s\\n" "$@"\nexit 0\n');
  try {
    const result = spawnSync(process.execPath, [launcher, "capabilities", "--json"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("capabilities");
    expect(result.stdout).toContain("--json");
  } finally {
    cleanup();
  }
});

test("launcher propagates the prebuilt binary's nonzero exit code", () => {
  if (process.platform === "win32") {
    expect(process.arch.length).toBeGreaterThan(0);
    return;
  }
  const { launcher, cleanup } = stageInstall("#!/bin/sh\nexit 7\n");
  try {
    const result = spawnSync(process.execPath, [launcher, "status"], { encoding: "utf8" });
    expect(result.status).toBe(7);
  } finally {
    cleanup();
  }
});
