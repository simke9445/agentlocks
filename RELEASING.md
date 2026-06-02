# Releasing agentlocks

`agentlocks` ships as a thin main package plus four per-platform binary packages. Releases are
**automated**: pushing a `vX.Y.Z` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds the binaries and publishes all five packages to npm via OIDC trusted publishing — no
tokens, no OTP.

## Distribution model

The CLI runtime needs Bun (it `import()`s the user's `agentlocks.config.ts`, and only a Bun runtime
transpiles `.ts` at import). To make `npm i -g agentlocks` work on a machine with no Bun, the package
ships compiled, Bun-embedded binaries the Biome way:

- `bin/agentlocks.mjs` is a Node launcher. It resolves the prebuilt binary for the current platform
  (`agentlocks-<platform>-<arch>`) and execs it. With no prebuilt binary (an unsupported platform, or
  a `npm link` dev checkout) it falls back to running the TypeScript entry under Bun.
- The four `agentlocks-<platform>` packages each carry one compiled binary and an `os`/`cpu`/`libc`
  gate, so npm installs only the one matching the user's machine.
- The main package lists those four as `optionalDependencies`, so a platform with no published binary
  still installs (and uses the Bun fallback) instead of failing the whole install.

Supported binary targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Windows and
linux-musl have no prebuilt binary yet and use the Bun fallback.

## Cutting a release

1. Update `CHANGELOG.md` with the entry for the new version.
2. Bump **only** the root `package.json` `version` to `X.Y.Z`. The workflow stamps the four
   `npm/*/package.json` versions from the tag, so you don't touch them.
3. Commit to `main` and push.
4. Tag and push the tag — this is the trigger:
   ```bash
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```
5. The run pauses on the `release` environment for approval. Approve it from the Actions run page (or
   the repo's **Settings → Environments → release**). The workflow then verifies, builds the four
   binaries, publishes the platform packages, wires `optionalDependencies` into the main package,
   publishes it, creates the GitHub Release with the binaries attached, and runs a clean-room install
   check on Linux + macOS.

The `verify` job is the real gate: green means `npm i -g agentlocks@X.Y.Z` works on a machine with no
Bun.

## Delegating to an agent

The steps above are mechanical except for two judgment calls (which version to bump, and approving
the gate), so an agent can drive a release end to end. `AGENTS.md` routes any agent here and pins the
two rules it cannot guess: default to a PATCH bump, and never approve the `release` gate itself. So a
bare "tag a new release" is enough. Paste the prompt below when you want to be explicit or override a
default (for example, "tag a new minor release"):

```
Cut a new release of agentlocks. Bump the PATCH version (or tell me if a minor/major is warranted).
Follow RELEASING.md. Steps:

1. Version: read the current root package.json version, bump it -> X.Y.Z.
2. CHANGELOG.md: if there is an "## Unreleased" section, rename it to "## X.Y.Z"; otherwise add a new
   "## X.Y.Z" section at the top and write entries summarizing changes since the last tag
   (git log $(git describe --tags --abbrev=0)..HEAD).
3. Bump ONLY the root package.json "version" to X.Y.Z. Do NOT touch the npm/*/package.json files and
   do NOT add optionalDependencies; the release workflow stamps those at publish time.
4. Run `bun run check`; stop and report if it is not green.
5. Commit "release: X.Y.Z", push main, then tag vX.Y.Z and push the tag.
6. STOP. Do not approve the deployment. Give me the Actions run URL so I can approve the `release`
   gate myself.
7. After I approve, watch the run; confirm every job is green and that agentlocks@X.Y.Z resolves on
   npm. If a step fails AFTER publishing, re-run the failed job (publishes are idempotent); never
   re-cut the same version, since npm versions are immutable.
```

## How publishing is authenticated (no tokens)

Publishing uses **npm OIDC trusted publishing**. Each of the five packages has a trusted publisher
configured on npmjs.com (package → **Settings → Trusted Publisher → GitHub Actions**) pointing at
`simke9445/agentlocks`, workflow `release.yml`, environment `release`. The workflow declares
`permissions: id-token: write`; npm mints the publish credential per-run and generates provenance
automatically. There is no npm token in the repo or in GitHub secrets, and nothing to rotate.

Two things keep this working:

- **Don't rename the workflow file or the repo** without updating all five trusted-publisher configs
  to match — otherwise npm rejects the publish.
- The `release` GitHub Environment has **required reviewers**, which is what makes a tag push pause
  for one-click approval before anything publishes.

### Adding a new platform package later

A brand-new package name (e.g. `agentlocks-win32-x64`) can't use trusted publishing for its **first**
publish — npm only lets you configure a trusted publisher on a package that already exists. Bootstrap
it once with a manual token/OTP publish (or `npx setup-npm-trusted-publish <name>`), then add its
trusted-publisher config and let the workflow take over for every release after.

## Why optionalDependencies aren't committed

The root `package.json` in the repo has **no** `optionalDependencies`. The release workflow injects
them right before it publishes the main package, after the platform packages are live (and discards
the edit — they're never committed).

This is deliberate. Declaring a dependency on a version that isn't on npm yet breaks
`bun install --frozen-lockfile` for everyone, because the lockfile can't resolve. Committing them
would force a chicken-and-egg lockfile regeneration every release. Injecting them at publish time
keeps a plain checkout always resolvable, while the published main tarball still carries the correct
platform deps for end users.

## Break-glass: manual publish

Use this only if CI is down. It reproduces what the workflow does, from your machine — including the
OTP prompts that automation exists to avoid.

1. From a green `main` already bumped to the target version:
   ```bash
   npm whoami            # confirm the right npm account
   bun run check         # do not release on red
   bun run build:binaries
   ```
2. Publish the four platform packages **first**, stamping the version:
   ```bash
   for d in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
     ( cd "npm/$d" && npm pkg set "version=X.Y.Z" && npm publish --access public )
   done
   ```
   With 2FA-on-publish, one fresh OTP usually covers the burst (npm caches the session); add
   `--otp=<code>` to the first, and to any that still report `EOTP`.
3. Inject `optionalDependencies`, publish main, then discard the local edit:
   ```bash
   npm pkg set \
     optionalDependencies.agentlocks-darwin-arm64=X.Y.Z \
     optionalDependencies.agentlocks-darwin-x64=X.Y.Z \
     optionalDependencies.agentlocks-linux-x64=X.Y.Z \
     optionalDependencies.agentlocks-linux-arm64=X.Y.Z
   npm publish --access public
   git checkout -- package.json   # optionalDependencies are never committed
   ```
4. Verify on a clean machine with no Bun:
   ```bash
   docker run --rm node:18-slim bash -lc \
     'npm i -g agentlocks@X.Y.Z && agentlocks --version && agentlocks --help | head'
   ```

Published versions are immutable: if a publish fails midway, you cannot re-publish the same version —
bump to the next patch and re-cut.

## Troubleshooting the automated release

- **Publish step fails with an auth/permission error.** The trusted-publisher config doesn't match
  the run: check org/user (`simke9445`), repo (`agentlocks`), workflow filename (`release.yml`), and
  environment (`release`) on the failing package. The workflow already upgrades npm to ≥ 11.5.1.
- **First publish auth error mentioning a token.** `actions/setup-node` writes an empty
  `_authToken=` line into `.npmrc` that can shadow OIDC. Remove the `registry-url:` line from the
  Set up Node step and re-run.
- **The run doesn't pause for approval.** The `release` environment lost its required reviewers —
  re-add them in **Settings → Environments → release**.
- **`verify` job can't find the new version.** Registry propagation lag; the job already retries six
  times. If it still fails, confirm the platform publish step actually succeeded.
