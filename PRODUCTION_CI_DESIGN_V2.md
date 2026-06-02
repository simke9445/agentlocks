# Production release pipeline for agentlocks (V2: full-fanout-gated, all targets)

This supersedes the V1 design's scope boundary. V1 proved only the launcher wiring and the `linux-x64` binary before the flip and caught the other targets with a post-flip canary. V2 proves **every** target before the flip and extends the fanout to Windows and musl, while staying tokenless.

## 1. TL;DR

**Safety property:** no release in which *any* shipped platform binary fails to install-and-run on its real OS ever becomes the `latest` that `npm i -g agentlocks` resolves. Every target is exercised on its native runner before the flip.

This holds because of one fact plus one trick:

- **Fact:** `npm i -g agentlocks` resolves only the main package's `latest`, then installs the platform binary main pins by *exact version*. So main's `latest` is the single user-visible switch; a platform package merely existing at version `X` is invisible until main's `latest` points at `X`.
- **Trick (the V2 unlock):** `npm pack` main into a tarball, hand it to a multi-OS matrix as a CI artifact, and have each runner `npm i -g ./main.tgz`. Installing the local tarball still resolves main's `optionalDependencies` from the registry, so each OS pulls and executes *its own real, already-published binary*. main is not on npm during this, so it is invisible to users. The flip is then `npm publish` of that same tarball to `latest`, done only after every matrix leg is green.

```
1. publish the N platform binary packages        (under a preflight tag; not what npm i -g resolves)
2. npm pack main -> main.tgz (CI artifact)
3. matrix over ALL N targets: npm i -g ./main.tgz, Bun fallback off, real lock cycle   <- THE GATE
4. npm publish main.tgz -> latest                 (tokenless OIDC; only if step 3 was all-green)
```

The flip stays a plain `npm publish` the existing OIDC trusted-publishing credential authorizes, so V2 needs **no dist-tag and no token**. The matrix *is* the gate (a real `needs:` barrier), which means the V1 post-flip canary, its notify-owner machinery, and the flip-to-canary exposure window all go away. The one human approval gates the **flip** job, so the approver sees the full green matrix before authorizing the only irreversible step.

The cost is latency: the flip waits on build + N publishes + an N-way matrix (about 10-20 minutes). Releases are not latency-sensitive, so this is the right trade for "nothing broken on any target reaches `latest`."

**Windows is a real port, not just a build target** (Section 4.7): agentlocks' lock core uses POSIX-shaped behavior (atomic rename-replace, `process.kill(pid, 0)` liveness, path handling) that differs on Windows. The matrix's Windows leg is the forcing function: its extended lock scenario (Section 4.4) plus a `windows-latest` job running the full lock test suite stay red until the port is correct, so "support Windows" means "make agentlocks correct on Windows, proven by a gating leg and green Windows unit tests," not "compile an `.exe`."

**Supply-chain pinning is in-scope, not deferred:** the flip job holds `id-token: write`, so the change SHA-pins the third-party actions and replaces `npm install -g npm@latest` with a vetted npm pin (Section 6). The guarantee rests on nothing mutable.

## 2. How npm releases actually work (the facts that constrain everything)

**Versions are immutable.** Once `agentlocks@0.7.0` is published, those bytes are that version forever; there is no overwrite. `npm unpublish` is allowed only within 72 hours under restrictive conditions, breaks existing dependents, and does not help anyone who already installed. ([unpublish policy](https://docs.npmjs.com/policies/unpublish/))

**Dist-tags are the only mutable pointer.** `latest` names one version; `npm i -g agentlocks` resolves whatever `latest` points at now. An exact request (`npm i agentlocks@0.7.0`) resolves regardless of any tag, which is what lets the matrix install a version that is not yet `latest`. ([dist-tag docs](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/))

**So verify-after-publish-to-`latest` is a detector, not a gate.** A gate has to sit between upload and the `latest` flip; V2 puts the whole platform matrix there.

**OIDC draws a line across operations.** Trusted publishing authorizes `npm publish` and `npm stage publish`; it does not cover `npm dist-tag add` ([npm/cli#8547](https://github.com/npm/cli/issues/8547), open) or `npm stage approve` (proof-of-presence 2FA). V2's flip is a `npm publish`, so it stays inside what OIDC authorizes; the dist-tag and staged-publishing alternatives (Section 4.8) do not.

## 3. How real analogs do it

agentlocks is a Biome-style fan-out (a thin main package plus per-platform binary packages gated by `os`/`cpu`/`libc`).

- **napi-rs** is the closest match: main + per-platform `optionalDependencies`, published together, platform packages first, with first-class Windows and musl targets. ([pre-publish](https://napi.rs/docs/cli/pre-publish))
- **esbuild** pioneered the `optionalDependencies` fan-out and ships glibc, musl, Windows, and many arches as separate packages; it is the reference for the model and for the disabled-optional-deps failure mode the launcher fallback covers. ([PR #1621](https://github.com/evanw/esbuild/pull/1621))
- **Biome** ships the exact distribution agentlocks copies, including `@biomejs/cli-win32-*` and `cli-linux-*-musl`. ([npm](https://www.npmjs.com/package/@biomejs/biome))
- **SWC** is the cautionary tale: a nightly went out as `latest` and broke installs for everyone; the fix was to stop publishing unverified builds to `latest`. ([#9043](https://github.com/swc-project/swc/issues/9043))

The common shape is post-publish smoke. V2 is stronger: the cross-platform install is a *pre-flip gate*, so a broken target blocks the release rather than alarming after it.

## 4. The proposed pipeline

### 4.1 The fanout and the single switch

`npm i -g agentlocks` resolves main's `latest`, then installs the platform binary main pins by exact version in `optionalDependencies`; the launcher (`bin/agentlocks.mjs`) does `require.resolve("agentlocks-<platform>/bin/<exe>")` against that exact pin (`.exe` on win32, already handled at line 21) and never reads a platform package's dist-tag. So the entire design reduces to: **do not make `agentlocks@X` the `latest` main until every target is proven.**

V2's target set and gates (resolution is by exact version *after* npm's `os`/`cpu`/`libc` filter):

| Package | `os` | `cpu` | `libc` | Bun build target |
| --- | --- | --- | --- | --- |
| agentlocks-linux-x64 | linux | x64 | glibc | `bun-linux-x64` |
| agentlocks-linux-arm64 | linux | arm64 | glibc | `bun-linux-arm64` |
| agentlocks-linux-x64-musl | linux | x64 | musl | `bun-linux-x64-musl` |
| agentlocks-linux-arm64-musl | linux | arm64 | musl | `bun-linux-arm64-musl` |
| agentlocks-darwin-arm64 | darwin | arm64 | (none) | `bun-darwin-arm64` |
| agentlocks-darwin-x64 | darwin | x64 | (none) | `bun-darwin-x64` |
| agentlocks-win32-x64 | win32 | x64 | (none) | `bun-windows-x64` |

`libc` makes glibc and musl mutually exclusive on Linux, so the right one installs on Alpine vs Debian automatically and the launcher never has to choose. `win32-arm64` is **out of scope until verified**: Bun's `bun-windows-arm64` compile target and a GitHub `windows-11-arm` verify runner must both exist; if either is missing it stays fallback-only (the launcher runs the TS entry under Bun, or errors actionably), and that scope boundary is stated, not silent. (Verify the exact Bun `--target` list and GitHub runner labels at implementation; they move faster than any doc.)

### 4.2 Job graph

```
on: push tags [v*];  concurrency: { group: release, queue: max, cancel-in-progress: false }

build           (no secrets)  cross-compile all N binaries -> artifacts
   |
publish-stage   (OIDC)        early guards (tag on origin/main, shape X.Y.Z, monotonic version);
   |                          publish N platform packages -> preflight tag (skip-if-exists, --provenance);
   |                          manifest + provenance guard over all N; inject + assert exact pins; npm pack main
   |                          -> upload main.tgz artifact.  Nothing `npm i -g agentlocks` resolves exists yet.
   |
verify          (matrix over ALL N targets; permissions: {}; NO id-token)   <- THE GATE
   |                          download main.tgz; npm i -g ./main.tgz (pulls the matching platform
   |                          package@X from the registry); Bun fallback OFF; real acquire/release
   |                          lock cycle by absolute path; assert exit 0. fail-fast: false.
   |
flip            (needs: verify [ALL green]; OIDC; environment: release  <- the human approval)
   |                          npm publish main.tgz -> latest (exact verified bytes; on a pre-existing
   |                          main@X, provenance-match this run -> idempotent no-op, else hard-fail);
   |                          terminal confirmation: npm i -g agentlocks resolves+runs X (warn on lag).
   |
release-notes   (needs: flip)  create GitHub Release (idempotent: gh release view || create), upload
                              binaries. Separate job, so a re-run reaches it even when flip no-ops.
```

The matrix is a real `needs:` barrier in front of the flip, so a red leg leaves main unpublished and `latest` untouched. The flip publishes the same `main.tgz` the matrix installed, so the bytes that go live are the bytes proven on every target. Because the gate is pre-flip, there is no post-flip canary, no notify-owner SLA, and no exposure window for the covered targets.

### 4.3 Why the tarball-to-matrix trick is tokenless and faithful

The obstacle V1 hit: to run a darwin or Windows binary you need its native runner, but the matrix legs are separate jobs, and the flip must happen only after all of them. Verifying the real `npm i agentlocks@X` would require main to be published first, and re-pointing a published main to `latest` needs `npm dist-tag add`, which OIDC does not authorize, forcing a token.

V2 sidesteps it by verifying main from its **packed tarball** rather than from the registry. `npm pack` produces main's exact publishable tarball; `npm i -g ./main.tgz` resolves main's `optionalDependencies` from the registry exactly as a real install does, so each runner fetches and executes its real published binary. main is never on npm during verification, so nothing is user-visible, and the flip is a plain `npm publish` of that tarball (OIDC, tokenless), publishing bytes already proven on every OS.

The one residual: a local-tarball install does not exercise npm fetching *main's own tarball* from the registry. That step is OS-independent (main is just the launcher plus `optionalDependencies` metadata; every OS-specific byte lives in the platform packages, which *are* fetched from the registry per target), and the tarball is byte-identical to what the flip publishes, so the gap is negligible. The in-`flip` terminal confirmation (Section 4.5) closes even that by doing one real-registry `npm i -g agentlocks` after the flip, as a propagation check rather than a gate.

### 4.4 The verify matrix

One leg per target, `fail-fast: false`, `permissions: {}` (no `contents`, no `id-token`: a job that runs freshly-built binaries should not hold the publish credential):

| Leg | Runner |
| --- | --- |
| linux-x64 (glibc) | `ubuntu-latest` |
| linux-arm64 (glibc) | `ubuntu-24.04-arm` |
| linux-x64-musl | `ubuntu-latest` + `container: node:lts-alpine` |
| linux-arm64-musl | `ubuntu-24.04-arm` + `container: node:lts-alpine` |
| darwin-arm64 | `macos-latest` |
| darwin-x64 | `macos-15-intel` (or `macos-26-intel`; a currently supported Intel label, re-check, it is winding down) |
| win32-x64 | `windows-latest` |

Each leg runs the same POSIX-`sh`-compatible script (no bashisms) in a fresh prefix, so one script runs under busybox `sh` in the Alpine musl containers (which ship no bash), under git-bash on Windows, and on the rest: `shell: sh` on the Alpine legs, `shell: bash` on Windows.

- `npm i -g ./main.tgz` with `npm_config_omit= --include=optional` (so a runner `.npmrc` carrying `omit=optional` cannot skip the platform package and produce a false pass via the Bun fallback) and `--prefer-online` (bust npm's negative-packument cache so a propagation-lag miss is retried, not served stale). Retry the whole install-and-check across a bounded window for the platform package's CDN propagation; only a successful install whose binary then fails is a fast hard-fail.
- Invoke the **npm-installed launcher shim** by absolute path, never the platform binary directly and never from `PATH` (so a stale global install cannot contaminate the proof): `$PREFIX/bin/agentlocks` on Linux/macOS, and the npm-created `agentlocks` shim in the global prefix on Windows (e.g. `agentlocks.cmd`), *not* `agentlocks-win32-x64/bin/agentlocks.exe` (that is the binary the launcher resolves, not the entry users invoke).
- **Assert the leg proved the intended target**, so a mis-mapped runner label or a wrong libc filter cannot leave a target green-but-unproved: check `process.platform`/`process.arch`/libc, that the installed optional dependency is exactly `agentlocks-<target>@$VERSION`, and that the launcher resolved *that* package's binary.
- `AGENTLOCKS_DISABLE_BUN_FALLBACK=1`, then run a **real file-backed lock cycle** (in a bare temp dir, no git needed: `acquire f.txt --reason ci --id-only` capturing the id, then `release "$LID"`), asserting exit 0 on each. `--version`/`--help` are insufficient: a Bun-compiled single-file binary's real failure mode is runtime-asset extraction on the first real command, which the banner paths bypass. The **Windows leg runs an extended scenario** beyond this basic cycle (conflict-rejection, stale-lock reclaim, a `git begin`/commit/`git end` cycle, a backslash path), since Section 4.7's Windows port risks are exactly the cases a lone acquire/release does not touch; the glibc/darwin/musl legs run the basic cycle (their runtime is the proven POSIX path).

The musl legs run inside an Alpine container so npm is musl-linked and its `libc` detection selects the musl package; confirm the container's npm does `libc` filtering (any modern npm does) and meets any floor the verify step needs (verify does not publish, so it needs no OIDC floor).

### 4.5 Human gate, tag provenance, propagation

- **One human approval, on the `flip` job.** The `release` environment with required reviewers pauses before the flip, so the approver sees the full green matrix before authorizing the only irreversible step. The platform publishes and the matrix run *before* approval; that is acceptable because nothing `npm i -g agentlocks` resolves exists until the flip (the platform packages sit under a preflight tag and main is unpublished), the bytes are immutable and skip-if-exists on re-run, and the early guards below run before any publish. This is a deliberate policy: the gate covers the one user-visible irreversible action (the `latest` flip), not the invisible, immutable platform publishes that precede it. A project that wants *every* registry write behind approval can add a second `environment` gate before `publish-stage`, at the cost of a human click before the matrix can even run; V2 gates only the flip because the platform publishes are not user-visible until it.
- **Guard the tagged commit, not just the deploy.** A `v*` tag can point at any commit; add tag protection plus an early step (before any publish) asserting the tagged commit is on the protected branch: `git fetch origin main && git merge-base --is-ancestor "$GITHUB_SHA" origin/main || exit 1` (checkout is shallow by default, so fetch enough history).
- **Guard the tag shape early.** The `v*` trigger also matches `v1.2.3-rc.1`; fail any `$VERSION` not matching `^[0-9]+\.[0-9]+\.[0-9]+$` next to the existing `tag == package.json` check, before any publish, so a prerelease tag cannot publish the platform packages and then strand at the exact-pin assertion.
- **Propagation is eventually consistent**, per package and uncorrelated. The matrix retries each install across documented CDN propagation. After the flip, the single post-flip check is the in-`flip` terminal confirmation: with its own retry, it distinguishes a wrong-version resolution (hard fail) from a still-propagating install (warn, do not roll back). It is post-flip, so it cannot gate, but it surfaces a wrong or lagging `latest`.

### 4.6 Concurrency

```yaml
concurrency:
  group: release          # constant: latest is a global resource, not per-ref
  queue: max              # FIFO, up to 100 pending; do not silently drop a queued tag
  cancel-in-progress: false   # a cancelled mid-flip is the half-done state we avoid
```

`queue: max` (GitHub changelog 2026-05-07) keeps a queued tag from being dropped the way the default `queue: single` would; it is incompatible with `cancel-in-progress: true`, which is why we use `false`. It is FIFO by wait-start, not by version, so also add a **monotonic-version guard** early: fail if `$VERSION` is below the maximum published `agentlocks` version; if it equals the max, pass only when the published `agentlocks@$VERSION` provenance-matches this run (a legitimate recovery re-run, which the flip then no-ops, Section 4.3) and fail otherwise; strictly-greater always passes. That equal-version-with-provenance exception reconciles the guard with the recovery path so a full re-run is not blocked, and the lighter recovery (GitHub's *re-run failed jobs*) leaves the already-green `publish-stage` and its guard untouched anyway. Compare as a numeric tuple, not a string, and not `require('semver')` (not a dependency; it would throw `MODULE_NOT_FOUND`); an empty result is a first release that passes, a network error retries. Registry immutability (a duplicate publish is rejected E409) is the actual race backstop; the `npm view` pre-checks are courtesies. A constant group does not reach a maintainer's terminal, so RELEASING.md must forbid manual `dist-tag`/publish changes while a release run is queued or running.

### 4.7 What the targets require of the agentlocks code

Adding a target is a build plus a runtime contract. The matrix's lock cycle is what proves the runtime contract, so a new leg stays red until the code is actually correct there.

- **Windows (`win32-x64`)** is a real port. Likely fixes the Windows leg will force: `fs.rename` over an existing file throws `EPERM` on Windows where POSIX silently replaces, so the atomic temp-plus-rename that writes lock records needs a Windows-safe replace; `process.kill(pid, 0)` liveness has different semantics and error codes on Windows; repo-relative path handling (backslashes, drive letters) and the `@git/index` git invocation need normalizing; the Claude/Codex session-transcript liveness probes read POSIX-shaped home paths. The launcher's `.exe` resolution is already there; the lock core is the work. A single `acquire`/`release` cycle does not prove these, so the Windows proof is two-layered: the release matrix's Windows leg runs an **extended scenario** (acquire, a second-agent conflicting acquire that must be rejected, a stale-lock reclaim, a `git begin`/commit/`git end` cycle, and a backslash/drive-letter path) that exercises rename-replace, liveness, and the git-index path end to end; and a separate `windows-latest` CI job runs the **full lock test suite** (`bun test`) for the unit cases (path normalization, transcript probes). Both must be green before the Windows target ships: the release leg gates the flip, and a `windows-unit` job (`bun test` on `windows-latest`, Section 6) gates both the release (`publish-stage` `needs` it) and the merge (a branch-protection-required check).
- **musl (`linux-*-musl`)** is lighter: the same code, needing only that the `bun build --compile` musl binary runs on Alpine. It is a build-and-verify matter, not a port, but confirm Bun's musl static binary executes under musl libc (the matrix leg proves it).

This section is why V2 is a meaningful change to the project, not only to CI: it commits to the platform packages *and* to the code being correct on each, gated.

### 4.8 Alternatives considered

- **dist-tag promote with a granular token** (publish main@`next`, matrix installs `agentlocks@X` from the registry, then `npm dist-tag add ... latest`). Marginally more faithful (it tests main-from-registry too), but reintroduces a standing `latest`-moving secret. Its blast radius is smaller than a publish token (it can only repoint to an already-published version, not publish new bytes), so it is defensible, but the tarball path gives the same guarantee tokenlessly.
- **npm Staged Publishing** (`npm stage publish` all packages via OIDC, run the matrix, then a human `npm stage approve` with 2FA makes them live atomically). This is the architecturally ideal primitive: a genuine atomic multi-package go-live, tokenless to stage, with the approve mapping onto the human gate. Adopt it once its semantics are verified (can a staged-but-unapproved version be installed for the matrix, and is multi-package approve atomic?) and its higher toolchain floor (npm >= 11.15.0, Node >= 22.14.0) is met. Until then the tarball-artifact path delivers the same pre-flip guarantee today. ([trusted publishing](https://docs.npmjs.com/trusted-publishers/))

## 5. Failure-mode table

| Failure point | What users on `npm i -g agentlocks` see | Recovery |
| --- | --- | --- |
| build, a guard, or a platform publish fails | Nothing. main never packed/published; `latest` unmoved. | Re-run for a no-code-change cause; published platform packages are immutable no-ops. |
| Any matrix leg fails (a binary does not install-and-run on its OS) | Nothing. main was only packed, never published; `latest` unmoved. | Fix the cause. If it is a defect in an already-published platform binary, patch-forward (immutable bytes cannot be replaced); if it is the build or transient, re-run. The leg is the gate, so a bad target cannot reach `latest`. |
| Flip job dies between the matrix and `npm publish main` | Nothing. `latest` unmoved; main not yet published. | Re-run; idempotent (platform publishes skip-if-exists, main publishes if absent). |
| `main@X` already present from a prior run or a moved tag | Whatever `main@X` resolves to is `latest`; if it is not this run's bytes, the wrong thing is live. | The flip provenance-matches a pre-existing `main@X` against this run: a match is a recovery no-op (continue to Release); a mismatch hard-fails and you patch-forward (Section 6 steps 4/6: confirm the attestation command, else hard-fail unconditionally). Foreign platform packages are likewise rejected by the provenance guard (Section 6 step 4). |
| GitHub Release fails after a successful flip | `latest` is correct; only the Release is missing. | Re-run. The `release-notes` job is separate from `flip` (Section 6 step 7) and idempotent (`gh release view || gh release create`), so it runs even though the flip step now provenance-no-ops on the already-published `main@X`. |
| Functional bug found after the flip (matrix passed, real-world bug) | Everyone on default install gets it. | Roll back `latest`, `npm deprecate`, patch-forward (Section 5 rollback). The matrix catches install/run failures, not logic bugs. |
| win32-arm64 user (if scoped fallback-only) | No prebuilt binary; launcher falls back to Bun or errors actionably. | Out of scope by design (Section 4.1) until the target and runner exist. |

**Roll back `latest`** is a logged-in 2FA maintainer action (`npm dist-tag add agentlocks@$PREV latest` then `npm deprecate`), not OIDC-covered, so the tokenless guarantee covers the forward pipeline, not recovery. Pre-flight: every platform package must exist at `$PREV` and `agentlocks@$PREV` must install-and-run a real lock cycle (Bun fallback off) on a target with stored green matrix evidence, or roll back only to a version whose own release matrix was green on all targets.

## 6. Concrete changes from the current `release.yml`

The current file is a single `release` job plus a two-leg `verify`. V2 restructures into `build -> publish-stage -> verify (matrix) -> flip -> release-notes`.

1. **Add the target packages.** Create `npm/linux-x64-musl`, `npm/linux-arm64-musl`, `npm/win32-x64` package directories with correct `os`/`cpu`/`libc`/`files` and no package.json `bin` field (the launcher resolves the path). Add their Bun `--target`s to `scripts/build-binaries.mjs` (the Windows output is `agentlocks.exe`). Configure an npm **trusted-publisher** entry (OIDC) for each: repo `simke9445/agentlocks`, workflow `release.yml`. Mind the environment split (the most likely first-run failure): the **platform** packages publish in the environment-less `publish-stage`, so their trusted publishers must NOT require `environment: release` (one that does would fail OIDC there); **main** publishes in the gated `flip` job, so its trusted publisher is bound to `environment: release`. A brand-new package name cannot use trusted publishing for its **first** publish (npm only lets you configure a trusted publisher on a package that already exists), so bootstrap each new package (`win32-x64`, `linux-x64-musl`, `linux-arm64-musl`) once with a manual token/OTP publish, then add its trusted-publisher config and let the workflow take over.
2. **`concurrency`** block: constant group, `queue: max`, `cancel-in-progress: false`.
3. **`build` job** (no secrets): cross-compile all N binaries (or a build matrix per target for parallelism and native robustness), upload each as an artifact. `bun build --compile` cross-compiles Windows and musl from one host, but the matrix verify is the real safety net for those.
4. **`publish-stage` job** (OIDC): early guards (tag on `origin/main`, shape `X.Y.Z`, monotonic version); publish all N platform packages under a `preflight` dist-tag (not their own `latest`, so an unverified `@X` is not directly installable via `npm i agentlocks-<plat>`; main pins them by exact version, so the fanout resolves regardless) with skip-if-exists and `--provenance`; the manifest **and provenance** guard over all N (`name`/`version`/`os`/`cpu`/`libc`/`files` and the `bin/<exe>` path present in the tarball, plus that each published `agentlocks-<plat>@X` carries a `--provenance` attestation tying it to this repo's release workflow, so a skip-if-exists reuse cannot accept a foreign or squatted package even if it happens to install; confirm the exact attestation-verify command against current npm/gh at implementation, and hard-fail and patch-forward on a mismatch); inject `optionalDependencies` and assert the **set** is exactly the N names at exactly `$VERSION` (no extras, none missing, no ranges); `npm pack` main and upload `main.tgz` as an artifact. No flip here.
5. **`verify` job** (`needs: publish-stage`, matrix over all N targets, `permissions: {}`, `fail-fast: false`): download `main.tgz`; per Section 4.4, `npm i -g ./main.tgz` with optional-deps forced on and `--prefer-online`, fresh prefix, absolute-path invocation, fallback off, real lock cycle, bounded propagation retry. musl legs use `container: node:lts-alpine` with `shell: sh` (Alpine has no bash); the Windows leg uses `shell: bash` (git-bash); the script stays POSIX-`sh`-compatible. Each leg asserts the target identity it proved (`process.platform`/`arch`/libc, the installed `agentlocks-<target>@$VERSION`, the resolved launcher binary), and invokes the npm launcher shim, never the platform binary directly (Section 4.4). **Raise `timeout-minutes`** to fit the install-plus-propagation budget on the slowest leg.
6. **`flip` job** (`needs: verify` all green; OIDC; `environment: release` for the one human approval): `npm publish main.tgz --provenance --access public` to `latest`. On a pre-existing `main@X`, verify its provenance attestation against this repo/workflow/commit: a match means this run already flipped (a recovery re-run), so skip the publish and continue; a mismatch (foreign or stale bytes this run did not build) hard-fails and you patch-forward (confirm the attestation-verify command at implementation; until confirmed, hard-fail on any pre-existing `main@X`). Then the terminal confirmation (unpinned `npm i -g agentlocks` resolves and runs `$VERSION`, wrong-version-hard-fails / still-propagating-warns). Create-GitHub-Release is a separate job (step 7), so a recovery re-run still reaches it even when this step no-ops.
7. **`release-notes` job** (`needs: flip`): create the GitHub Release idempotently (`gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1 || gh release create ...`, uploading the on-disk binaries). Splitting it from `flip` makes it recovery-safe: a re-run after a successful flip whose Release failed reaches this job even though the flip step now provenance-no-ops on the already-published `main@X`. The old two-leg `verify` job is gone (its role is the pre-flip matrix); there is no post-flip canary and no separate post-smoke, because the pre-flip matrix already proved every OS and the in-`flip` terminal confirmation is the single post-flip check.
8. **Pin npm and SHA-pin the actions in this PR** (`actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node` to commit SHAs; `npm install -g npm@latest` to a vetted pin at or above the OIDC floor and inside the package-age window), so the flip job's `id-token: write` rests on nothing mutable.
9. **Land the Windows/musl code fixes (Section 4.7) in the same change set** so the new matrix legs go green; a release whose Windows leg is red cannot flip, so the port lands with the targets, not after. Add a **`windows-unit` job** (`bun test` on `windows-latest`) and make `publish-stage` depend on it (`needs: [build, windows-unit]`), so a release cannot publish unless the Windows lock test suite passed on the tagged commit; run the same job on pull requests as a branch-protection-required check so the port does not regress between releases.
10. **Rewrite `RELEASING.md`** to the `build -> publish-stage -> verify-matrix -> flip` model: the gate is the pre-flip matrix; the recovery split is matrix-leg-fail re-run (or patch-forward for an immutable bad binary) vs post-flip rollback; recovery is a 2FA action (not tokenless); and the serialization rule (no manual `dist-tag`/publish, and no new release tag, while a run is queued or running, naming the maintainer as rollback owner).

Net: a `concurrency` block, three new platform packages plus their build targets and code fixes, a five-job graph (`build`, `publish-stage`, `verify` matrix, `flip`, `release-notes`) plus a `windows-unit` prerequisite, replacing the single job plus two-leg verify, the same guard and idempotency machinery as V1 extended to N targets, an npm pin and SHA-pinned actions, and a RELEASING.md rewrite. Kept: OIDC, `--provenance`, the environment human gate, the tag trigger, the `tag == package.json` and `bun run check` pre-publish checks, and skip-if-exists idempotency.

## 7. Is this overkill?

It is more than V1, and the extra is the point. V1's bar was "launcher wiring and the linux-x64 binary are proven pre-flip; the other three are a bounded post-flip window." V2's bar is "every shipped binary, on every supported OS including Windows and musl, is proven pre-flip," which is the bar a real cross-platform release wants. The cost is the matrix latency before the flip and the genuine Windows port work, both of which buy the removal of the post-flip exposure window, the notify-owner SLA, and the rollback-for-binary-corruption path. The token is still avoided (the tarball trick), the human gate is still one click, and every V1 safety primitive is reused. If a project only ships glibc and darwin and accepts a few-minute single-binary window, V1 is the lighter correct design; V2 is the design for shipping Windows and musl with the same "broken never reaches `latest`" guarantee the other targets get.

## 8. References

- npm unpublish policy (immutability, 72h window): https://docs.npmjs.com/policies/unpublish/
- npm dist-tag command: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/
- npm trusted publishing (OIDC; `npm publish` / `stage publish` only): https://docs.npmjs.com/trusted-publishers/
- OIDC does not cover dist-tag (open): https://github.com/npm/cli/issues/8547
- GitHub Actions concurrency `queue` (2026-05-07): https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/
- napi-rs pre-publish (fan-out, platform-first, Windows + musl): https://napi.rs/docs/cli/pre-publish
- esbuild optionalDependencies fan-out: https://github.com/evanw/esbuild/pull/1621
- Biome distribution (main + per-platform incl. win32 + musl): https://www.npmjs.com/package/@biomejs/biome
- SWC unverified-build-to-latest incident: https://github.com/swc-project/swc/issues/9043
