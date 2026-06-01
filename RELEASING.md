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
git switch launch-polish              # release from the polish branch
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

npm prompts for a 2FA OTP per publish if your account has 2FA on. After the last one, give npm a
moment to propagate the new versions through its index (about 30 seconds) before the next step, or
`bun install` may not see them yet.

## 3. Wire optionalDependencies into the main package and refresh the lockfile

Add the block to `package.json` (substitute the real version):

```json
  "optionalDependencies": {
    "agentlocks-darwin-arm64": "X.Y.Z",
    "agentlocks-darwin-x64": "X.Y.Z",
    "agentlocks-linux-x64": "X.Y.Z",
    "agentlocks-linux-arm64": "X.Y.Z"
  },
```

Then resolve and lock against the now-published packages:

```bash
bun install                           # updates bun.lock; succeeds only because step 2 published them
git add package.json bun.lock
git commit -m "release: wire optionalDependencies for X.Y.Z"
```

## 4. Publish the main package

```bash
npm publish --access public           # publishConfig.access is already public
```

## 5. Verify on a clean machine with no Bun

This is the real gate for the whole install story. Run it somewhere Bun is not installed (a fresh
container is easiest) so a green result proves the prebuilt binary, not a stray system Bun, did the
work:

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
git push origin launch-polish
git push origin vX.Y.Z
```

Then open a PR to merge `launch-polish` into `main` (or merge it), so the released tree, including
the committed `optionalDependencies` and lockfile, lands on the default branch.

## If something goes wrong

- **A platform publish fails midway.** The already-published platform packages are immutable at
  that version; you cannot republish the same version. If you must re-cut, bump to the next patch
  and run the whole sequence again.
- **`bun install` in step 3 cannot resolve a platform package.** The index has not propagated yet,
  or that package failed to publish in step 2. Re-check `npm view agentlocks-<platform> version`,
  wait, and retry.
- **Clean-machine install pulls no binary.** Confirm the platform package's `os`/`cpu`/`libc` gate
  matches the target, and that the version in `optionalDependencies` matches what you published.
