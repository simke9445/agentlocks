import { expect, test } from "bun:test";
import { assertOptionalDeps } from "../scripts/ci/assert-optional-deps.mjs";
import {
  checkLocalManifest,
  checkPublishedManifest,
  checkTarballFiles,
} from "../scripts/ci/check-manifest.mjs";
import { checkMonotonic } from "../scripts/ci/check-monotonic.mjs";
import { exeName, parseTarget } from "../scripts/ci/platform-target.mjs";

// These exercise the pure cores of the extracted CI scripts (scripts/ci/*.mjs). They are the
// isomorphism proof for the behavior-preserving decomposition of release.yml: the same derivations,
// assertions, and ::error:: strings that were inlined as `node -e` heredocs, now imported and
// asserted directly. The CLI wrappers and dist-integrity.sh keep their behavior via the workflow.

// --- platform-target.mjs: the os/cpu/libc derivation (release.yml heredocs at lines ~240-243,
// ~291-293, ~414-417) and the binary name. ---

test("parseTarget derives os/cpu/libc for every target dir", () => {
  expect(parseTarget("win32-x64")).toEqual({ os: "win32", cpu: "x64", libc: null });
  expect(parseTarget("linux-x64-musl")).toEqual({ os: "linux", cpu: "x64", libc: "musl" });
  expect(parseTarget("linux-arm64-musl")).toEqual({ os: "linux", cpu: "arm64", libc: "musl" });
  expect(parseTarget("linux-x64")).toEqual({ os: "linux", cpu: "x64", libc: "glibc" });
  expect(parseTarget("linux-arm64")).toEqual({ os: "linux", cpu: "arm64", libc: "glibc" });
  expect(parseTarget("darwin-arm64")).toEqual({ os: "darwin", cpu: "arm64", libc: null });
  expect(parseTarget("darwin-x64")).toEqual({ os: "darwin", cpu: "x64", libc: null });
});

test("exeName is agentlocks.exe only on win32, agentlocks elsewhere", () => {
  expect(exeName("win32-x64")).toBe("agentlocks.exe");
  expect(exeName("linux-x64")).toBe("agentlocks");
  expect(exeName("linux-x64-musl")).toBe("agentlocks");
  expect(exeName("linux-arm64-musl")).toBe("agentlocks");
  expect(exeName("darwin-arm64")).toBe("agentlocks");
  expect(exeName("darwin-x64")).toBe("agentlocks");
});

// --- check-monotonic.mjs: the version tuple-compare (release.yml lines 192-206). Returns a log
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

// --- assert-optional-deps.mjs: the optionalDependencies set assertion (release.yml lines 146-153).
// ---

const OD_TARGETS = "darwin-arm64 linux-x64";

test("assert-optional-deps: the exact set at the right version passes", () => {
  expect(() =>
    assertOptionalDeps({
      optionalDependencies: {
        "agentlocks-darwin-arm64": "1.2.3",
        "agentlocks-linux-x64": "1.2.3",
      },
      targets: OD_TARGETS,
      version: "1.2.3",
    }),
  ).not.toThrow();
});

test("assert-optional-deps: a missing key fails", () => {
  expect(() =>
    assertOptionalDeps({
      optionalDependencies: { "agentlocks-darwin-arm64": "1.2.3" },
      targets: OD_TARGETS,
      version: "1.2.3",
    }),
  ).toThrow("::error::optionalDependencies set mismatch: agentlocks-darwin-arm64");
});

test("assert-optional-deps: an extra key fails", () => {
  expect(() =>
    assertOptionalDeps({
      optionalDependencies: {
        "agentlocks-darwin-arm64": "1.2.3",
        "agentlocks-linux-x64": "1.2.3",
        "agentlocks-bogus": "1.2.3",
      },
      targets: OD_TARGETS,
      version: "1.2.3",
    }),
  ).toThrow(
    "::error::optionalDependencies set mismatch: agentlocks-bogus,agentlocks-darwin-arm64,agentlocks-linux-x64",
  );
});

test("assert-optional-deps: a wrong version fails", () => {
  expect(() =>
    assertOptionalDeps({
      optionalDependencies: {
        "agentlocks-darwin-arm64": "1.2.3",
        "agentlocks-linux-x64": "9.9.9",
      },
      targets: OD_TARGETS,
      version: "1.2.3",
    }),
  ).toThrow("::error::agentlocks-linux-x64 pinned at 9.9.9 not 1.2.3");
});

// --- check-manifest.mjs: the local (pre-publish) and published (post-publish) manifest guards
// (release.yml lines 236-252 and 287-301) plus the tarball file-list guard (lines 257-264). ---

test("check-manifest local: a correct manifest with the binary present passes", () => {
  expect(() =>
    checkLocalManifest({
      dir: "linux-x64-musl",
      manifest: {
        name: "agentlocks-linux-x64-musl",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["musl"],
      },
      binExists: () => true,
    }),
  ).not.toThrow();
});

test("check-manifest local: a wrong os fails", () => {
  expect(() =>
    checkLocalManifest({
      dir: "linux-x64",
      manifest: { name: "agentlocks-linux-x64", os: ["darwin"], cpu: ["x64"], libc: ["glibc"] },
      binExists: () => true,
    }),
  ).toThrow('::error::pre-publish linux-x64: os ["darwin"]');
});

test("check-manifest local: a wrong cpu fails", () => {
  expect(() =>
    checkLocalManifest({
      dir: "linux-x64",
      manifest: { name: "agentlocks-linux-x64", os: ["linux"], cpu: ["arm64"], libc: ["glibc"] },
      binExists: () => true,
    }),
  ).toThrow('::error::pre-publish linux-x64: cpu ["arm64"]');
});

test("check-manifest local: a wrong libc (glibc vs musl) fails", () => {
  expect(() =>
    checkLocalManifest({
      dir: "linux-x64-musl",
      manifest: {
        name: "agentlocks-linux-x64-musl",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
      binExists: () => true,
    }),
  ).toThrow('::error::pre-publish linux-x64-musl: libc ["glibc"]');
});

test("check-manifest local: a missing binary fails", () => {
  expect(() =>
    checkLocalManifest({
      dir: "darwin-arm64",
      manifest: { name: "agentlocks-darwin-arm64", os: ["darwin"], cpu: ["arm64"] },
      binExists: () => false,
    }),
  ).toThrow("::error::pre-publish darwin-arm64: missing bin/agentlocks");
});

test("check-manifest tarball: bin present passes; win32 expects agentlocks.exe", () => {
  expect(() =>
    checkTarballFiles({
      dir: "win32-x64",
      packJson: [{ files: [{ path: "package.json" }, { path: "bin/agentlocks.exe" }] }],
    }),
  ).not.toThrow();
  expect(() =>
    checkTarballFiles({ dir: "linux-x64", packJson: [{ files: [{ path: "bin/agentlocks" }] }] }),
  ).not.toThrow();
});

test("check-manifest tarball: a missing bin fails with the file list", () => {
  expect(() =>
    checkTarballFiles({
      dir: "linux-x64",
      packJson: [{ files: [{ path: "package.json" }, { path: "README.md" }] }],
    }),
  ).toThrow("::error::linux-x64 tarball is missing bin/agentlocks (files: package.json,README.md)");
});

test("check-manifest published: a correct manifest at the right version passes", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-arm64-musl",
      manifest: {
        name: "agentlocks-linux-arm64-musl",
        version: "1.2.3",
        os: ["linux"],
        cpu: ["arm64"],
        libc: ["musl"],
      },
      version: "1.2.3",
    }),
  ).not.toThrow();
});

test("check-manifest published: a wrong version fails", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-x64",
      manifest: {
        name: "agentlocks-linux-x64",
        version: "9.9.9",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
      version: "1.2.3",
    }),
  ).toThrow("::error::version 9.9.9");
});

test("check-manifest published: a wrong os fails", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-x64",
      manifest: {
        name: "agentlocks-linux-x64",
        version: "1.2.3",
        os: ["darwin"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
      version: "1.2.3",
    }),
  ).toThrow('::error::os ["darwin"]');
});

test("check-manifest published: a wrong cpu fails", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-x64",
      manifest: {
        name: "agentlocks-linux-x64",
        version: "1.2.3",
        os: ["linux"],
        cpu: ["arm64"],
        libc: ["glibc"],
      },
      version: "1.2.3",
    }),
  ).toThrow('::error::cpu ["arm64"]');
});

test("check-manifest published: a wrong libc (glibc vs musl) fails", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-x64-musl",
      manifest: {
        name: "agentlocks-linux-x64-musl",
        version: "1.2.3",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
      version: "1.2.3",
    }),
  ).toThrow('::error::libc ["glibc"]');
});

test("check-manifest published: a wrong name fails", () => {
  expect(() =>
    checkPublishedManifest({
      dir: "linux-x64",
      manifest: {
        name: "bogus",
        version: "1.2.3",
        os: ["linux"],
        cpu: ["x64"],
        libc: ["glibc"],
      },
      version: "1.2.3",
    }),
  ).toThrow("::error::name bogus");
});
