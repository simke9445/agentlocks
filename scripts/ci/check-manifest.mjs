// check-manifest.mjs - the three platform-package manifest/byte checks, unified. Each subcommand is
// a verbatim extraction of one inline node -e block in release.yml, preserving its exact assertions,
// ::error:: messages, and exit behavior:
//
//   local <dir>     pre-publish guard (release.yml lines 236-252): read npm/<dir>/package.json,
//                   assert name/os/cpu/libc, assert npm/<dir>/bin/<exe> exists.
//   tarball <dir>   pack-file guard (release.yml lines 257-264): read `npm pack --json` on stdin,
//                   assert bin/<exe> is in files[].path.
//   published <dir> post-publish guard (release.yml lines 287-301): read `npm view --json` on
//                   stdin, assert name/version(env VERSION)/os/cpu/libc.
//
// All three share parseTarget (scripts/ci/platform-target.mjs) and the eq() helper. The pure
// functions throw an Error whose message is the exact ::error:: string on a fail, mirroring each
// original's console.error + process.exit(1).

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseTarget } from "./platform-target.mjs";

const eq = (a, b) => Array.isArray(a) && a.length === 1 && a[0] === b;

// Pre-publish local guard. binExists(exe) reports whether npm/<dir>/bin/<exe> is present (injected
// so the assertion is testable without staging a real binary; the CLI passes the real fs probe).
export function checkLocalManifest({ dir, manifest, binExists }) {
  const d = dir;
  const m = manifest;
  const { os, cpu, libc } = parseTarget(d);
  const fail = (x) => {
    throw new Error(`::error::pre-publish ${d}: ${x}`);
  };
  if (m.name !== `agentlocks-${d}`) fail(`name ${m.name}`);
  if (!eq(m.os, os)) fail(`os ${JSON.stringify(m.os)}`);
  if (!eq(m.cpu, cpu)) fail(`cpu ${JSON.stringify(m.cpu)}`);
  if (libc ? !eq(m.libc, libc) : m.libc) fail(`libc ${JSON.stringify(m.libc)}`);
  const exe = os === "win32" ? "agentlocks.exe" : "agentlocks";
  if (!binExists(exe)) fail(`missing bin/${exe}`);
}

// Pack-file guard. packJson is the parsed `npm pack --json` array (j). NOTE: this site checks win32
// via d.indexOf("win32")===0 (not parseTarget); preserved verbatim.
export function checkTarballFiles({ dir, packJson }) {
  const j = packJson;
  const d = dir;
  const exe = d.indexOf("win32") === 0 ? "agentlocks.exe" : "agentlocks";
  const files = (j[0].files || []).map((f) => f.path);
  if (!files.includes(`bin/${exe}`)) {
    throw new Error(`::error::${d} tarball is missing bin/${exe} (files: ${files.join(",")})`);
  }
}

// Post-publish manifest guard. manifest is the parsed `npm view <pkg> --json` object.
export function checkPublishedManifest({ dir, manifest, version }) {
  const m = manifest;
  const { os, cpu, libc } = parseTarget(dir);
  const fail = (msg) => {
    throw new Error(`::error::${msg}`);
  };
  if (m.name !== `agentlocks-${dir}`) fail(`name ${m.name}`);
  if (m.version !== version) fail(`version ${m.version}`);
  if (!eq(m.os, os)) fail(`os ${JSON.stringify(m.os)}`);
  if (!eq(m.cpu, cpu)) fail(`cpu ${JSON.stringify(m.cpu)}`);
  if (libc ? !eq(m.libc, libc) : m.libc) fail(`libc ${JSON.stringify(m.libc)}`);
}

function readStdin() {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.on("data", (c) => {
      s += c;
    });
    process.stdin.on("end", () => resolve(s));
  });
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const require = createRequire(import.meta.url);
  const cmd = process.argv[2];
  const dir = process.argv[3];
  try {
    if (cmd === "local") {
      const manifest = require(path.resolve("npm", dir, "package.json"));
      checkLocalManifest({
        dir,
        manifest,
        binExists: (exe) => fs.existsSync(path.resolve("npm", dir, "bin", exe)),
      });
    } else if (cmd === "tarball") {
      const packJson = JSON.parse(await readStdin());
      checkTarballFiles({ dir, packJson });
    } else if (cmd === "published") {
      const manifest = JSON.parse(await readStdin());
      checkPublishedManifest({ dir, manifest, version: process.env.VERSION });
    } else {
      console.error("usage: check-manifest.mjs <local|tarball|published> <dir>");
      process.exit(1);
    }
  } catch (err) {
    // Guard failures carry the ::error:: marker and exit 1 (clean output, as the inline heredoc did).
    // An unexpected tooling error (bad JSON, missing file) has no marker: re-throw so Node prints the
    // full stack and exits non-zero, exactly as the un-wrapped node -e did.
    if (typeof err?.message === "string" && err.message.startsWith("::error::")) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
