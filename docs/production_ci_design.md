# Production release pipeline for agentlocks

How agentlocks ships: **one npm package carrying one ~157 KB Node bundle**, released by a tagged
GitHub Actions pipeline that proves the bundle installs-and-runs on every supported OS / libc / Node
before anything users install changes. This document is self-contained; it describes the pipeline as
implemented in `.github/workflows/release.yml`, `.github/workflows/conformance.yml`,
`.github/workflows/windows-unit.yml`, and `scripts/`.

## 1. TL;DR

**Safety property:** no release whose tarball fails to install-and-run on a supported target (or
reports the wrong version) ever becomes the `latest` that `npm i -g agentlocks` resolves. The exact
packed bytes are exercised on every target before the flip to `latest`.

This is the whole flow:

```
1. build dist/agentlocks.mjs and `npm pack` -> main.tgz (a CI artifact; not on npm)
2. install main.tgz the npm way on every target OS/libc/Node, run the extended lock scenario  <- GATE
3. npm publish main.tgz -> latest          (tokenless OIDC; only after step 2 is all-green)
```

It rests on one fact: `npm i -g agentlocks` resolves the single package's `latest`, and the package is
self-contained (one JS file run under the user's Node), so the tarball a matrix installs in step 2 is
byte-identical to what the flip publishes in step 3. There is no platform fan-out to coordinate, no
`optionalDependencies`, no preflight tag — installing `./main.tgz` *is* the real install.

The flip is a plain `npm publish` authorized by OIDC trusted publishing, so the pipeline needs no
dist-tag manipulation and no token. The conformance matrix is a real `needs:` barrier, so a red leg
leaves the package unpublished and `latest` untouched: there is no post-flip canary and no exposure
window. One human approval gates the flip job, so the approver sees the full green matrix before
authorizing the only irreversible, user-visible step.

The cost is latency: the flip waits on the pack and the matrix (about 5-15 minutes). Releases are not
latency-sensitive, so this is the right trade for "nothing broken on any target reaches `latest`."

Supply-chain pinning is in scope, not deferred: the flip job holds `id-token: write`, so every mutable
input is pinned (Section 6). SHA-pinned third-party actions, a vetted npm pin, Bun and Node pinned via
the `setup-*` version inputs, and the Alpine musl image pinned by digest. The guarantee rests on no
mutable input.

## 2. How npm releases work (the facts that constrain everything)

- **Versions are immutable.** Once `agentlocks@0.8.0` is published, those bytes are that version
  forever; there is no overwrite. `npm unpublish` is allowed only within 72 hours under restrictive
  conditions, breaks dependents, and does not help anyone who already installed.
- **Dist-tags are the only mutable pointer.** `latest` names one version; `npm i -g agentlocks`
  resolves whatever `latest` points at now. An exact request (`npm i agentlocks@0.8.0`) resolves
  regardless of any tag — but this pipeline never publishes a version before it is `latest`, so it does
  not rely on that.
- **So verify-after-publish-to-`latest` is a detector, not a gate.** A gate has to sit between the
  build and the `latest` flip; this pipeline puts the whole conformance matrix there, against the
  packed tarball, before the package is ever on npm.
- **OIDC draws a line across operations.** Trusted publishing authorizes `npm publish`; it does not
  cover `npm dist-tag add`. The flip is a plain `npm publish`, so it stays inside what OIDC authorizes,
  which is why the design never repoints a dist-tag.

## 3. Distribution model and target set

agentlocks is a CLI, not a library. It ships **one package carrying one bundle** and runs under the
user's own Node — no embedded runtime, no per-platform binary, no published library API.

- **`dist/agentlocks.mjs`** is the product: `bun build --target=node --minify` of the CLI entry
  (`scripts/build-bundle.mjs`), ~157 KB, pure JavaScript, byte-identical on every CPU arch. The
  `prepack` hook builds it, so `npm pack` always carries a fresh bundle; the tarball is ~5 files / ~59
  kB. `files` in `package.json` is an allowlist (`dist/`, `README.md`, `CHANGELOG.md`, `LICENSE`).
- **The bin is the standard npm shim.** `bin.agentlocks` -> `dist/agentlocks.mjs` (shebang
  `#!/usr/bin/env node`). `npm i -g` writes a POSIX symlink on Linux/macOS and an `agentlocks.cmd`
  cmd-shim (`node ...\dist\agentlocks.mjs %*`) on Windows. Windows is first-class, served the npm way,
  with no `.exe`.
- **No Bun on the user's machine.** The one runtime need that used to force Bun — loading a user
  `agentlocks.config.ts` — is met by Node's unflagged `.ts` type-stripping. That sets `engines.node` to
  `>=22.18` (the first Node release with it). A `.js`/`.mjs` config also works.

Because the bundle is one JS file, the meaningful proof axes are **OS** (path / spawn / npm bin-shim),
**libc** (musl vs glibc), and **Node minor** (type-stripping behavior), **not CPU architecture**:

| Axis | Values proven | Why |
| --- | --- | --- |
| OS | Linux, macOS, Windows | path separators, process spawn, symlink vs `.cmd` bin shim |
| libc | glibc, musl (Alpine) | npm + Node start on musl; no native deps but proven, not assumed |
| Node | 22.18.0 (floor), 22.22.3 (mid), 24.16.0 (pin) | unflagged `.ts` type-stripping evolves across minors |
| CPU arch | x64 (Linux/Windows), arm64 (macOS) — incidentally | pure JS is arch-identical; both arches run anyway |

There is no `$TARGETS`, no `agentlocks-<platform>` package, and no `optionalDependencies`. To widen
coverage, edit the matrix in `conformance.yml`.

## 4. The pipeline

### 4.1 Job graph

```
on: push tags [v*];  concurrency: { group: release, cancel-in-progress: false };  permissions: {}

windows-unit  (contents:read)   white-box: the full lock suite (`bun test --timeout 30000`) on
   |                            windows-latest. Reusable, shared with ci.yml. Runs in PARALLEL with
   |                            pack; both are flip barriers, neither blocks the other.
pack          (contents:read)   bun run check; early guards (tag shape X.Y.Z, tag == package.json, tag
   |                            on origin/main); `bun run build` -> dist/agentlocks.mjs; `npm pack
   |                            --json --ignore-scripts` -> main.tgz (record integrity); monotonic
   |                            version guard; upload main-tarball + ci-scripts artifacts. NO id-token.
   |
conformance   (matrix; {} )     needs: pack. Reusable conformance.yml: download main-tarball +     <- GATE
   |                            ci-scripts; install main.tgz the npm way (no Bun); run the extended
   |                            lock scenario + the .ts-config contract; assert `--version` == tag.
   |                            {ubuntu, macos, windows} x node {22.18.0, 22.22.3, 24.16.0} + musl.
   |                            fail-fast: false. NO id-token, NO checkout.
   |
flip          (OIDC; release)   needs: [conformance, windows-unit, pack]; environment: release  <- approval
   |                            npm publish main.tgz -> latest --provenance (the exact proven bytes;
   |                            idempotent no-op on a byte-matching pre-existing agentlocks@X,
   |                            hard-fail on a mismatch); terminal confirmation that an unpinned
   |                            `npm i -g agentlocks` resolves + runs X (retries lag, then HARD-FAILS).
   |
release-notes (contents:write)  needs: flip. Create/update the GitHub Release (idempotent), attach
                                main.tgz. Separate job so a re-run reaches it even when flip no-ops.
```

`pack` and `windows-unit` run in parallel; `conformance` and `windows-unit` are both real `needs:`
barriers in front of the flip, so a red leg leaves `latest` untouched. The flip publishes the same
`main.tgz` the matrix installed, so the bytes that go live are the bytes proven on every target.

### 4.2 Conformance is the same proof CI runs (the in-line property)

`conformance` is a **reusable workflow** (`.github/workflows/conformance.yml`) that **ci.yml runs on
every push and pull request** against the same freshly packed tarball, with `assert_version` empty
(prove it runs). release.yml calls the identical workflow with `assert_version` set to the tagged
version (additionally prove the bytes report that version). So:

- CI and the release run the **byte-for-byte identical conformance** — same matrix, same install path,
  same scenario. If conformance is green on a PR, the release re-runs an identical proof; the release
  is a formality over what CI already proved, not a new path that first executes at tag time.
- Both pipelines `pack` the tarball the same way (`bun run build` then `npm pack --ignore-scripts`,
  renamed to `main.tgz`) and upload the same two artifacts (`main-tarball`, `ci-scripts`), so the
  reusable's contract — download those two, install, prove — holds unchanged for either caller.

The Windows split inside the proof: `windows-unit` is **white-box** (the full `bun test` lock suite on
Windows); `conformance`'s windows-latest legs are **black-box** (the packed bundle installed via the
npm cmd-shim, extended scenario). They are deliberately disjoint — no duplicated work — and both gate
the flip.

### 4.3 The conformance matrix

`prove` is one leg per (OS, Node) pair, `fail-fast: false`, `permissions: {}`, no checkout (a job that
proves the published bytes holds neither a publish credential nor a repo token; `download-artifact`
uses the runtime token):

| OS | Node 22.18.0 | Node 22.22.3 | Node 24.16.0 | How |
| --- | --- | --- | --- | --- |
| ubuntu-latest (x64, glibc) | ✓ | ✓ | ✓ | POSIX bash: `npm i -g --prefix`, symlink bin |
| macos-latest (arm64) | ✓ | ✓ | ✓ | POSIX bash: `npm i -g --prefix`, symlink bin |
| windows-latest (x64) | ✓ | ✓ | ✓ | pwsh: `npm i -g --prefix`, `agentlocks.cmd` shim |

Plus a separate `musl` leg (Alpine, Node 22.22.3 from the digest-pinned image). Each leg, in a fresh
prefix:

- **POSIX:** `npm i -g --prefix "$PREFIX" main.tgz` puts the bin at `<prefix>/bin/agentlocks`, a symlink
  whose `#!/usr/bin/env node` shebang runs the bundle. No Bun on `PATH` proves the pure-Node path.
- **Windows:** `npm i -g --prefix` writes `<prefix>\agentlocks.cmd` (`node ...\dist\agentlocks.mjs %*`).
  The conformance harness detects the non-`.exe` invocation and spawns it via a shell. This is the
  win32 gate: the bundle served the npm way on Windows.
- **Assert the version** when `assert_version` is non-empty (the release call): `agentlocks --version`
  must equal the tag, so a mis-built or stale tarball cannot pass green-but-wrong. CI leaves it empty
  (only proves the bundle runs).
- **Run the extended scenario** (`node scripts/conformance-scenario.mjs "$BIN" extended`): acquire,
  conflict-rejection, stale-lock reclaim, an `agentlocks commit` (git index) cycle, and a backslash
  path — the cases a lone acquire/release does not touch, which are exactly the Windows / path risks.
  `--version`/`--help` alone are insufficient.
- **Run the `.ts`-config contract** (`node scripts/ts-config-smoke.mjs "$BIN"`): a scaffolded
  `agentlocks.config.ts` loads and validates under the leg's Node (proving type-stripping on the floor,
  not just the pin), and an invalid one is rejected.

**The musl leg does not use a job `container:`.** GitHub does not support JavaScript actions (such as
`actions/download-artifact`) in Alpine containers on arm64 runners, and the runner's glibc-linked Node
cannot start on musl. So the musl leg runs on the glibc host (where the JS actions work), downloads the
artifacts there, and executes the install-and-prove inside the pinned Alpine image via `docker run`,
mounting the workspace. `apk add --no-cache git` is added because the extended scenario's
`agentlocks commit` step needs git.

### 4.4 Human gate, tag provenance, propagation

- **One human approval, on the `flip` job.** The `release` GitHub Environment with required reviewers
  pauses before the flip, so the approver sees the full green conformance matrix + windows-unit before
  authorizing the only user-visible irreversible step. pack and conformance run before approval; that
  is acceptable because nothing `npm i -g agentlocks` resolves changes until the flip (the tarball is
  only a CI artifact), the publish is idempotent and skip-if-exists on a re-run, and the early guards
  run inside pack before any of it.
- **Guard the tagged commit.** A `v*` tag can point anywhere; `pack` asserts the tagged commit is on
  the protected branch (`git fetch origin main && git merge-base --is-ancestor "$GITHUB_SHA"
  origin/main`).
- **Guard the tag shape.** The `v*` trigger also matches `v1.2.3-rc.1`; fail any `$VERSION` not
  matching `^[0-9]+\.[0-9]+\.[0-9]+$`, and assert `tag == package.json`, before any publish.
- **Propagation is eventually consistent.** The post-flip terminal confirmation, with its own retry
  (8 × 15s), installs **unpinned** (`npm i -g agentlocks --prefer-online`) to prove `latest` itself
  now resolves + runs the new version. Genuine propagation lag is absorbed by the retries; if an
  unpinned install still does not resolve/run the new version after them — a wrong-version resolution
  or a persistent install failure — the step emits `::error::` and **hard-fails** (exit 1). The flip
  already confirmed the published bytes, so a non-resolving `latest` here is a real problem, not
  benign lag. The irreversible publish is **not** rolled back; the red run is the maintainer's signal
  to investigate the dist-tag.

### 4.5 Concurrency

```yaml
concurrency:
  group: release              # constant: latest is a global resource, not per-ref
  cancel-in-progress: false   # never cancel an in-flight release; a cancelled mid-flip is the half-done state we avoid
```

Actions concurrency has only `group` and `cancel-in-progress`; there is no `queue:` mode (a config that
uses one fails the workflow load with a startup_failure, and `actionlint` flags it). With
`cancel-in-progress: false` an in-flight release is never cancelled and a newer tag queues behind it,
but GitHub keeps only the most recent pending run, so "do not drop a queued tag" is a manual invariant
(release one tag at a time, per RELEASING.md), not a platform guarantee. The real backstop against an
out-of-order or duplicate release is the **monotonic-version guard** in `pack`: fail if `$VERSION` is
below the maximum published `agentlocks` version; if it equals the max, pass only when the published
`agentlocks@$VERSION` byte-matches this run (a legitimate recovery re-run, which the flip then no-ops)
and fail otherwise; strictly greater always passes. Compare as a numeric tuple, not a string, and
without `require('semver')` (not a dependency; it would throw `MODULE_NOT_FOUND`). Registry
immutability (a duplicate publish is rejected `E409`) is the actual race backstop; the `npm view`
pre-checks are courtesies. The guard logic lives in `scripts/ci/check-monotonic.mjs` and is unit-tested.

### 4.6 What the targets require of the agentlocks code

The conformance scenario proves the runtime contract, so a target stays red until the code is correct
there.

- **Windows** is a real port, not just a runner label. `fs.rename` over an existing file throws
  transient `EPERM`/`EACCES`/`EBUSY` on Windows where POSIX silently replaces, so the atomic
  temp-plus-rename that writes lock records (`src/io.ts:writeFileAtomic`) retries with bounded backoff;
  `process.kill(pid, 0)` liveness, repo-relative path handling (backslashes, drive letters), the
  `@git/index` git invocation, and the Claude/Codex transcript-probe home paths all need to be correct
  on Windows. The proof is two-layered: `windows-unit` runs the full lock suite (`bun test`) on
  windows-latest (white-box), and the conformance matrix's windows legs run the extended scenario via
  the npm cmd-shim (black-box). `windows-unit` gates the flip and runs on PRs as a required check, so
  the port cannot regress between releases.
- **The Node floor (22.18)** is the type-stripping contract: a scaffolded `agentlocks.config.ts` must
  load under the minimum supported Node. `ts-config-smoke.mjs` on the 22.18.0 leg is the proof; this is
  the riskiest dimension, since unflagged `.ts` stripping is still evolving across Node minors (hence
  the 22.18 / 22.22 / 24.16 fan-out).
- **musl** is lighter: the same pure-JS bundle, needing only that npm + Node start on Alpine and the
  scenario's git ops work. The musl leg proves it.

### 4.7 OIDC trusted publishing (authentication, no tokens)

Publishing is tokenless via npm OIDC trusted publishing. The `flip` job's `setup-node` sets
`registry-url: https://registry.npmjs.org` and the job declares `id-token: write`; with **no**
`NODE_AUTH_TOKEN`, npm (>= 11.5.1, pinned) mints an OIDC credential per run and publishes with
`--provenance`. Do not remove `registry-url`: without it npm has no registry auth context and errors
`ENEEDAUTH`. Do not set a `NODE_AUTH_TOKEN`: it switches npm to token auth and bypasses OIDC.

The single `agentlocks` package needs one trusted-publisher entry on npmjs.com (package Settings →
Trusted Publisher → GitHub Actions) pointing at org/user `simke9445`, repo `agentlocks`, workflow
`release.yml`. The `flip` job runs in `environment: release`, so the entry's Environment field must be
`release` or blank (blank accepts any environment; the human gate protects `latest` independently).
This is already configured — 0.7.0 published through this exact path (`flip`, `environment: release`,
OIDC, provenance). With only one package there is no platform-package / main environment split to keep
straight, which removes the most error-prone part of the old fan-out configuration.

## 5. Failure-mode table

| Failure point | What `npm i -g agentlocks` users see | Recovery |
| --- | --- | --- |
| windows-unit, a guard, or pack fails | Nothing. The tarball was never packed/published; `latest` unmoved. | Re-run for a transient cause; fix + patch-forward for a real defect. |
| Any conformance leg fails (the bundle does not install-and-run, or reports the wrong version) | Nothing. The tarball is only a CI artifact; `latest` unmoved. | Fix the cause and patch-forward (immutable bytes), or re-run a transient. The leg is the gate. |
| Flip dies between the matrix and `npm publish` | Nothing. `latest` unmoved; package not yet published. | Re-run; the flip publishes if absent. |
| `agentlocks@X` already present from a prior run or moved tag | Whatever `agentlocks@X` resolves to is `latest`. | The flip byte-matches a pre-existing `@X` against this run: a match is a recovery no-op; a mismatch hard-fails and you patch-forward. |
| GitHub Release fails after a successful flip | `latest` is correct; only the Release is missing. | Re-run; `release-notes` is a separate idempotent job and runs even though the flip step now no-ops. |
| Functional bug found after the flip (matrix passed) | Everyone on default install gets it. | Roll back `latest` (`npm dist-tag add agentlocks@$PREV latest`, then `npm deprecate`), patch-forward. The matrix catches install/run failures, not logic bugs. |

Roll back `latest` is a logged-in 2FA maintainer action, not OIDC-covered, so the tokenless guarantee
covers the forward pipeline, not recovery. Roll back only to a version whose own release matrix was
green on all targets.

## 6. Mapping to the repo

- **`.github/workflows/release.yml`** is the five-job graph: `windows-unit` (reusable) and `pack` in
  parallel, `conformance` (reusable) after pack, `flip` after all three behind the `release`
  environment, `release-notes` after flip. Mutable inputs are pinned: third-party actions to commit
  SHAs, npm to a vetted version at/above the OIDC floor (inside the package-age window), Bun and Node
  via the `setup-*` version inputs.
- **`.github/workflows/conformance.yml`** is the reusable BLACK-BOX conformance: input `assert_version`
  (empty in CI, the tag in release), a `prove` matrix ({ubuntu, macos, windows} x node {22.18.0,
  22.22.3, 24.16.0}, fail-fast off, `permissions: {}`, no checkout) plus a `musl` job. The digest-pinned
  Alpine image lives here. Called by both release.yml and ci.yml so both prove identical bytes
  identically.
- **`.github/workflows/windows-unit.yml`** is the reusable WHITE-BOX Windows gate: `bun test
  --timeout 30000` (the full lock suite) on windows-latest. Called by both release.yml (a flip barrier)
  and ci.yml (a required PR check). A reusable workflow's token can only be downgraded by the caller, so
  each caller grants `contents: read` at the call site.
- **`.github/workflows/ci.yml`** runs on push/PR: `check` (test + typecheck + lint on Linux),
  `windows-unit`, and `pack` -> `conformance`, all in parallel where possible. It packs and proves the
  exact same way release.yml does, so a green CI is a proven release tarball.
- **`scripts/`**: `build-bundle.mjs` builds `dist/agentlocks.mjs`; `conformance-scenario.mjs` is the
  black-box lock scenario (basic | extended); `ts-config-smoke.mjs` is the `.ts`-config engine
  contract. **`scripts/ci/`** holds the checkout-less release logic, unit-tested in
  `tests/ci-scripts.test.ts`: `check-monotonic.mjs` (the monotonic-version tuple compare) and
  `dist-integrity.sh` (the published-bytes integrity probe the pack guard and the flip idempotency
  check share).
- **`RELEASING.md`** is the operator runbook: the gate is the conformance matrix, recovery is
  re-run-or-patch-forward (forward) vs 2FA rollback (post-flip), and the serialization rule (no manual
  `dist-tag`/publish, no new release tag, while a run is queued or running).

## 7. Operational gotchas (learned from real release runs)

These surfaced only by running the pipeline on real CI; static review and local Docker did not catch
them. They are encoded in the workflows now, recorded here so they are not reintroduced.

- **Concurrency has no `queue:` key.** A `queue: max` (or similar) fails the workflow load with a
  startup_failure on every push. Use `group` + `cancel-in-progress: false` only. Run `actionlint` on
  every workflow change; a workflow can be valid YAML and pass review yet startup_failure.
- **`shell:` takes a literal, not an expression.** `shell: ${{ matrix.shell }}` is invalid. Use a
  static shell per step (the matrix legs branch on `if: runner.os == 'Windows'` instead).
- **JS actions do not run in arm64 Alpine containers.** Run the musl leg on the glibc host and
  `docker run` the Alpine work (Section 4.3); a job `container: node:alpine` on an arm64 runner fails
  any `actions/*` step. The alpine `node` image also lacks git, so `apk add --no-cache git` is needed
  for the conformance scenario's `agentlocks commit` step.
- **Reusable-workflow inputs cannot be dereferenced with a hyphen.** `${{ inputs.assert-version }}`
  parses as a subtraction; use `inputs.assert_version` (underscore). Reusable-workflow `env:` does not
  inherit from the caller either, so the musl image digest is declared inside conformance.yml.
- **Build, then `npm pack --ignore-scripts`** when you need to parse `npm pack --json` for the
  integrity: running the `prepack` build inline would emit stdout that corrupts the JSON parse. pack
  builds explicitly first, then packs with scripts off.
- **`registry-url` is required for OIDC and `NODE_AUTH_TOKEN` must be unset** (Section 4.7).
- **The Windows runner spawns processes slowly**, so the spawn-heavy `bun test` runs with
  `--timeout 30000` on windows-latest to avoid a flaky gate (a multi-spawn ci-scripts test was observed
  taking 9.4s, past Bun's 5s default).
- **For a tag-only workflow you cannot trigger in normal CI**, a throwaway push-triggered probe branch
  (or `ci.yml`'s `workflow_dispatch`) gives real-runner signal without a release. Because ci.yml now
  runs the identical conformance reusable, a green CI run already exercises the release's gate.

## 8. References

- npm unpublish policy (immutability, 72h window): https://docs.npmjs.com/policies/unpublish/
- npm dist-tag command: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/
- npm trusted publishing (OIDC): https://docs.npmjs.com/trusted-publishers/
- OIDC does not cover dist-tag (open): https://github.com/npm/cli/issues/8547
- Node.js unflagged TypeScript type-stripping (>= 22.18 / 23.6): https://nodejs.org/api/typescript.html
- Reusable workflows (limits, inputs, permissions): https://docs.github.com/actions/using-workflows/reusing-workflows
- SWC unverified-build-to-latest incident (why the gate is pre-flip): https://github.com/swc-project/swc/issues/9043
