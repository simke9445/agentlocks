#!/usr/bin/env bun
// Build self-contained, Bun-embedded binaries for each supported platform into
// npm/<platform>/bin/, ready to publish as the agentlocks-<platform> optional
// dependencies. CI builds the full matrix; pass a single target to build one:
//
//   bun scripts/build-binaries.mjs              # all targets
//   bun scripts/build-binaries.mjs darwin-arm64 # just this platform
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "bin", "agentlocks.ts");

const TARGETS = [
  { dir: "darwin-arm64", target: "bun-darwin-arm64" },
  { dir: "darwin-x64", target: "bun-darwin-x64" },
  { dir: "linux-x64", target: "bun-linux-x64" },
  { dir: "linux-arm64", target: "bun-linux-arm64" },
];

const only = process.argv[2];
const selected = only ? TARGETS.filter((t) => t.dir === only) : TARGETS;
if (only && selected.length === 0) {
  console.error(`Unknown target "${only}". Known: ${TARGETS.map((t) => t.dir).join(", ")}`);
  process.exit(1);
}

for (const { dir, target } of selected) {
  // No Windows target yet (the launcher's win32 path degrades to the Bun fallback); when a
  // windows-x64 entry is added to TARGETS, use "agentlocks.exe" for it.
  const exe = "agentlocks";
  const outDir = path.join(root, "npm", dir, "bin");
  mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, exe);
  console.log(`compiling ${dir} -> ${path.relative(root, outfile)}`);
  const result = spawnSync(
    "bun",
    ["build", "--compile", `--target=${target}`, entry, "--outfile", outfile],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`build failed for ${dir}`);
    process.exit(result.status === null ? 1 : result.status);
  }
}

console.log("done");
