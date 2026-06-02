# Releasing agentlocks

`agentlocks` ships as a thin main package plus seven per-platform binary packages. Releases are
**automated**: pushing a `vX.Y.Z` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds all binaries, proves every target on its native OS before touching `latest`, and
publishes via OIDC trusted publishing. No tokens, no OTP, one human click.

## Distribution model

The CLI runtime needs Bun (it `import()`s the user's `agentlocks.config.ts`, and only a Bun
runtime transpiles `.ts` at import). To make `npm i -g agentlocks` work on a machine with no Bun,
the package ships compiled, Bun-embedded binaries the Biome way:

- `bin/agentlocks.mjs` is a Node launcher. It resolves the prebuilt binary for the current
  platform (`agentlocks-<platform>-<arch>`) and execs it (`.exe` on win32). With no prebuilt
  binary (an unsupported platform, or a `npm link` dev checkout) it falls back to running the
  TypeScript entry under Bun.
- The seven `agentlocks-<platform>` packages each carry one compiled binary and an
  `os`/`cpu`/`libc` gate, so npm installs only the one matching the user's machine. The `libc`
  field makes glibc and musl mutually exclusive on Linux: the right one installs on Alpine vs
  Debian automatically.
- The main package lists all seven as `optionalDependencies`, so a platform with no published
  binary still installs (and uses the Bun fallback) instead of failing the whole install.

Supported binary targets:

| Package | OS | arch | libc |
| --- | --- | --- | --- |
| agentlocks-darwin-arm64 | darwin | arm64 | |
| agentlocks-darwin-x64 | darwin | x64 | |
| agentlocks-linux-x64 | linux | x64 | glibc |
| agentlocks-linux-arm64 | linux | arm64 | glibc |
| agentlocks-linux-x64-musl | linux | x64 | musl |
| agentlocks-linux-arm64-musl | linux | arm64 | musl |
| agentlocks-win32-x64 | win32 | x64 | |

`win32-arm64` is out of scope until a Bun cross-compile target and a GitHub `windows-11-arm`
runner both exist; until then the launcher falls back to Bun or errors actionably.

## The pipeline: five jobs, every target proven before `latest`

The key property: no version in which any shipped platform binary fails to install and run on its
real OS ever becomes the `latest` that `npm i -g agentlocks` resolves.

```
build           cross-compile all 7 binaries -> artifacts
    |
publish-stage   OIDC; early guards; publish 7 platform packages (preflight tag);
    |           npm pack main -> main.tgz artifact.  Nothing npm i -g resolves yet.
    |
verify          matrix over ALL 7 targets; NO id-token    <-- THE GATE
    |           each runner: npm i -g ./main.tgz, real lock cycle, assert exit 0
    |           fail-fast: false
    |
flip            needs: verify (ALL green); OIDC; environment: release  <-- human approval
    |           npm publish main.tgz -> latest (the exact bytes the matrix proved)
    |
release-notes   needs: flip; create GitHub Release, upload binaries
```

The matrix is a real `needs:` barrier in front of the flip. A red leg leaves main unpublished
and `latest` untouched. The flip publishes the same `main.tgz` the matrix installed, so the
bytes that go live are the bytes proven on every target.

### The tarball trick (why this is tokenless)

`npm pack` produces main's exact publishable tarball. `npm i -g ./main.tgz` resolves main's
`optionalDependencies` from the registry exactly as a real install does, so each OS runner
fetches and executes its real published binary. main is never on npm during verification, so
nothing is user-visible. The flip is a plain `npm publish` of that same tarball (OIDC,
tokenless): no dist-tag manipulation, no standing secrets.

### Concurrency

```yaml
concurrency:
  group: release          # constant: latest is a global resource, not per-ref
  queue: max              # FIFO queue; do not silently drop a queued tag
  cancel-in-progress: false   # a cancelled mid-flip leaves latest half-updated
```

**Serialization rule (maintained by the maintainer, simke9445):** do not manually run
`npm dist-tag` or `npm publish` against agentlocks packages, and do not push a new release tag,
while a release run is queued or running. The concurrency group is `release` (constant, not
per-ref), so any two release runs are serialized globally. A monotonic-version guard inside
`publish-stage` also rejects a tag whose version is below the already-published maximum, so a
stale queued tag cannot overwrite a newer release.

### The human approval gate

The single human approval is the `release` environment gate on the **flip** job. At approval
time the full matrix is already green and visible in the Actions run. That is the only
irreversible action (the `latest` flip); the platform publishes that precede it are invisible to
users (the platform packages sit under a preflight tag and main is unpublished) and are
immutable and skip-if-exists safe.

## Cutting a release

1. Update `CHANGELOG.md`: rename the `## Unreleased` section (if present) to `## X.Y.Z`, or
   add a new `## X.Y.Z` section summarizing changes since the last tag.
2. Bump **only** the root `package.json` `version` to `X.Y.Z`. Do not touch `npm/*/package.json`
   files and do not add `optionalDependencies`; the workflow stamps those at publish time.
3. Run `bun run check`; do not proceed on red.
4. Commit to `main` and push.
5. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```
6. The pipeline runs: `build` -> `publish-stage` -> `verify` (matrix over all 7 targets) ->
   then pauses on the `release` environment for approval.
7. When all matrix legs are green (visible on the Actions run page), approve the `flip` job from
   **Actions -> the run -> Review deployments**, or from **Settings -> Environments -> release**.
8. The workflow publishes main to `latest`, creates the GitHub Release with binaries attached,
   and runs a terminal propagation check.

The `verify` matrix is the gate: green on all 7 means `npm i -g agentlocks@X.Y.Z` works on
every supported platform.

## Delegating to an agent

The steps above are mechanical except for two judgment calls (which version to bump, and
approving the gate), so an agent can drive a release end to end. `AGENTS.md` routes any agent
here and pins the two rules it cannot guess: default to a PATCH bump, and never approve the
`release` gate itself. So a bare "tag a new release" is enough. Paste the prompt below when you
want to be explicit or override a default (for example, "tag a new minor release"):

```
Cut a new release of agentlocks. Bump the PATCH version (or tell me if a minor/major is warranted).
Follow RELEASING.md. Steps:

1. Version: read the current root package.json version, bump it -> X.Y.Z.
2. CHANGELOG.md: if there is an "## Unreleased" section, rename it to "## X.Y.Z"; otherwise add
   a new "## X.Y.Z" section at the top and write entries summarizing changes since the last tag
   (git log $(git describe --tags --abbrev=0)..HEAD).
3. Bump ONLY the root package.json "version" to X.Y.Z. Do NOT touch the npm/*/package.json files
   and do NOT add optionalDependencies; the release workflow stamps those at publish time.
4. Run `bun run check`; stop and report if it is not green.
5. Commit "release: X.Y.Z", push main, then tag vX.Y.Z and push the tag.
6. STOP. Do not approve the deployment. Give me the Actions run URL so I can approve the `release`
   gate myself.
7. After I approve, watch the run; confirm every job is green and that agentlocks@X.Y.Z resolves
   on npm. If a step fails AFTER publishing, re-run the failed job (publishes are idempotent);
   never re-cut the same version, since npm versions are immutable.
```

## How publishing is authenticated (no tokens)

Publishing uses **npm OIDC trusted publishing**. The workflow declares
`permissions: id-token: write` on the jobs that publish; npm mints the publish credential per-run
and generates provenance automatically. There is no npm token in the repo or in GitHub secrets,
and nothing to rotate.

The environment split matters for trusted-publisher configuration on npmjs.com:

- **Platform packages** publish in `publish-stage` (no `environment:` constraint). Their
  trusted-publisher configs must NOT require `environment: release`, or the OIDC exchange fails
  there.
- **Main** publishes in `flip` (bound to `environment: release`). Its trusted-publisher config
  is bound to `environment: release`.

Two things keep this working:

- **Do not rename the workflow file or the repo** without updating all trusted-publisher configs
  to match: npm rejects the publish if the repo, workflow, or environment does not match.
- The `release` GitHub Environment has **required reviewers**, which is what makes a tag push
  pause for one-click approval before the flip.

### Adding a new platform package

A brand-new package name cannot use trusted publishing for its **first** publish: npm only lets
you configure a trusted publisher on a package that already exists. Bootstrap it once with a
manual token/OTP publish, then add its trusted-publisher config and let the workflow take over.

Three packages needed this bootstrap when Windows and musl targets were added:
`agentlocks-win32-x64`, `agentlocks-linux-x64-musl`, `agentlocks-linux-arm64-musl`. Those are
done. Any future new platform package follows the same pattern.

## Why optionalDependencies are not committed

The root `package.json` in the repo has **no** `optionalDependencies`. The release workflow
injects them right before publishing main, after the platform packages are live, and discards the
edit (they are never committed).

This is deliberate. Declaring a dependency on a version that is not on npm yet breaks
`bun install --frozen-lockfile` for everyone, because the lockfile cannot resolve. Injecting them
at publish time keeps a plain checkout always resolvable, while the published main tarball carries
the correct platform deps for end users.

## Recovery: what to do when a step fails

### A matrix leg fails (binary does not install or run on its OS)

`latest` is untouched; main was never published.

- If the failure is a transient CI issue (runner flake, CDN propagation): re-run the failed job.
  `publish-stage` is skip-if-exists idempotent, so a re-run safely replays it.
- If the failure is a defect in an already-published platform binary: the bytes are immutable
  (npm versions cannot be overwritten). Patch forward: fix the code, bump to the next patch, and
  cut a new release. Do not attempt to re-publish the same version.

### Failure between the matrix and the flip

`latest` is untouched. Re-run: `publish-stage` skips an existing platform publish when its bytes
match (a content-integrity check, not just version presence), and the flip no-ops if `main@X` is
already present with bytes whose integrity matches this run's packed tarball. A foreign or different
`main@X` hard-fails instead of overwriting.

### Post-flip rollback (functional bug found after `latest` was flipped)

This is a logged-in, 2FA maintainer action. **It is not OIDC-covered.** The tokenless guarantee
covers only the forward pipeline.

1. Verify that the previous version (`$PREV`) installed and ran a real lock cycle (Bun fallback
   off) and that its release matrix was green on all targets.
2. Point `latest` back:
   ```bash
   npm dist-tag add agentlocks@$PREV latest
   ```
3. Deprecate the bad version:
   ```bash
   npm deprecate agentlocks@$BAD "defect in X.Y.Z; use $PREV"
   ```
4. Log the rollback (GitHub release notes, CHANGELOG) and patch forward with a fix.

Do not attempt `npm unpublish`: it is disallowed after 72 hours, breaks existing dependents, and
does not help users who already installed.

## Break-glass: manual publish (CI down)

Use this only if the automated pipeline is unavailable. It reproduces what the workflow does, from
your machine, including the OTP prompts that automation avoids.

1. From a green `main` already bumped to the target version:
   ```bash
   npm whoami            # confirm the right npm account
   bun run check         # do not release on red
   bun run build:binaries
   ```
This path bypasses the automated pre-flip matrix, so it mirrors the V2 ordering by hand: publish
the platform packages under the `preflight` tag, verify every target you can reach, and only then
publish main. Use it only when the workflow is unavailable. It is **reduced assurance**: it does not
run the workflow's automated local-pack-vs-registry `dist.integrity` equality checks, so the manual
per-target verification in step 3 is what stands in for the gate. Do not skip it.

2. Publish the seven platform packages **first, under the `preflight` tag** so an unverified `@X`
   is never what `npm i agentlocks-<plat>` resolves (main pins them by exact version, so the fanout
   still resolves):
   ```bash
   for d in darwin-arm64 darwin-x64 linux-x64 linux-arm64 \
             linux-x64-musl linux-arm64-musl win32-x64; do
     ( cd "npm/$d" && npm pkg set "version=X.Y.Z" \
       && npm publish --access public --tag preflight --ignore-scripts )
   done
   ```
   With 2FA-on-publish, one fresh OTP usually covers the burst (npm caches the session); add
   `--otp=<code>` to the first, and to any that still report `EOTP`. This is also the one-time
   bootstrap path for a brand-new platform package (which cannot use trusted publishing for its
   first publish).
3. Inject `optionalDependencies`, pack main, and **verify every target you can reach before
   publishing main** (the manual stand-in for the pre-flip matrix; do not skip it):
   ```bash
   npm pkg set \
     optionalDependencies.agentlocks-darwin-arm64=X.Y.Z \
     optionalDependencies.agentlocks-darwin-x64=X.Y.Z \
     optionalDependencies.agentlocks-linux-x64=X.Y.Z \
     optionalDependencies.agentlocks-linux-arm64=X.Y.Z \
     optionalDependencies.agentlocks-linux-x64-musl=X.Y.Z \
     optionalDependencies.agentlocks-linux-arm64-musl=X.Y.Z \
     optionalDependencies.agentlocks-win32-x64=X.Y.Z
   npm pack --ignore-scripts                       # -> agentlocks-X.Y.Z.tgz
   # On each OS you can reach (your machine; Alpine via Docker; Windows if possible), Bun off:
   AGENTLOCKS_DISABLE_BUN_FALLBACK=1 npm i -g ./agentlocks-X.Y.Z.tgz && agentlocks --version
   ```
4. Only once those install and run, publish main and discard the local edit:
   ```bash
   npm publish ./agentlocks-X.Y.Z.tgz --access public --ignore-scripts
   git checkout -- package.json   # optionalDependencies are never committed
   ```
5. Confirm the live release resolves through `latest` on a clean machine with no Bun:
   ```bash
   docker run --rm node:22-slim bash -lc \
     'npm i -g agentlocks@X.Y.Z && agentlocks --version'
   ```
   Also confirm on Alpine (musl) and Windows if possible.

Published versions are immutable: if a publish fails midway, you cannot re-publish the same
version. Bump to the next patch and re-cut.

## Troubleshooting the automated release

- **Publish step fails with an auth/permission error.** The trusted-publisher config does not
  match the run: check org/user (`simke9445`), repo (`agentlocks`), workflow filename
  (`release.yml`), and environment binding (platform packages: no environment; main: `release`)
  on the failing package.
- **First publish of a new package fails with auth error mentioning a token.** The package does
  not exist yet on npm, so trusted publishing cannot be configured on it. Do the one-time manual
  bootstrap publish (see "Adding a new platform package" above), add the trusted-publisher config
  on npmjs.com, then re-run.
- **`actions/setup-node` writes an empty `_authToken=` line that shadows OIDC.** Remove the
  `registry-url:` line from the Set up Node step and re-run.
- **The run does not pause for approval.** The `release` environment lost its required reviewers.
  Re-add them in **Settings -> Environments -> release**.
- **A `verify` matrix leg cannot find the new platform package version.** Registry propagation
  lag: the leg retries across a bounded window. If it still fails after retries, confirm the
  `publish-stage` step actually succeeded for that package.
- **A `verify` leg fails on Windows with a file-operation error.** The Windows lock core
  (atomic rename-replace, liveness probes) has a regression. Fix the code, patch forward.
- **The flip `integrity-match` check hard-fails on a pre-existing `main@X`.** A prior run
  published `main@X` with different bytes (a moved tag or a foreign publish), so its tarball
  integrity does not match this run's. Hard-fail is correct: patch forward with a new version.
- **The `release-notes` job fails after a successful flip.** `latest` is correct; only the
  GitHub Release is missing. Re-run the `release-notes` job alone (it is idempotent:
  `gh release view || gh release create`).
