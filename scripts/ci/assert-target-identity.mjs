// assert-target-identity.mjs - the verify-matrix identity assertion. Verbatim extraction of the
// node -e block at release.yml lines 412-431.
//
// Asserts this leg proved the intended target: the runner is really this OS/arch/libc and the
// matching platform package is installed at exactly $VERSION with its binary resolvable. A
// mis-mapped runner label or wrong libc filter cannot leave a target green-but-unproved. Resolution
// honors NODE_PATH; npm nests the platform optional dep under the main package, so the workflow sets
// NODE_PATH to "<npm root -g>/agentlocks/node_modules" (with the global root as a fallback).
//
// Env: TARGET, VERSION. Runs under `node` in the verify matrix (process.report is Node's). The libc
// derivation and the os/cpu split come from parseTarget (scripts/ci/platform-target.mjs).
import { createRequire } from "node:module";
import { parseTarget } from "./platform-target.mjs";

const require = createRequire(import.meta.url);

const t = process.env.TARGET;
const v = process.env.VERSION;
const { os, cpu, libc } = parseTarget(t);
const fail = (m) => {
  console.error(`::error::${m}`);
  process.exit(1);
};
if (process.platform !== os) fail(`runner platform ${process.platform} != ${os}`);
if (process.arch !== cpu) fail(`runner arch ${process.arch} != ${cpu}`);
if (os === "linux") {
  let isMusl = false;
  try {
    isMusl = !process.report.getReport().header.glibcVersionRuntime;
  } catch {}
  if ((libc === "musl") !== isMusl) fail(`runner libc != ${libc}`);
}
const ver = require(`agentlocks-${t}/package.json`).version;
if (ver !== v) fail(`installed agentlocks-${t}@${ver} != ${v}`);
const exe = process.platform === "win32" ? "agentlocks.exe" : "agentlocks";
const resolved = require.resolve(`agentlocks-${t}/bin/${exe}`);
console.log(
  "identity OK: agentlocks-" +
    t +
    "@" +
    ver +
    " (" +
    process.platform +
    "/" +
    process.arch +
    (libc ? `/${libc}` : "") +
    ") -> " +
    resolved,
);
