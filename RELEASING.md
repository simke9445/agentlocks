# Releasing agentlocks

This is the maintainer runbook for cutting a release to npm. `agentlocks` ships as a thin
main package plus four per-platform binary packages, so the publish has an ordering constraint
the rest of this doc exists to get right.

## Distribution model

The CLI runtime needs Bun (it `import()`s the user's `agentlocks.config.ts`, and only a Bun
runtime transpiles `.ts` at import). To make `npm i -g agentlocks` work on a machine with no Bun,
the package ships compiled, Bun-embedded binaries the Biome way:

- `bin/agentlocks.mjs` is a Node launcher. It resolves the prebuilt binary for the current
  platform (`agentlocks-<platform>-<arch>`) and execs it. With no prebuilt binary (an unsupported
  platform, or a `npm link` dev checkout) it falls back to running the TypeScript entry under Bun.
- The four `agentlocks-<platform>` packages each carry one compiled binary and an `os`/`cpu`/`libc`
  gate, so npm installs only the one matching the user's machine.
- The main package lists those four as `optionalDependencies`, so a platform with no published
  binary still installs (and uses the Bun fallback) instead of failing the whole install.

Supported binary targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Windows and
linux-musl have no prebuilt binary yet and use the Bun fallback.

## Why the platform packages publish first

`optionalDependencies` is wired in **at release time, not committed between releases**. Declaring a
dependency on a version that is not yet on npm breaks `bun install --frozen-lockfile` (and therefore
CI) for everyone, because the lockfile cannot resolve. So the in-repo `package.json` has no
`optionalDependencies`; they are added during the publish, after the platform packages exist on npm,
and committed together with the updated `bun.lock` so the pushed tree resolves cleanly.

The order below is the whole point: **publish the four platform packages, then wire and publish the
main package.**

## Pre-flight

```bash
git switch main                       # release from main (or a dedicated release branch)
bun run check                         # 138+ pass, typecheck + lint clean — do not release on red
npm whoami                            # confirm you are logged in to the right npm account
```

Confirm all five `package.json` files already carry the target version (the bump is committed
ahead of the publish):

```bash
grep '"version"' package.json npm/*/package.json
# main + the four platform packages must all read the same X.Y.Z
```

Confirm `CHANGELOG.md` has the entry for this version.

## 1. Build the binaries

```bash
bun run build:binaries                # compiles all four targets into npm/<platform>/bin/
file npm/*/bin/agentlocks             # sanity-check each arch (Mach-O arm64/x86_64, ELF aarch64/x86-64)
./npm/$(uname -m | sed 's/x86_64/darwin-x64/;s/arm64/darwin-arm64/')/bin/agentlocks --version
```

The binaries live under `npm/*/bin/`, which is gitignored. They are build artifacts, rebuilt fresh
here and shipped by `npm publish` from each platform directory (each platform package's
`files: ["bin/"]`). They are never committed.

## 2. Publish the four platform packages

```bash
for d in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  ( cd "npm/$d" && npm publish --access public )
done
```

If your account has 2FA-on-publish, npm asks for a one-time password each publish. One fresh code
usually covers the whole burst, because npm caches the validated session: pass `--otp=<code>` on the
first publish and the rest ride it (add a fresh `--otp` to any that still report `EOTP`). After the
last publish, give npm about 30 seconds to propagate the new versions before the next step.

## 3. Wire optionalDependencies into the main package and refresh the lockfile

Add the four platform packages to `package.json` (`npm pkg set` edits it without hand-editing JSON):

```bash
npm pkg set \
  optionalDependencies.agentlocks-darwin-arm64=X.Y.Z \
  optionalDependencies.agentlocks-darwin-x64=X.Y.Z \
  optionalDependencies.agentlocks-linux-x64=X.Y.Z \
  optionalDependencies.agentlocks-linux-arm64=X.Y.Z
```

The lockfile now needs resolved entries for those packages, but **do not run `bun install` on the
host**: the host enforces a 7-day package `min-release-age` (a supply-chain defense), so it refuses
the packages you published minutes ago and would write an incomplete lockfile. Generate the complete
`bun.lock` inside a container that has no age rule, seeded with the previous lockfile so only the four
new entries change, and bring back only the lockfile (`oven/bun` tag = the `packageManager` version in
`package.json`):

```bash
mkdir -p /tmp/lockgen
cp package.json /tmp/lockgen/package.json        # new package.json (with optionalDependencies)
git show HEAD:bun.lock > /tmp/lockgen/bun.lock   # previous lockfile (without them)
docker run --rm -v /tmp/lockgen:/in:ro oven/bun:1.3.13 bash -c '
  set -e; mkdir -p /w && cd /w
  cp /in/package.json .; cp /in/bun.lock .
  bun install >/dev/null 2>&1
  cat bun.lock
' > bun.lock
```

Verify, still in a container, that frozen-install is consistent (this is what CI runs) and the
published binary executes:

```bash
mkdir -p /tmp/lockverify && cp package.json bun.lock /tmp/lockverify/
docker run --rm -v /tmp/lockverify:/in:ro oven/bun:1.3.13 bash -c '
  set -e; mkdir -p /w && cd /w; cp /in/package.json .; cp /in/bun.lock .
  bun install --frozen-lockfile
  node_modules/agentlocks-linux-*/bin/agentlocks --version
'
```

Then commit the wiring:

```bash
git add package.json bun.lock
git commit -m "release: wire optionalDependencies for X.Y.Z"
```

Never weaken the host's `min-release-age` rule to install your own fresh release. The container is
isolated, so installing a sub-7-day package there is safe; only the inert lockfile returns to the host.

## 4. Publish the main package

```bash
npm publish --access public           # publishConfig.access is already public
```

## 5. Verify on a clean machine with no Bun

This is the real gate for the whole install story. Run it in a fresh container: it has no Bun (so a
green result proves the prebuilt binary, not a stray system Bun, did the work) and no `min-release-age`
rule (so it can install the release you published minutes ago, which the host refuses for 7 days):

```bash
docker run --rm node:18-slim bash -lc \
  'npm i -g agentlocks@X.Y.Z && command -v bun || echo "no bun present"; agentlocks --version && agentlocks --help | head'
```

Expect: install succeeds, `bun` is absent, `agentlocks --version` prints `X.Y.Z`, help renders. That
exercises the `linux-x64` binary through the Node launcher. For full coverage repeat on
`arm64v8/node:18-slim` (linux-arm64) and a real macOS box (darwin).

## 6. Tag and push

```bash
git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin main
git push origin vX.Y.Z
```

If you cut the release on a separate branch instead of `main`, merge it into `main` now so the
released tree, including the committed `optionalDependencies` and lockfile, lands on the default branch.

## If something goes wrong

- **A platform publish fails midway.** The already-published platform packages are immutable at
  that version; you cannot republish the same version. If you must re-cut, bump to the next patch
  and run the whole sequence again.
- **`bun install` in step 3 cannot resolve a platform package.** The index has not propagated yet,
  or that package failed to publish in step 2. Re-check `npm view agentlocks-<platform> version`,
  wait, and retry.
- **Clean-machine install pulls no binary.** Confirm the platform package's `os`/`cpu`/`libc` gate
  matches the target, and that the version in `optionalDependencies` matches what you published.
