import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMonotonic } from "../scripts/ci/check-monotonic.mjs";

// These exercise the pure cores of the CI scripts that survive the single-bundle distribution
// (scripts/ci/check-monotonic.mjs + dist-integrity.sh). They are the isomorphism proof for the
// monotonic-version guard and the integrity probe that release.yml's pack + flip jobs rely on: the
// same derivations, ::error:: strings, and shell exit codes that gate a publish, asserted directly.

// --- check-monotonic.mjs: the version tuple-compare (release.yml monotonic guard). Returns a log
// line on a pass, throws the exact ::error:: message on a fail. ---

test("check-monotonic: below the published max fails", () => {
  expect(() =>
    checkMonotonic({
      version: "1.0.0",
      versionsJson: '["1.0.0","2.0.0","1.5.0"]',
      our: "x",
      pubMain: "",
    }),
  ).toThrow("::error::version 1.0.0 is below the published max 2.0.0");
});

test("check-monotonic: equal max with PUB_MAIN===OUR passes as an idempotent recovery", () => {
  expect(
    checkMonotonic({
      version: "2.0.0",
      versionsJson: '["1.0.0","2.0.0"]',
      our: "sha512-AAA",
      pubMain: "sha512-AAA",
    }),
  ).toBe("equal-max recovery re-run (main integrity matches)");
});

test("check-monotonic: equal max with a byte mismatch fails", () => {
  expect(() =>
    checkMonotonic({
      version: "2.0.0",
      versionsJson: '["1.0.0","2.0.0"]',
      our: "sha512-AAA",
      pubMain: "sha512-BBB",
    }),
  ).toThrow(
    "::error::version 2.0.0 already the published max with different bytes (not a recovery)",
  );
});

test("check-monotonic: strictly greater than the max passes", () => {
  expect(
    checkMonotonic({
      version: "3.0.0",
      versionsJson: '["1.0.0","2.0.0"]',
      our: "x",
      pubMain: "",
    }),
  ).toBe("");
});

test("check-monotonic: empty published versions (first release) passes", () => {
  expect(checkMonotonic({ version: "1.0.0", versionsJson: "[]", our: "x", pubMain: "" })).toBe("");
  expect(checkMonotonic({ version: "1.0.0", versionsJson: "", our: "x", pubMain: "" })).toBe("");
});

// --- Integration: the check-monotonic.mjs CLI wrapper (env wiring + exit codes) and
// dist-integrity.sh's shell retry. The pure-core tests above prove the LOGIC; these prove the GLUE
// the workflow relies on, including that an UNEXPECTED error re-throws (Node stack) rather than
// being swallowed as a clean ::error:: line. ---

const ciDir = fileURLToPath(new URL("../scripts/ci/", import.meta.url));
const runMjs = (script: string, args: string[], env: Record<string, string>, stdin?: string) =>
  spawnSync("node", [join(ciDir, script), ...args], {
    env: { ...process.env, ...env },
    input: stdin,
    encoding: "utf8",
  });

test("check-monotonic.mjs CLI: greater passes, below-max fails clean, recovery passes", () => {
  const greater = runMjs("check-monotonic.mjs", [], {
    VERSION: "0.7.0",
    VERSIONS_JSON: '["0.6.0"]',
  });
  expect(greater.status).toBe(0);

  const below = runMjs("check-monotonic.mjs", [], { VERSION: "0.5.0", VERSIONS_JSON: '["0.6.0"]' });
  expect(below.status).toBe(1);
  expect(below.stderr).toContain("::error::version 0.5.0 is below the published max 0.6.0");

  const recovery = runMjs("check-monotonic.mjs", [], {
    VERSION: "0.6.0",
    VERSIONS_JSON: '["0.6.0"]',
    OUR: "sha512-x",
    PUB_MAIN: "sha512-x",
  });
  expect(recovery.status).toBe(0);
  expect(recovery.stdout).toContain("equal-max recovery re-run");
});

test("check-monotonic.mjs CLI re-throws an unexpected error (stack), not a clean ::error::", () => {
  // The re-throw isomorphism fix: a non-::error:: failure (bad VERSIONS_JSON) crashes with a Node
  // stack and a non-zero exit, exactly as the un-wrapped node -e did; it is not swallowed.
  const bad = runMjs("check-monotonic.mjs", [], { VERSION: "0.7.0", VERSIONS_JSON: "not-json" });
  expect(bad.status).not.toBe(0);
  expect(bad.stderr).not.toContain("::error::");
});

test("dist-integrity.sh: integrity on success (no trailing newline), empty on E404", () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-npm-"));
  const shim = join(dir, "npm");
  // `npm view <pkg> dist.integrity`: argv $2 is the pkg. A *@404 spec -> E404 (exit 1); else integrity.
  writeFileSync(
    shim,
    '#!/bin/sh\ncase "$2" in\n  *@404) echo "npm error code E404" >&2; exit 1 ;;\n  *) echo "sha512-FAKE" ;;\nesac\n',
  );
  chmodSync(shim, 0o755);
  const run = (pkg: string) =>
    spawnSync("sh", [join(ciDir, "dist-integrity.sh"), pkg], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      encoding: "utf8",
    });

  const ok = run("agentlocks@1.0.0");
  expect(ok.status).toBe(0);
  expect(ok.stdout).toBe("sha512-FAKE"); // command substitution strips the trailing newline

  const absent = run("agentlocks@404");
  expect(absent.status).toBe(0);
  expect(absent.stdout).toBe("");
});
