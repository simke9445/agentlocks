// assert-optional-deps.mjs - assert main's optionalDependencies are EXACTLY the platform packages,
// each pinned at VERSION. Verbatim extraction of the node -e block at release.yml lines 146-153.
//
// The set must equal { agentlocks-<target>: VERSION } for every target in $TARGETS, no more and no
// fewer. Exported as a pure function for testing; it throws an Error whose message is the exact
// ::error:: string on a mismatch, mirroring the original's console.error + process.exit(1).
import { createRequire } from "node:module";

export function assertOptionalDeps({ optionalDependencies, targets, version }) {
  const want = targets
    .trim()
    .split(/\s+/)
    .map((s) => `agentlocks-${s}`);
  const od = optionalDependencies || {};
  const got = Object.keys(od).sort();
  const exp = [...want].sort();
  if (got.length !== exp.length || got.some((k, i) => k !== exp[i])) {
    throw new Error(`::error::optionalDependencies set mismatch: ${got.join(",")}`);
  }
  for (const k of want) {
    if (od[k] !== version) {
      throw new Error(`::error::${k} pinned at ${od[k]} not ${version}`);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const require = createRequire(import.meta.url);
  try {
    assertOptionalDeps({
      optionalDependencies: require(require("node:path").resolve("./package.json"))
        .optionalDependencies,
      targets: process.env.TARGETS,
      version: process.env.VERSION,
    });
  } catch (err) {
    // Guard failures carry the ::error:: marker and exit 1 (clean output, as the inline heredoc did).
    // An unexpected tooling error (missing package.json, bad env) has no marker: re-throw so Node
    // prints the full stack and exits non-zero, exactly as the un-wrapped node -e did.
    if (typeof err?.message === "string" && err.message.startsWith("::error::")) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
