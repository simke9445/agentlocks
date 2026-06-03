#!/usr/bin/env bun
// Build the single-file Node bundle that REPLACES the per-platform Bun-compiled
// binaries (Option 1, bundle-size reduction). One ~157 KB artifact runs under the
// user's Node on every platform, vs 60-112 MB embedded-Bun binaries x 7 packages.
//
//   bun scripts/build-bundle.mjs            # build dist/agentlocks.mjs (CLI) + dist/index.mjs (lib)
//
// Proven (darwin-arm64, Node 25.8.1): --version/--help, .ts-config load, and the
// EXTENDED conformance scenario all pass against `node dist/agentlocks.mjs`.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function bun(args) {
  const r = spawnSync("bun", args, { stdio: "inherit", cwd: root });
  if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);
}

// CLI bundle: entry is bin/agentlocks.ts (calls main() directly), commander inlined.
const cli = path.join(root, "dist", "agentlocks.mjs");
bun(["build", path.join(root, "bin", "agentlocks.ts"), "--target=node", "--minify", "--outfile", cli]);

// bun build inherits the entry's `#!/usr/bin/env bun` shebang; the shipped CLI must
// run under Node. Rewrite line 1 -> node, and make it executable (npm's bin shim
// reads the shebang for the POSIX symlink and the Windows cmd-shim).
let src = readFileSync(cli, "utf8");
src = src.replace(/^#![^\n]*\n/, "#!/usr/bin/env node\n");
writeFileSync(cli, src);
chmodSync(cli, 0o755);

// Library bundle: src/index.ts is pure re-exports (the import.meta.main run-guard
// was removed; the CLI entry is bin/agentlocks.ts). Safe to import without side effects.
bun(["build", path.join(root, "src", "index.ts"), "--target=node", "--outfile", path.join(root, "dist", "index.mjs")]);

console.log("built dist/agentlocks.mjs (CLI) + dist/index.mjs (lib); run `tsc --emitDeclarationOnly` for dist/index.d.ts");
