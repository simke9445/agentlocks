# Production release pipeline for agentlocks

How agentlocks ships: a thin main package plus per-platform binary packages, released by a tagged
GitHub Actions pipeline that proves every shipped target on its real OS before anything users install
changes. This document is self-contained; it describes the pipeline as implemented in
`.github/workflows/release.yml`, `.github/workflows/windows-unit.yml`, and `scripts/ci/`.

## 1. TL;DR

**Safety property:** no release in which any shipped platform binary fails to install-and-run on its
real OS ever becomes the `latest` that `npm i -g agentlocks` resolves. Every shipped target is
exercised on its native runner before the flip to `latest`.

This rests on one fact plus one trick:

- **Fact:** `npm i -g agentlocks` resolves only the main package's `latest`, then installs the
  platform binary main pins by exact version in `optionalDependencies`. So main's `latest` is the
  single user-visible switch; a platform package merely existing at version `X` is invisible until
  main's `latest` points at `X`.
- **Trick:** `npm pack` main into a tarball, hand it to a multi-OS matrix as a CI artifact, and have
  each runner `npm i -g ./main.tgz`. Installing the local tarball still resolves main's
  `optionalDependencies` from the registry, so each OS pulls and executes its own real, already
  published binary. main is not on npm during this, so it is invisible to users. The flip is then
  `npm publish` of that same tarball to `latest`, done only after every matrix leg is green.

```
1. publish the platform binary packages   (under a `preflight` tag; not what `npm i -g` resolves)
2. npm pack main -> main.tgz (CI artifact)
3. matrix over every shipped target: npm i -g ./main.tgz, Bun fallback off, real lock cycle  <- GATE
4. npm publish main.tgz -> latest          (tokenless OIDC; only after step 3 is all-green)
```

The flip is a plain `npm publish` that the OIDC trusted-publishing credential authorizes, so the
pipeline needs no dist-tag manipulation and no token. The matrix is a real `needs:` barrier, so a red
leg leaves main unpublished and `latest` untouched: there is no post-flip canary and no exposure
window. One human approval gates the flip job, so the approver sees the full green matrix before
authorizing the only irreversible, user-visible step.

The cost is latency: the flip waits on build, the platform publishes, and the matrix (about 10-20
minutes). Releases are not latency-sensitive, so this is the right trade for "nothing broken on any
target reaches `latest`."

Supply-chain pinning is in scope, not deferred: the flip job holds `id-token: write`, so every
mutable input is pinned (Section 6). SHA-pinned third-party actions, a vetted npm pin, Bun and Node
pinned via the `setup-*` version inputs, and the Alpine musl-verify image pinned by digest. The
guarantee rests on no mutable input.

## 2. How npm releases work (the facts that constrain everything)

- **Versions are immutable.** Once `agentlocks@0.7.0` is published, those bytes are that version
  forever; there is no overwrite. `npm unpublish` is allowed only within 72 hours under restrictive
  conditions, breaks dependents, and does not help anyone who already installed.
- **Dist-tags are the only mutable pointer.** `latest` names one version; `npm i -g agentlocks`
  resolves whatever `latest` points at now. An exact request (`npm i agentlocks@0.7.0`) resolves
  regardless of any tag, which is what lets the matrix install a version that is not yet `latest`.
- **So verify-after-publish-to-`latest` is a detector, not a gate.** A gate has to sit between
  upload and the `latest` flip; this pipeline puts the whole platform matrix there.
- **OIDC draws a line across operations.** Trusted publishing authorizes `npm publish`; it does not
  cover `npm dist-tag add`. The flip is a plain `npm publish`, so it stays inside what OIDC
  authorizes, which is why the design never repoints a dist-tag.

## 3. Distribution model and target set

agentlocks is a Biome-style fan-out: a thin main package (`agentlocks`) plus per-platform binary
packages (`agentlocks-<platform>`) gated by `os`/`cpu`/`libc`. The CLI runtime needs Bun (it
`import()`s the user's `agentlocks.config.ts`, and only a Bun runtime transpiles `.ts` at import), so
each platform package carries a self-contained, Bun-embedded binary (`bun build --compile`). The Node
launcher `bin/agentlocks.mjs` resolves the platform package's binary (`require.resolve(
"agentlocks-<platform>/bin/<exe>")`, `.exe` on win32) and execs it; with no prebuilt binary (an
unsupported platform, or a dev checkout) it falls back to running the TypeScript entry under Bun, and
errors actionably if neither is available.

The launcher also detects musl: on Linux it tries the `-musl` package variant first when the runtime
is musl (no `glibcVersionRuntime` in `process.report`), so Alpine resolves the musl binary and Debian
the glibc one.

Full target set (resolution is by exact version after npm's `os`/`cpu`/`libc` filter):

| Package | `os` | `cpu` | `libc` | Bun build target | Shipped |
| --- | --- | --- | --- | --- | --- |
| agentlocks-linux-x64 | linux | x64 | glibc | `bun-linux-x64` | yes |
| agentlocks-linux-arm64 | linux | arm64 | glibc | `bun-linux-arm64` | yes |
| agentlocks-linux-x64-musl | linux | x64 | musl | `bun-linux-x64-musl` | yes |
| agentlocks-linux-arm64-musl | linux | arm64 | musl | `bun-linux-arm64-musl` | yes |
| agentlocks-darwin-arm64 | darwin | arm64 | (none) | `bun-darwin-arm64` | yes |
| agentlocks-darwin-x64 | darwin | x64 | (none) | `bun-darwin-x64` | yes |
| agentlocks-win32-x64 | win32 | x64 | (none) | `bun-windows-x64` | temporarily disabled |

`$TARGETS` in `release.yml` is the single source of truth for the shipped set (the deps-injection,
publish, and release-attach loops all read it); the verify matrix mirrors it leg by leg. To ship or
drop a target, edit `$TARGETS` and the matrix together.

**win32-x64 is built and tested but temporarily not shipped.** Its first npm publish hit a
registry-side `E403` spam-detection false positive (the human bootstrap below is pending npm support),
so it is omitted from `$TARGETS` and the verify matrix; Windows users get the Bun fallback for now.
The launcher, the `bun-windows-x64` build target, and the `windows-unit` job all keep win32 alive, so
re-enabling is two lines (add `win32-x64` back to `$TARGETS` and the verify matrix) once its package
is published once. `win32-arm64` is out of scope until both a Bun `bun-windows-arm64` target and a
GitHub `windows-11-arm` runner exist.

## 4. The pipeline

### 4.1 Job graph

```
on: push tags [v*];  concurrency: { group: release, cancel-in-progress: false }

windows-unit  (no secrets)  bun test on windows-latest + build win32 + extended conformance.
build         (no secrets)  cross-compile all binaries -> artifacts (platform-binaries,
   |                         conformance-scenario.mjs, ci-scripts).
   |  (publish-stage needs: [build, windows-unit])
publish-stage (OIDC)        early guards (tag shape X.Y.Z, tag == package.json, tag on origin/main,
   |                         monotonic version); inject + assert exact optionalDependencies; npm pack
   |                         main -> main.tgz artifact (record its integrity); publish each platform
   |                         package under the `preflight` tag (skip-if-exists by byte match,
   |                         --provenance). Nothing `npm i -g agentlocks` resolves exists yet.
   |
verify        (matrix over every shipped target; permissions: {}; NO id-token)   <- THE GATE
   |                         download main.tgz + scripts; npm i -g ./main.tgz (pulls the matching
   |                         platform package@X from the registry); Bun fallback off; real lock cycle.
   |                         fail-fast: false.
   |
flip          (needs: [verify, publish-stage]; OIDC; environment: release  <- the human approval)
   |                         npm publish main.tgz -> latest (the exact verified bytes; idempotent
   |                         no-op on a byte-matching pre-existing main@X, hard-fail on a mismatch);
   |                         terminal confirmation: npm i -g agentlocks resolves+runs X (warn on lag).
   |
release-notes (needs: flip)  create GitHub Release (idempotent), attach the binaries. Separate job so
                             a re-run reaches it even when the flip step no-ops.
```

`windows-unit` gates `publish-stage` (and runs on pull requests as a required check) so a release
cannot publish unless the Windows lock test suite passed on the tagged commit, even though the win32
binary is not currently shipped. The matrix is a real `needs:` barrier in front of the flip, so a red
leg leaves `latest` untouched. The flip publishes the same `main.tgz` the matrix installed, so the
bytes that go live are the bytes proven on every shipped OS.

### 4.2 Why the tarball-to-matrix trick is tokenless and faithful

To run a darwin or Windows binary you need its native runner, but the matrix legs are separate jobs
and the flip must happen only after all of them. Verifying the real `npm i agentlocks@X` would
require main to be published first, and re-pointing a published main to `latest` needs
`npm dist-tag add`, which OIDC does not authorize, forcing a token.

The pipeline sidesteps that by verifying main from its packed tarball. `npm pack` produces main's
exact publishable tarball; `npm i -g ./main.tgz` resolves main's `optionalDependencies` from the
registry exactly as a real install does, so each runner fetches and executes its real published
binary. main is never on npm during verification, so nothing is user-visible, and the flip is a plain
`npm publish` of that same tarball (OIDC, tokenless), publishing bytes already proven on every OS.

The one residual: a local-tarball install does not exercise npm fetching main's own tarball from the
registry. That step is OS-independent (main is just the launcher plus `optionalDependencies` metadata;
every OS-specific byte lives in the platform packages, which are fetched per target), and the tarball
is byte-identical to what the flip publishes. The in-`flip` terminal confirmation closes even that gap
by doing one real-registry `npm i -g agentlocks` after the flip, as a propagation check, not a gate.

### 4.3 The verify matrix

One leg per shipped target, `fail-fast: false`, `permissions: {}` (no `contents`, no `id-token`: a
job that runs freshly published binaries must not hold the publish credential):

| Leg | Runner | How the proof runs |
| --- | --- | --- |
| linux-x64 (glibc) | `ubuntu-24.04` | natively |
| linux-arm64 (glibc) | `ubuntu-24.04-arm` | natively |
| darwin-arm64 | `macos-latest` | natively |
| darwin-x64 | `macos-15-intel` | natively |
| linux-x64-musl | `ubuntu-24.04` | host downloads, `docker run node:alpine` execs the proof |
| linux-arm64-musl | `ubuntu-24.04-arm` | host downloads, `docker run node:alpine` execs the proof |

**The musl legs do not use a job `container:`.** GitHub does not support JavaScript actions (such as
`actions/download-artifact`) in Alpine containers on arm64 runners; the runner's glibc-linked Node
cannot start on musl and the job fails with "JavaScript Actions in Alpine containers are only
supported on x64 Linux runners." So the musl legs run on the glibc host (where the JS actions work),
download the artifacts there, and execute the musl-specific install-and-prove inside the pinned Alpine
image via `docker run` (hosted runners ship docker). The proof itself lives in
`scripts/ci/verify-install-and-prove.sh` so the native legs run it directly (`bash ...`) and the musl
legs run it under `docker run "$MUSL_IMAGE" sh scripts/ci/verify-install-and-prove.sh`, mounting the
downloaded workspace. The matrix carries a `musl_image` field (the pinned Alpine digest) only on the
two musl legs; that field is the sole difference between a native leg and a musl leg.

Each leg, in a fresh prefix:

- `npm i -g ./main.tgz` with `npm_config_omit= --include=optional` (so a runner `.npmrc` carrying
  `omit=optional` cannot skip the platform package and produce a false pass via the Bun fallback) and
  `--prefer-online` (bust npm's negative-packument cache so a propagation-lag miss is retried, not
  served stale). **Install and the identity assertion are one retry unit:** because platform packages
  are `optionalDependencies`, `npm install` succeeds even when the platform package is still
  propagating and absent, so retrying only the install would break on a binary-less success. The loop
  reinstalls into a fresh prefix and re-asserts identity until identity passes, then runs conformance.
- **Assert the leg proved the intended target**, so a mis-mapped runner label or a wrong libc filter
  cannot leave a target green-but-unproved: `process.platform`/`process.arch`/libc match, the
  installed optional dependency is exactly `agentlocks-<target>@$VERSION`, and the launcher resolves
  that package's binary. npm nests the platform optional dep under the main package
  (`<npm root -g>/agentlocks/node_modules/agentlocks-<target>`, not hoisted to the global root), so
  `assert-target-identity.mjs` runs with `NODE_PATH` pointed there (with the global root as a
  fallback, Windows-safe separator).
- Invoke the npm-installed launcher shim by absolute path, never the platform binary directly and
  never from `PATH`: `$PREFIX/bin/agentlocks` on Linux/macOS, the `agentlocks.cmd` shim on Windows.
- `AGENTLOCKS_DISABLE_BUN_FALLBACK=1`, then run a real file-backed lock cycle (acquire then release),
  asserting exit 0. `--version`/`--help` are insufficient: a Bun-compiled single-file binary's real
  failure mode is runtime-asset extraction on the first real command, which the banner paths bypass.
  The win32 leg, when shipped, runs an extended scenario (conflict-rejection, stale-lock reclaim, a
  `git begin`/commit/`git end` cycle, a backslash path) since the Windows port risks are exactly the
  cases a lone acquire/release does not touch; the other legs run the basic cycle.

### 4.4 Human gate, tag provenance, propagation

- **One human approval, on the `flip` job.** The `release` GitHub Environment with required reviewers
  pauses before the flip, so the approver sees the full green matrix before authorizing the only
  user-visible irreversible step. The platform publishes and the matrix run before approval; that is
  acceptable because nothing `npm i -g agentlocks` resolves exists until the flip (the platform
  packages sit under a `preflight` tag and main is unpublished), the bytes are immutable and
  skip-if-exists on re-run, and the early guards run before any publish. A project that wants every
  registry write behind approval can add a second environment gate before `publish-stage`, at the cost
  of a human click before the matrix can run.
- **Guard the tagged commit.** A `v*` tag can point anywhere; an early step asserts the tagged commit
  is on the protected branch (`git fetch origin main && git merge-base --is-ancestor "$GITHUB_SHA"
  origin/main`).
- **Guard the tag shape.** The `v*` trigger also matches `v1.2.3-rc.1`; fail any `$VERSION` not
  matching `^[0-9]+\.[0-9]+\.[0-9]+$`, and assert `tag == package.json`, before any publish.
- **Propagation is eventually consistent.** The matrix retries each install across CDN propagation.
  The post-flip terminal confirmation, with its own retry, distinguishes a wrong-version resolution
  (hard fail) from a still-propagating install (warn, do not roll back); it is post-flip, so it
  surfaces rather than gates.

### 4.5 Concurrency

```yaml
concurrency:
  group: release              # constant: latest is a global resource, not per-ref
  cancel-in-progress: false   # never cancel an in-flight release; a cancelled mid-flip is the half-done state we avoid
```

Actions concurrency has only `group` and `cancel-in-progress`; there is no `queue:` mode (a config
that uses one fails the workflow load with a startup_failure, and `actionlint` flags it). With
`cancel-in-progress: false` an in-flight release is never cancelled and a newer tag queues behind it,
but GitHub keeps only the most recent pending run, so "do not drop a queued tag" is a manual invariant
(release one tag at a time, per RELEASING.md), not a platform guarantee. The real backstop against an
out-of-order or duplicate release is the **monotonic-version guard** in `publish-stage`: fail if
`$VERSION` is below the maximum published `agentlocks` version; if it equals the max, pass only when
the published `agentlocks@$VERSION` byte-matches this run (a legitimate recovery re-run, which the flip
then no-ops) and fail otherwise; strictly greater always passes. Compare as a numeric tuple, not a
string, and without `require('semver')` (not a dependency; it would throw `MODULE_NOT_FOUND`).
Registry immutability (a duplicate publish is rejected `E409`) is the actual race backstop; the
`npm view` pre-checks are courtesies.

### 4.6 What the targets require of the agentlocks code

Adding a target is a build plus a runtime contract; the matrix's lock cycle proves the runtime
contract, so a new leg stays red until the code is correct there.

- **Windows (`win32-x64`)** is a real port, not just a build target. `fs.rename` over an existing
  file throws transient `EPERM`/`EACCES`/`EBUSY` on Windows where POSIX silently replaces, so the
  atomic temp-plus-rename that writes lock records (`src/io.ts:writeFileAtomic`) retries with bounded
  backoff; `process.kill(pid, 0)` liveness, repo-relative path handling (backslashes, drive letters),
  the `@git/index` git invocation, and the Claude/Codex transcript-probe home paths all need to be
  correct on Windows. The proof is two-layered: the `windows-unit` job runs the full lock suite
  (`bun test`) on `windows-latest`, and (when win32 ships) the verify matrix's Windows leg runs the
  extended scenario. `windows-unit` gates `publish-stage` and runs on PRs as a required check, so the
  port cannot regress even while the binary is not shipped.
- **musl (`linux-*-musl`)** is lighter: the same code, needing only that the `bun build --compile`
  musl binary runs on Alpine and that the launcher's musl detection resolves the `-musl` package. The
  matrix leg proves both.

### 4.7 OIDC trusted publishing (authentication, no tokens)

Publishing is tokenless via npm OIDC trusted publishing. Each `setup-node` in a publishing job sets
`registry-url: https://registry.npmjs.org` and the job declares `id-token: write`; with **no**
`NODE_AUTH_TOKEN`, npm (>= 11.5.1, pinned) mints an OIDC credential per run and publishes with
`--provenance`. Do not remove `registry-url`: without it npm has no registry auth context and errors
`ENEEDAUTH`. Do not set a `NODE_AUTH_TOKEN`: it switches npm to token auth and bypasses OIDC.

Each package needs a trusted-publisher entry on npmjs.com (package Settings, Trusted Publisher, GitHub
Actions) pointing at org/user `simke9445`, repo `agentlocks`, workflow `release.yml`. **The
environment field must match the publishing job's environment claim:**

- The **platform** packages are published by `publish-stage`, which runs with **no** `environment:`.
  Their trusted-publisher **Environment must be blank**; an entry that requires `release` rejects the
  OIDC token (the symptom is `npm error 404 ... or you do not have permission` after provenance is
  signed) because the token from an environment-less job carries no environment claim.
- **main** is published by `flip`, which runs in `environment: release`, so its entry may set
  Environment to `release` (or blank; blank accepts any environment, and the human gate protects
  `latest` independently).

A brand-new package name cannot use trusted publishing for its first publish (npm only lets you
configure a trusted publisher on a package that already exists), so each new package is bootstrapped
once with a manual token/OTP publish, then its trusted-publisher config is added and the workflow takes
over. This bootstrap is the only step the pipeline cannot do tokenlessly, and it is what currently
gates win32-x64.

## 5. Failure-mode table

| Failure point | What `npm i -g agentlocks` users see | Recovery |
| --- | --- | --- |
| build, windows-unit, a guard, or a platform publish fails | Nothing. main never packed/published; `latest` unmoved. | Re-run for a transient cause; published platform packages are immutable no-ops. |
| Any matrix leg fails (a binary does not install-and-run) | Nothing. main only packed, not published; `latest` unmoved. | Fix the cause. Defect in an already-published binary: patch-forward (immutable bytes). Build or transient: re-run. The leg is the gate. |
| Flip dies between the matrix and `npm publish main` | Nothing. `latest` unmoved; main not yet published. | Re-run; idempotent (platform publishes skip-if-exists, main publishes if absent). |
| `main@X` already present from a prior run or moved tag | Whatever `main@X` resolves to is `latest`. | The flip byte-matches a pre-existing `main@X` against this run: a match is a recovery no-op; a mismatch hard-fails and you patch-forward. |
| GitHub Release fails after a successful flip | `latest` is correct; only the Release is missing. | Re-run; `release-notes` is a separate idempotent job and runs even though the flip step now no-ops. |
| Functional bug found after the flip (matrix passed) | Everyone on default install gets it. | Roll back `latest` (`npm dist-tag add agentlocks@$PREV latest`, then `npm deprecate`), patch-forward. The matrix catches install/run failures, not logic bugs. |

Roll back `latest` is a logged-in 2FA maintainer action, not OIDC-covered, so the tokenless guarantee
covers the forward pipeline, not recovery. Roll back only to a version whose own release matrix was
green on all shipped targets.

## 6. Mapping to the repo

- **`.github/workflows/release.yml`** is the five-job graph (`build`, `publish-stage`, `verify`
  matrix, `flip`, `release-notes`) plus the `windows-unit` prerequisite. `$TARGETS` (an `env`) is the
  single source of truth for the shipped set. Mutable inputs are pinned: third-party actions to commit
  SHAs, npm to a vetted version at or above the OIDC floor (inside the package-age window), Bun and
  Node via the `setup-*` version inputs, and the Alpine musl-verify image by digest.
- **`.github/workflows/windows-unit.yml`** is the reusable `bun test` + win32 build + extended
  conformance workflow, called by both `release.yml` (gating `publish-stage`) and `ci.yml` (required
  on PRs). A reusable workflow's token can only be downgraded by the caller, so each caller grants
  `contents: read` at the call site.
- **`scripts/ci/`** holds the logic the checkout-less jobs run, extracted and unit-tested
  (`tests/ci-scripts.test.ts`): `verify-install-and-prove.sh` (one verify leg, native or under
  docker), `assert-target-identity.mjs` (+ `platform-target.mjs`), `assert-optional-deps.mjs`,
  `check-manifest.mjs`, `check-monotonic.mjs`, `dist-integrity.sh`. `scripts/build-binaries.mjs`
  cross-compiles every target; `scripts/conformance-scenario.mjs` is the black-box lock scenario.
- **`RELEASING.md`** is the operator runbook: the gate is the pre-flip matrix, recovery is
  re-run-or-patch-forward (forward) vs 2FA rollback (post-flip), and the serialization rule (no manual
  `dist-tag`/publish, no new release tag, while a run is queued or running).

## 7. Operational gotchas (learned from real release runs)

These surfaced only by running the pipeline on real CI; static review and local Docker did not catch
them. They are encoded in the workflow now, recorded here so they are not reintroduced.

- **Concurrency has no `queue:` key.** A `queue: max` (or similar) fails the workflow load with a
  startup_failure on every push. Use `group` + `cancel-in-progress: false` only. Run `actionlint` on
  every workflow change; a workflow can be valid YAML and pass review yet startup_failure.
- **`shell:` takes a literal, not an expression.** `shell: ${{ matrix.shell }}` is invalid. Use a
  static shell per step.
- **JS actions do not run in arm64 Alpine containers.** Run musl legs on the glibc host and
  `docker run` the Alpine work (Section 4.3); a job `container: node:alpine` on `ubuntu-24.04-arm`
  fails any `actions/*` step.
- **npm nests the platform optional dep under main**, not at the global root, so resolve via
  `NODE_PATH=<npm root -g>/agentlocks/node_modules` (Section 4.3).
- **`optionalDependencies` are install-tolerant**, so `npm install` succeeding does not mean the
  platform package landed; make install + identity one retry unit (Section 4.3).
- **`registry-url` is required for OIDC and `NODE_AUTH_TOKEN` must be unset** (Section 4.7); the
  trusted-publisher Environment field must match the publishing job (blank for platform packages).
- **The Windows runner spawns processes slowly**, so the spawn-heavy `bun test` runs with
  `--timeout 30000` on `windows-latest` to avoid a flaky gate.
- **For a tag-only workflow you cannot trigger in normal CI**, a throwaway push-triggered probe branch
  gives real-runner signal without a release (this is how the arm64 Alpine limit was found).

## 8. References

- npm unpublish policy (immutability, 72h window): https://docs.npmjs.com/policies/unpublish/
- npm dist-tag command: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/
- npm trusted publishing (OIDC): https://docs.npmjs.com/trusted-publishers/
- OIDC does not cover dist-tag (open): https://github.com/npm/cli/issues/8547
- napi-rs pre-publish (fan-out, platform-first, Windows + musl): https://napi.rs/docs/cli/pre-publish
- esbuild optionalDependencies fan-out: https://github.com/evanw/esbuild/pull/1621
- Biome distribution (main + per-platform incl. win32 + musl): https://www.npmjs.com/package/@biomejs/biome
- SWC unverified-build-to-latest incident: https://github.com/swc-project/swc/issues/9043
