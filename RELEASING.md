# Releasing agentlocks

`agentlocks` ships as **one npm package carrying one ~157 KB Node bundle** (`dist/agentlocks.mjs`).
Releases are **automated**: pushing a `vX.Y.Z` tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which builds and packs the bundle,
proves it installs and runs on every target OS / libc / Node before touching `latest`, and publishes
via OIDC trusted publishing. No tokens, no OTP, one human click.

## Distribution model

agentlocks is a CLI, not a library. It ships a single Node bundle and runs under the user's own Node;
there is no embedded runtime, no per-platform binary, and no published library API.

- **`dist/agentlocks.mjs`** is the whole product: `bun build --target=node --minify` of the CLI entry
  (`scripts/build-bundle.mjs`), ~157 KB, pure JavaScript, byte-identical on every CPU architecture.
  `npm pack` builds it via the `prepack` hook, so the published tarball is ~5 files / ~59 kB.
- **The bin is the standard npm shim.** `package.json` points `bin.agentlocks` at `dist/agentlocks.mjs`
  (shebang `#!/usr/bin/env node`). `npm i -g` writes a POSIX symlink on Linux/macOS and an
  `agentlocks.cmd` cmd-shim (`node ...\dist\agentlocks.mjs %*`) on Windows. Windows is a first-class
  target served the npm way, with no `.exe`.
- **No Bun on the user's machine is required.** The one runtime need that used to force Bun — loading
  a user `agentlocks.config.ts` — is satisfied by Node's unflagged `.ts` type-stripping, which is why
  `engines.node` is `>=22.18` (the first Node release with it). A `.js`/`.mjs` config also works.

There are no `optionalDependencies` and no `agentlocks-<platform>` packages. The whole supported
surface is one package on one Node floor:

| Requirement | Value |
| --- | --- |
| Package | `agentlocks` (single bundle) |
| Node | `>=22.18` (unflagged `.ts` type-stripping) |
| OS / libc proven | Linux glibc, Linux musl (Alpine), macOS, Windows |
| CPU arch | any (the bundle is pure JS; macOS runners are arm64, Linux/Windows x64) |

## The pipeline: prove the one tarball everywhere, then flip `latest`

The key property is unchanged from the binary era, just simpler: no version whose tarball fails to
install-and-run on a supported target (or reports the wrong version) ever becomes the `latest` that
`npm i -g agentlocks` resolves.

```
on: push tags [v*];  concurrency: { group: release, cancel-in-progress: false }

windows-unit ──┐   white-box: the full lock suite (`bun test`) on windows-latest.
               │   Runs in PARALLEL with pack (both are flip barriers).
pack ──────────┤   build dist/agentlocks.mjs; guards (tag X.Y.Z shape, tag == package.json,
               │   tag on origin/main); npm pack -> main.tgz (record integrity); monotonic-version
               │   guard; upload main-tarball + ci-scripts artifacts. NO id-token.
               │
conformance    │   needs: pack. Reusable .github/workflows/conformance.yml: install main.tgz the npm
   (matrix) ───┤   way (no Bun) and run the extended lock scenario + the .ts-config contract, on
               │   {ubuntu, macos, windows} x node {22.18.0, 22.22.3, 24.16.0} + an Alpine/musl leg,
               │   asserting `agentlocks --version` == the tag. fail-fast: false. NO id-token.   <- GATE
               │
flip ──────────┘   needs: [conformance, windows-unit, pack]; OIDC; environment: release  <- human approval
   |               npm publish main.tgz -> latest (the exact proven bytes; idempotent no-op on a
   |               byte-matching pre-existing agentlocks@X, hard-fail on a mismatch); terminal
   |               confirmation that an unpinned `npm i -g agentlocks` resolves + runs X.
   |
release-notes      needs: flip. Create/update the GitHub Release (idempotent), attach main.tgz.
```

`pack` and `windows-unit` run in parallel; `conformance` and `windows-unit` are both real `needs:`
barriers in front of `flip`. A red leg leaves `latest` untouched. The flip publishes the same
`main.tgz` the conformance matrix installed, so the bytes that go live are the bytes proven on every
target.

### Conformance is the same proof CI runs

`conformance` is a reusable workflow (`.github/workflows/conformance.yml`) that **ci.yml runs on every
push and pull request** against the same freshly packed tarball. release.yml calls the identical
workflow with `assert_version` set to the tagged version. So if conformance is green in CI, the
release re-runs a byte-for-byte identical proof and additionally asserts the version — the release is
a formality over what CI already proved, not a new, unproven path.

The single ~157 KB bundle is pure JS, so the meaningful axes are **OS** (path / spawn / npm-shim
behavior), **libc** (the musl leg), and **Node minor** (unflagged `.ts` type-stripping evolves across
releases, the riskiest dimension) — **not CPU arch**. macOS runners are arm64 and Linux/Windows are
x64, so both arches execute the bundle; a separate linux-arm64 leg would re-run identical JS and is
omitted.

### Why this is tokenless

The flip is a plain `npm publish ./main.tgz --provenance` authorized by npm OIDC trusted publishing.
There is one package to publish (no platform fan-out, no preflight tag, no `optionalDependencies`
injection), so there is nothing to manipulate with `npm dist-tag` — which OIDC does not authorize. No
npm token lives in the repo or in GitHub secrets, and there is nothing to rotate.

### Concurrency

```yaml
concurrency:
  group: release              # constant: latest is a global resource, not per-ref
  cancel-in-progress: false   # never cancel an in-flight release; a cancelled mid-flip leaves latest half-updated
```

> Actions concurrency has only `group` and `cancel-in-progress`; there is no `queue:` mode (an earlier
> draft used `queue: max`, but the workflow loader rejects that key with a startup_failure, and
> `actionlint` flags it). `cancel-in-progress: false` keeps the in-flight run plus only the most
> recent pending one, so the FIFO-of-one below is a manual invariant, not a platform guarantee.

**Serialization rule (maintained by the maintainer, simke9445):** do not manually run
`npm dist-tag` or `npm publish` against `agentlocks`, and do not push a new release tag, while a
release run is queued or running. The concurrency group is `release` (constant, not per-ref), so any
two release runs are serialized globally. A monotonic-version guard inside `pack` also rejects a tag
whose version is below the already-published maximum, so a stale queued tag cannot overwrite a newer
release.

### The human approval gate

The single human approval is the `release` environment gate on the **flip** job. At approval time the
full conformance matrix and windows-unit are already green and visible in the Actions run. The flip is
the only irreversible, user-visible action (the `latest` flip). pack and conformance run before
approval; that is safe because nothing `npm i -g agentlocks` resolves changes until the flip (the
tarball is only a CI artifact, never published before approval), the early guards run inside pack, and
the publish is idempotent and skip-if-exists by integrity on a re-run.

## Cutting a release

1. Update `CHANGELOG.md`: rename the `## Unreleased` section (if present) to `## X.Y.Z`, or add a new
   `## X.Y.Z` section summarizing changes since the last tag.
2. Bump the `version` in `package.json` to `X.Y.Z`. (That is the only manifest edit — there are no
   `npm/*/package.json` files and no `optionalDependencies`.)
3. Run `bun run check`; do not proceed on red.
4. Commit to `main` and push.
5. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```
6. The pipeline runs `windows-unit` ∥ `pack` → `conformance`, then pauses on the `release` environment
   for approval.
7. When windows-unit and every conformance leg are green (visible on the Actions run page), approve the
   `flip` job from **Actions → the run → Review deployments**, or from **Settings → Environments →
   release**.
8. The workflow publishes `agentlocks@X.Y.Z` to `latest`, creates the GitHub Release with `main.tgz`
   attached, and runs a terminal propagation check.

The conformance matrix is the gate: green on all legs means `npm i -g agentlocks@X.Y.Z` installs and
runs on every supported OS / libc / Node.

## Delegating to an agent

The steps above are mechanical except for two judgment calls (which version to bump, and approving the
gate), so an agent can drive a release end to end. `AGENTS.md` routes any agent here and pins the two
rules it cannot guess: default to a PATCH bump, and never approve the `release` gate itself. So a bare
"tag a new release" is enough. Paste the prompt below when you want to be explicit or override a
default (for example, "tag a new minor release"):

```
Cut a new release of agentlocks. Bump the PATCH version (or tell me if a minor/major is warranted).
Follow RELEASING.md. Steps:

1. Version: read the current package.json version, bump it -> X.Y.Z.
2. CHANGELOG.md: if there is an "## Unreleased" section, rename it to "## X.Y.Z"; otherwise add a new
   "## X.Y.Z" section at the top and write entries summarizing changes since the last tag
   (git log $(git describe --tags --abbrev=0)..HEAD).
3. Bump the package.json "version" to X.Y.Z. That is the only manifest edit.
4. Run `bun run check`; stop and report if it is not green.
5. Commit "release: X.Y.Z", push main, then tag vX.Y.Z and push the tag.
6. STOP. Do not approve the deployment. Give me the Actions run URL so I can approve the `release`
   gate myself.
7. After I approve, watch the run; confirm every job is green and that agentlocks@X.Y.Z resolves on
   npm. If a step fails AFTER publishing, re-run the failed job (publishes are idempotent); never
   re-cut the same version, since npm versions are immutable.
```

## How publishing is authenticated (no tokens)

Publishing uses **npm OIDC trusted publishing**. The `flip` job declares `permissions: id-token: write`
and sets `registry-url: https://registry.npmjs.org` with **no** `NODE_AUTH_TOKEN`; npm (>= 11.5.1,
pinned) mints the publish credential per run and generates provenance automatically. There is no npm
token in the repo or in GitHub secrets, and nothing to rotate.

The `agentlocks` package needs one trusted-publisher entry on npmjs.com (package Settings → Trusted
Publisher → GitHub Actions) pointing at org/user `simke9445`, repo `agentlocks`, workflow
`release.yml`. The `flip` job runs in `environment: release`, so the entry's Environment field must be
either `release` or blank (blank accepts any environment; the human gate protects `latest`
independently). This is already configured — 0.7.0 published through this path.

Two things keep this working:

- **Do not rename the workflow file or the repo** without updating the trusted-publisher config to
  match: npm rejects the publish if the repo, workflow, or environment does not match.
- The `release` GitHub Environment has **required reviewers**, which is what makes a tag push pause for
  one-click approval before the flip.

## Recovery: what to do when a step fails

### A conformance leg or windows-unit fails

`latest` is untouched; the tarball was never published.

- Transient (runner flake, CDN/propagation): re-run the failed job.
- A real defect (the bundle fails to install or run on some target, or a Windows lock-core regression):
  fix the code, bump to the next patch, and cut a new release. Do not attempt to re-publish the same
  version — npm versions are immutable.

### Failure between the gate and the flip, or a re-run after a partial flip

`latest` is untouched unless the publish already happened. Re-run the flip: it no-ops if
`agentlocks@X` is already present with bytes whose integrity matches this run's packed tarball, and
hard-fails (rather than overwriting) if a foreign/different `agentlocks@X` is live. `release-notes` is a
separate idempotent job so a re-run reaches it even when the flip step no-ops.

### Post-flip rollback (functional bug found after `latest` was flipped)

This is a logged-in, 2FA maintainer action. **It is not OIDC-covered.** The tokenless guarantee covers
only the forward pipeline. Roll back only to a version whose own release was green on all targets.

1. Confirm the previous version (`$PREV`) installed and ran a real lock cycle and that its release was
   fully green.
2. Point `latest` back:
   ```bash
   npm dist-tag add agentlocks@$PREV latest
   ```
3. Deprecate the bad version:
   ```bash
   npm deprecate agentlocks@$BAD "defect in X.Y.Z; use $PREV"
   ```
4. Log the rollback (GitHub release notes, CHANGELOG) and patch forward with a fix.

Do not attempt `npm unpublish`: it is disallowed after 72 hours, breaks existing dependents, and does
not help users who already installed.

## Break-glass: manual publish (CI down)

Use this only if the automated pipeline is unavailable. It reproduces what the workflow does, from your
machine, including the OTP prompt that automation avoids. With a single bundle this is short:

1. From a green `main` already bumped to the target version:
   ```bash
   npm whoami            # confirm the right npm account
   bun run check         # do not release on red
   bun run build         # produce dist/agentlocks.mjs
   npm pack --ignore-scripts   # -> agentlocks-X.Y.Z.tgz (the exact publishable bytes)
   ```
2. **Prove the tarball on every OS you can reach before publishing** (the manual stand-in for the
   conformance gate; do not skip it). On each OS (your machine; Alpine via Docker; Windows if
   possible), with no Bun on `PATH`, install the tarball globally and run the extended scenario:
   ```bash
   PREFIX="$(mktemp -d)/al"; mkdir -p "$PREFIX"
   npm i -g --prefix "$PREFIX" ./agentlocks-X.Y.Z.tgz
   BIN="$PREFIX/bin/agentlocks"           # on Windows: "$PREFIX/agentlocks.cmd"
   "$BIN" --version                        # must print X.Y.Z
   node scripts/conformance-scenario.mjs "$BIN" extended
   node scripts/ts-config-smoke.mjs "$BIN"
   ```
3. Only once it installs and runs everywhere you can reach, publish:
   ```bash
   npm publish ./agentlocks-X.Y.Z.tgz --access public --ignore-scripts
   ```
   (Add `--otp=<code>` if prompted. There is no OIDC here; this is a logged-in publish.)
4. Confirm the live release resolves through `latest` on a clean machine with no Bun. Install
   **unpinned** so this proves the `latest` dist-tag actually moved (a pinned `@X.Y.Z` install would
   pass even if `latest` still pointed at the old release), then check the printed version is X.Y.Z:
   ```bash
   docker run --rm node:22-slim bash -lc 'npm i -g agentlocks && agentlocks --version'
   ```
   Also confirm on Alpine (musl) and Windows if possible.

Published versions are immutable: if a publish fails midway, you cannot re-publish the same version.
Bump to the next patch and re-cut.

## Troubleshooting the automated release

- **Publish step fails with an auth/permission error.** The trusted-publisher config does not match
  the run: check org/user (`simke9445`), repo (`agentlocks`), workflow filename (`release.yml`), and
  the Environment binding (`release` or blank) on the `agentlocks` package.
- **`actions/setup-node` writes an empty `_authToken=` line that shadows OIDC.** Keep `registry-url:`
  (OIDC needs it) and ensure no `NODE_AUTH_TOKEN` is set; a token switches npm to token auth and
  bypasses OIDC.
- **The run does not pause for approval.** The `release` environment lost its required reviewers.
  Re-add them in **Settings → Environments → release**.
- **A conformance leg fails on the min Node floor (22.18.0) but not the pin.** `.ts` type-stripping
  differs across Node minors; the scaffolded `agentlocks.config.ts` must load on the declared floor.
  Reproduce locally with `node scripts/ts-config-smoke.mjs` under Node 22.18.
- **A conformance leg fails on Windows with a file-operation error.** The Windows lock core (atomic
  rename-replace, liveness probes, backslash paths) has a regression. Fix the code, patch forward.
- **The flip integrity check hard-fails on a pre-existing `agentlocks@X`.** A prior run published `@X`
  with different bytes (a moved tag or a foreign publish), so its tarball integrity does not match this
  run's. Hard-fail is correct: patch forward with a new version.
- **The `release-notes` job fails after a successful flip.** `latest` is correct; only the GitHub
  Release is missing. Re-run the `release-notes` job alone (it is idempotent: `gh release view ||
  gh release create`).
