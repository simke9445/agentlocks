#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
// Build the single-file Node bundle that REPLACES the per-platform Bun-compiled
// binaries (Option 1, bundle-size reduction). One ~157 KB artifact runs under the
// user's Node on every platform, vs 60-112 MB embedded-Bun binaries x 7 packages.
//
//   bun scripts/build-bundle.mjs            # build dist/agentlocks.mjs (CLI bundle)
//
// Proven (darwin-arm64, Node 25.8.1): --version/--help, .ts-config load, and the
// EXTENDED conformance scenario all pass against `node dist/agentlocks.mjs`.
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

// Start from a clean dist/ so the packed tarball never ships a stale artifact
// (e.g. an old unminified bundle left over from a prior build).
const distDir = path.join(root, "dist");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

function bun(args) {
  const r = spawnSync("bun", args, { stdio: "inherit", cwd: root });
  if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);
}

// CLI bundle: entry is bin/agentlocks.ts (calls main() directly), commander inlined.
const cli = path.join(root, "dist", "agentlocks.mjs");
bun([
  "build",
  path.join(root, "bin", "agentlocks.ts"),
  "--target=node",
  "--minify",
  `--define=AGENTLOCKS_PACKAGE_NAME=${JSON.stringify(packageJson.name)}`,
  `--define=AGENTLOCKS_PACKAGE_VERSION=${JSON.stringify(packageJson.version)}`,
  "--outfile",
  cli,
]);

// bun build inherits the entry's `#!/usr/bin/env bun` shebang; the shipped CLI must
// run under Node. Rewrite line 1 -> node, and make it executable (npm's bin shim
// reads the shebang for the POSIX symlink and the Windows cmd-shim).
let src = readFileSync(cli, "utf8");
src = src.replace(/^#![^\n]*\n/, "#!/usr/bin/env node\n");
writeFileSync(cli, src);
chmodSync(cli, 0o755);

console.log("built dist/agentlocks.mjs (CLI bundle)");
