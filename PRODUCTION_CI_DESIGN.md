# Production release pipeline for agentlocks

## 1. TL;DR

**Safety property:** a build with broken launcher wiring or a broken `linux-x64` binary never becomes the `latest` that `npm i -g agentlocks` resolves. Those are proven before the flip. One narrow gap stays open by choice (see below).

The current flow can't honor that. Every `npm publish` in the `release` job lands on `latest` the instant it runs, and the `verify` job runs *after* (`needs: release`). npm versions are immutable, so by the time verify reports a problem the broken version is already what users install. Verify is a smoke detector bolted on after the fire.

The fix keeps **uploaded** separate from **user-visible** by holding main off npm until it's proven:

1. Publish the **four platform packages** to npm. Not user-visible yet: no published `agentlocks` main points at this version, and they're resolved by exact version, never by their own `latest`.
2. **Verify before publishing main.** `npm pack` main and install that tarball; it pulls the just-published platform binaries from the registry, exercising the real launcher resolving the real binary, with the Bun fallback off so a missing or broken binary fails loudly. main isn't on npm yet, so a failure here is invisible to users.
3. **Flip:** `npm publish` main to `latest`, once, only after the gate passes. This is the single user-visible action and a plain `npm publish` the existing OIDC credential authorizes, with no token.

The flip is cheap and tokenless because **main's `latest` is the only user-visible switch** (Section 4.1); everything before it is retryable staging no default install can see.

**The one gap, stated up front.** The gate runs on the publish runner (`linux-x64`), so it executes only one of four binaries. A corrupt `darwin-arm64`, `darwin-x64`, or `linux-arm64` binary (or a bad manifest) passes the gate and is `latest` for the flip-to-canary window, caught by the post-flip canary (Section 4.4). That window is a real control only because the canary's **notify-on-failure is mandatory** and the roll-back is owned: the release maintainer (the approver who clicked the environment gate) begins the Section 5 roll-back within 30 minutes of the page. A watch-the-canary-manually arrangement bounds the window by when someone happens to look, i.e. not at all; adopt it only by also accepting an unbounded window and dropping the single-digit-minutes claim. Closing the gap pre-flip means gating the four-target matrix on the flip, which the tokenless design defers to npm Staged Publishing (Section 4.3).

**One more conditional, not buried.** The release job holds `id-token: write` and the third-party actions (`actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node`) aren't SHA-pinned yet, and it runs `npm install -g npm@latest` (`release.yml` line 42). Until those are pinned (Section 6), a compromised floating action or npm release landing *after* the human approval could publish bad bytes to `latest`, bypassing every in-repo gate. The guarantee is conditional on those un-pins until the near-term follow-up lands.

One operating rule falls out of all this: **never re-cut a version.** A failure before the flip is fixed by re-running; a bug found after the flip is fixed by patch-forward to the next version plus a `latest` roll-back and `npm deprecate` (Section 5).

## 2. How npm releases actually work (the facts that constrain everything)

**Versions are immutable.** Once `agentlocks@0.6.3` is published, those bytes are that version forever; there is no overwrite. `npm unpublish` is allowed only within 72 hours under restrictive conditions, breaks existing dependents, and doesn't help anyone who already installed. Treat every publish as permanent. ([unpublish policy](https://docs.npmjs.com/policies/unpublish/))

**Dist-tags are the only mutable pointer.** `latest` names one version; `npm i -g agentlocks` resolves whatever `latest` points at now. Moving it (`npm dist-tag add pkg@X latest`) is an instant, reversible metadata flip. An exact request (`npm i agentlocks@0.6.3`) resolves regardless of any tag, which is what lets a gate install a not-yet-`latest` version. ([dist-tag docs](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/))

**So verify-after-publish is a detector, not a gate.** If publish goes straight to `latest`, verify can only say "fine" or "the immutable bad version is already live." A gate has to sit *between* upload and the `latest` flip; for agentlocks the seam is main itself.

**OIDC draws a line across operations.** Trusted publishing authorizes `npm publish` and `npm stage publish`; it does **not** cover `npm dist-tag add` ([npm/cli#8547](https://github.com/npm/cli/issues/8547), open) or `npm stage approve` (proof-of-presence 2FA). This is why the promote is a `npm publish`, not a dist-tag flip, and why a fully unattended flip can't lean on staged-publishing approve today (Section 4.3).

## 3. How real analogs do it

agentlocks is a Biome-style fan-out (a thin main package plus per-platform binary packages gated by `os`/`cpu`/`libc`). The question is how comparable projects keep a half-built fan-out from going live.

- **napi-rs** is the closest match: main + per-platform `optionalDependencies`, published together, platform packages first. agentlocks already uses this mechanism. ([pre-publish](https://napi.rs/docs/cli/pre-publish))
- **esbuild** pioneered the `optionalDependencies` fan-out and the disabled-optional-deps failure mode the launcher fallback covers. ([PR #1621](https://github.com/evanw/esbuild/pull/1621))
- **Biome** ships the exact distribution agentlocks copies: main plus `@biomejs/cli-<platform>` pinned by exact version, resolved by a launcher. ([npm](https://www.npmjs.com/package/@biomejs/biome))
- **SWC** is the cautionary tale and the reason for this redesign: a nightly went out as `latest` and broke installs for everyone; the fix was to stop publishing unverified builds to `latest`. ([#9043](https://github.com/swc-project/swc/issues/9043))
- **General practice** for pre-release-then-promote is to stage under a non-`latest` tag and move `latest` only after validation (the semantic-release / changesets shape).

The fan-out mechanism is well-trodden and agentlocks implements it correctly. The gap is purely the missing stage-verify-promote split.

## 4. The proposed pipeline

### 4.1 Why main's `latest` is the only flip

`npm i -g agentlocks` resolves main's `latest`, then installs the platform binaries main **pins by exact version** in `optionalDependencies` (injected at publish, `release.yml` lines 94-98); the launcher (`bin/agentlocks.mjs:26`) does `require.resolve("agentlocks-<platform>/bin/agentlocks")` against that exact pin and never reads a platform package's dist-tag. So:

- Main's `latest` is the single user-visible switch; platform dist-tags are never read by a default install.
- A platform package at version `V` is a prerequisite for `agentlocks@V` to install, but publishing them does nothing visible until a `latest` main points at `V`.
- The whole design reduces to: **don't make `agentlocks@V` the `latest` main until the gate is green.**

Resolution is by exact version *after* npm's `os`/`cpu`/`libc` filter. The two linux packages carry `"libc": ["glibc"]`; the two darwin packages omit it (libc is a macOS no-op). On musl the glibc binaries are filtered out and the launcher falls back to Bun, by design. **The guarantee is scoped to the four prebuilt glibc/darwin targets; musl and Windows are fallback-only and out of scope**, since no runner exercises them. A publish-time manifest guard (Section 4.4, Section 6 step 9) asserts each linux manifest still carries `libc`, so a future edit can't ship a glibc binary onto musl.

### 4.2 Job graph

```
tag push (v*)
   |
   v
release  (environment: release, OIDC, ONE human approval) ─────► canary
   guards: tag on origin/main, shape X.Y.Z, monotonic version       (needs: release,
   build 4 binaries                                                  if: always() &&
   publish 4 platform packages -> latest (skip-if-exists)            needs.release.outputs
   pack main + inject & assert exact deps                              .flipped == 'true',
   IN-JOB GATE: install packed main vs published binaries,           4-target matrix,
     Bun fallback OFF, real acquire/release lock cycle               permissions: {},
   FLIP: npm publish main -> latest    (last irreversible action)    executes all 4 once,
   emit flipped=true output  (gates the canary)                      mandatory notify)
   create GitHub Release  (binaries already on disk)
   terminal check: unpinned install resolves+runs VERSION
```

**One gated job plus one post-flip canary.** Platform packages go up first; main is built and verified against them while still unpublished, so nothing a default install can resolve exists yet. Only after the gate passes does main publish, once, to `latest`. That publish is the flip and the **last irreversible action**; the two steps after it (Create-Release, terminal check) are reversible bookkeeping and don't touch `latest` again. Within one job, step order is as strong a fence as a `needs:` edge.

This stays **100% tokenless**: the flip is a plain `npm publish` OIDC authorizes, so there's no dist-tag move and no granular `latest`-moving token in GitHub secrets (the alternative is Section 4.3). Main never exists on npm until verified, which is the only way immutability lets you keep a broken main out of `latest`.

**Gating the canary correctly is subtle and load-bearing.** Because the post-flip steps can fail on benign CDN lag (or a hard `got_wrong` terminal check reds the job), the flip step emits a `flipped=true` output *the instant it succeeds*, and the canary keys on that, not on the whole job. Two wiring details, both easy to omit: the flip step needs `id: flip` and the `release` job's `outputs:` map must declare `flipped: ${{ steps.flip.outputs.flipped }}` (or `needs.release.outputs.flipped` is empty and the canary never runs); and the canary's gate must be `if: ${{ always() && needs.release.outputs.flipped == 'true' }}`. The `always()` is required because GitHub Actions implicitly ANDs a plain `if:` with `success()`, so a post-flip job failure would otherwise skip the canary exactly when the three non-linux binaries are live and unproven.

### 4.3 The staging, gate, and flip

Platform packages publish straight to `latest` (no `--tag`); they're pulled by exact version, so their `latest` is never read and staging them would buy nothing. Only main's publish is gated, by withholding it until the gate is green.

```bash
# stage platform packages -> latest. skip-if-exists only (a bun build --compile binary is NOT
# byte-reproducible, so a fresh-pack-vs-published shasum test would hard-fail every honest re-run).
for d in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  pkg="agentlocks-$d"; ( cd "npm/$d" && npm pkg set "version=$VERSION" )
  if [ "$(npm view "$pkg@$VERSION" version --prefer-online 2>/dev/null)" = "$VERSION" ]; then
    echo "$pkg@$VERSION already published (immutable), skipping"
  else ( cd "npm/$d" && npm publish --provenance --access public ); fi
done

# inject exact pins, then assert the SET is exactly the 4 expected names at exactly $VERSION
npm pkg set optionalDependencies.agentlocks-darwin-arm64=$VERSION \
  optionalDependencies.agentlocks-darwin-x64=$VERSION \
  optionalDependencies.agentlocks-linux-x64=$VERSION \
  optionalDependencies.agentlocks-linux-arm64=$VERSION
VERSION="$VERSION" node -e '
  const want=["agentlocks-darwin-arm64","agentlocks-darwin-x64","agentlocks-linux-x64","agentlocks-linux-arm64"];
  const V=process.env.VERSION, d=require("./package.json").optionalDependencies||{}, have=Object.keys(d);
  const extra=have.filter(k=>!want.includes(k)), missing=want.filter(k=>!have.includes(k));
  if(extra.length||missing.length){console.error("set mismatch extra="+extra+" missing="+missing);process.exit(1);}
  for(const k of want) if(d[k]!==V||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(d[k])){console.error("non-exact pin "+k+"="+d[k]);process.exit(1);} '

# IN-JOB GATE: verify main BEFORE publishing it, against the published binaries (linux-x64 only here).
TARBALL="$(npm pack --silent)"; ok=; GATE="$RUNNER_TEMP/gate"
for i in $(seq 1 24); do
  rm -rf "$GATE"
  # three independently-propagating states: packument-not-listed -> lag; listed-but-fetch-fails ->
  # tarball still propagating; install-ok-but-binary-fails -> broken (hard-fail). --prefer-online on
  # every attempt busts npm's negative-packument cache; npm_config_omit= --include=optional makes the
  # gate install optional deps exactly as a default user does, even if a runner .npmrc sets omit=optional.
  if [ "$(npm view "agentlocks-linux-x64@$VERSION" version --prefer-online 2>/dev/null)" != "$VERSION" ]; then
    echo "linux-x64@$VERSION not propagated, retry $i/24"; sleep 15; continue; fi
  if npm_config_omit= npm install -g --prefix "$GATE" --prefer-online --include=optional "./$TARBALL"; then
    # absolute path (never PATH: a stale global agentlocks must not contaminate the proof); capture the
    # launcher's OWN exit (no piped grep: run: shells lack pipefail, so a print-then-crash would pass).
    if GOT="$(AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$GATE/bin/agentlocks" --version)"; then
      WT="$(mktemp -d)"   # primary check is a REAL lock cycle: a bun-compiled binary's failure mode is
      if ( cd "$WT" \      # asset extraction on first real command, which --version/--help bypass.
           && LID="$(AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$GATE/bin/agentlocks" acquire f.txt --reason ci-gate --id-only)" \
           && AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$GATE/bin/agentlocks" release "$LID" ); then
        case "$GOT" in *"$VERSION"*) ok=1; break ;; esac; fi
    fi
    echo "::error::linux-x64@$VERSION installed but version/lock cycle failed -> broken binary, not lag"; exit 1
  fi
  echo "linux-x64@$VERSION listed but install/fetch failed (tarball propagating), retry $i/24"; sleep 15
done
[ -n "$ok" ] || { echo "::error::pre-publish gate failed within budget"; exit 1; }

# FLIP: publish the EXACT verified tarball (not a working-tree repack), to latest. id: flip.
if [ "$(npm view "agentlocks@$VERSION" version --prefer-online 2>/dev/null)" != "$VERSION" ]; then
  npm publish "$TARBALL" --provenance --access public
else
  echo "::error::main@$VERSION already exists; its bytes were not gated by this run and a non-reproducible binary cannot be byte/provenance-matched. PATCH-FORWARD, do not flip onto it."; exit 1
fi
echo "flipped=true" >> "$GITHUB_OUTPUT"   # emit before Create-Release + terminal check (Section 4.2)
# ... Create GitHub Release, then the terminal check (Section 4.5) ...
```

A few points the code encodes:

- **Publish the exact verified tarball** (`npm publish "$TARBALL"`), not a bare `npm publish` that repacks the working tree. main declares no `prepack`/`prepublishOnly`/`prepare` today, so a repack would be byte-identical, but Section 6 is an edit plan that could later slip a lifecycle hook or `npm pkg set` into that gap; publishing the gated tarball makes byte-identity unconditional. Residual fidelity gap: a local-tarball install doesn't exercise npm's registry `os`/`cpu`/`libc` resolution exactly as a clean `agentlocks@V` resolution would (the reason the `next`+dist-tag path is marginally more faithful); the canary covers that on the non-linux targets.
- **Unconditional hard-fail on a pre-existing `main@VERSION`.** Because a `bun build --compile` binary isn't byte-reproducible, bytes can't tell a benign re-run from a prior dead/foreign/off-band publish. An always-fail is strictly safer than a provenance predicate that might be a stub returning true and silently re-opening the hole; recovery is patch-forward. Optional upgrade, only if confirmed against current npm: replace the fail with a real attestation match (`gh attestation verify --owner`, accept the skip only if source repo / workflow ref / commit SHA equal `$GITHUB_REPOSITORY` / `$GITHUB_WORKFLOW_REF` / `$GITHUB_SHA`, fail closed otherwise). Do **not** use `npm audit signatures` for this: it verifies registry/Sigstore signatures, not that the publish came from this repo+workflow+commit.

**Why not stage main under `next` and flip with a dist-tag?** That verifies the registry-exact `npm i -g agentlocks@$VERSION`, marginally more faithful. But the promote then must be `npm dist-tag add ... latest`, which OIDC doesn't authorize ([npm/cli#8547](https://github.com/npm/cli/issues/8547)), forcing a granular npm token whose only power is moving `latest` into GitHub secrets as a standing credential. The tarball gate closes the same hole tokenlessly. If you ever need the registry-exact gate: stage with `--tag next`, verify, flip with a token scoped to the five packages and dist-tag-write only, then drop the "nothing to rotate" claim in RELEASING.md and rotate it.

**npm Staged Publishing** (`npm stage publish` / `npm stage approve`) is the forward-looking target end-state, not a current dependency: its specifics post-date this doc's knowledge cutoff, so **verify them against current npm docs before adopting**, and do not copy a version floor into an `npm@` pin on the strength of this paragraph. As reported: `stage publish` is OIDC-automatable and only `stage approve` needs 2FA, which makes it the clean tokenless bridge to a **matrix-gated** flip (stage all five, run the full four-target matrix, a human approves once green). It reportedly has no unattended atomic multi-package approve, so the approval order must still put main last, and it reportedly raises the toolchain floor (npm >= 11.15.0, Node >= 22.14.0, above the npm >= 11.5.1 OIDC-publish floor the active design pins to). Adopt it for the matrix-gated variant. ([trusted publishing](https://docs.npmjs.com/trusted-publishers/))

### 4.4 The canary (post-flip cross-platform alarm)

The gate runs on `linux-x64` only, so **nothing it proves covers the execution of the three non-linux binaries**. A corrupt one, or a bad `os`/`cpu`/`libc`/`name`/`bin` manifest, passes the gate; the launcher treats a skipped or absent optionalDependency as non-fatal (`bin/agentlocks.mjs:79-92`), so that platform silently drops out of a default install and reaches users for the flip-to-canary window. Per-package CDN skew compounds it: `agentlocks@V` can be installable while a platform `@V` isn't yet, so npm skips the optional dep and installs a wrapper with no binary even when every binary is fine. The flip moves `latest` before any of this is observable on the three targets; the canary is the only net.

Reframe the existing matrix `verify` job as the canary:

- **Post-flip alarm, not a gate**, gated on `needs: release` + `if: ${{ always() && needs.release.outputs.flipped == 'true' }}` (the `always()` and the `id: flip`/`outputs:` wiring from Section 4.2 are mandatory or it never runs / gets skipped on a post-flip job failure).
- **All four targets**, `fail-fast: false`: `ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, and `macos-13` for Intel macOS. The Intel leg must be `macos-13` (hosted macOS 14/15 are arm64-only); a nonexistent `macos-15-intel` either errors or silently stops exercising the darwin-x64 binary. `macos-13` is the last Intel image and is on GitHub's announced retirement path, so re-check it each maintenance pass; when it goes, choose a self-hosted Intel runner, drop darwin-x64, or scope it fallback-only (the Section 4.1 honesty).
- **Each leg tests BOTH unpinned `agentlocks` AND exact `agentlocks@$VERSION`** in separate clean prefixes, Bun fallback off. The unpinned install is the real user contract on these edges and the only thing that catches the CDN-skew skipped-optionalDependency case; the exact pin proves the binary. Each runs the **same real lock cycle as the gate** (`acquire f.txt --reason ci-canary --id-only` then `release`), not `--version`/`--help`.
- **`permissions: {}`** (no `contents`, no `id-token`): it neither writes the repo nor publishes, and running a freshly-published binary with `id-token: write` is gratuitous OIDC exposure.
- **Mandatory notify-on-failure**, routed around `permissions: {}`. A red `fail-fast: false` step pages nobody and can sit unnoticed while the corrupt binary *is* `latest`. `gh issue create` needs `issues: write`, which `permissions: {}` denies, so use either an external webhook called with a secret from inside the canary, or a separate minimal `notify` job (`needs: canary`, `if: ${{ always() && needs.canary.result == 'failure' }}`) carrying only `issues: write`. This notify is the trigger for the Section 5 roll-back; with it, the exposure window = canary runtime + notify latency + the 30-minute roll-back commitment (Section 1).

Cheap pre-flip hardening that doesn't execute the three binaries: the **published-manifest guard** (Section 6 step 9) asserts each platform package's `name`/`version`/`os`/`cpu`/`libc`/`files`/`bin` against what main pins, and waits for all four to be installable, before flipping. It catches a bad manifest or an unpropagated package, but not a corrupt binary; only a matrix-gated flip closes that.

### 4.5 Human gate, tag provenance, propagation

- **One human approval, unchanged:** the `release` Environment with required reviewers pauses before anything touches npm (`release.yml:22`). The in-job gate is the machine gate between staging and the flip; the human gate is before everything. There's no second job to approve.
- **Gate the tagged commit, not just the deploy.** The environment approval authorizes the deploy, but a `v*` tag can point at any commit. Add tag protection plus an early step (before any publish): `git fetch origin main && git merge-base --is-ancestor "$GITHUB_SHA" origin/main || exit 1` (checkout is shallow by default, so fetch enough history). This closes the off-`main`-tag-flips-`latest` path.
- **Guard the tag shape early,** before any platform publish: the `v*` trigger also matches `v1.2.3-rc.1`, and a prerelease tag would publish all four platform packages and only then hard-fail at main's exact-pin assertion, stranding a partial release. Fail any `$VERSION` not matching `^[0-9]+\.[0-9]+\.[0-9]+$` next to the existing `tag == package.json` step (`release.yml:44-52`).
- **Propagation is eventually consistent,** per-package and uncorrelated; reads lag writes by seconds to minutes. Every retry passes `--prefer-online` to bust npm's negative-packument cache, or a first-attempt miss is served stale across the whole retry window. The post-flip **terminal check** (unpinned `npm i -g agentlocks` resolves and runs `$VERSION`, fallback off, absolute path) must **not** be blanket `continue-on-error`'d, which would swallow its hard-fail branches. Split three ways: `got_wrong` (resolved to a different version number) always hard-fails; installed-but-broke (tarball live but `--version`/lock cycle then failed) also hard-fails (a live-but-crashing tarball is a broken `latest`, not lag); only never-installed downgrades to a `::warning::` for lag (re-check manually, don't roll back). This check can't see a same-version foreign main that prints the expected `$VERSION`, nor the three non-linux targets, so the pre-flip pre-existing-`main` hard-fail (Section 4.3) and the canary stay load-bearing.

### 4.6 Concurrency

The current file has no concurrency block; two tag pushes or an overlapping re-run could race `latest`. Add a **constant** group (not `github.ref`: keying on the tag ref lets `v0.6.3` and `v0.6.4` run in parallel and interleave their flips, landing `latest` on the older one):

```yaml
concurrency:
  group: release          # constant: latest is a global resource
  cancel-in-progress: false   # a cancelled mid-flip is the half-done state we avoid
```

State its limits so it isn't over-trusted:

- **It is not FIFO and can drop a pending run.** A constant group keeps at most one pending run and cancels an older pending one when a newer queues, so `v0.6.3` can be silently discarded if `v0.6.4` is pushed while it waits. GitHub offers no FIFO queue key today, so close this by procedure (Section 6 step 10): don't push the next tag until the prior run completes or is consciously abandoned.
- **Add a monotonic-version guard** early (before any publish): fail if `$VERSION` is not strictly greater than the **maximum published** `agentlocks` version (`npm view agentlocks versions --json --prefer-online`, max by **numeric** tuple compare, not string, and not the current `latest` so a post-rollback stale line below the max-ever can't be re-promoted). Do **not** `require('semver')` (not a dependency; npm's bundled copy isn't resolvable from the workflow cwd, so it throws `MODULE_NOT_FOUND`); use an inline `node -e` numeric-tuple comparator. This is best-effort early rejection (it stops the stale-re-run case), TOCTOU against a true interleave; treat empty/first-publish as pass but a network error as retry-not-pass.
- **Immutability is the actual race backstop,** not the `npm view` pre-check: the flip is a non-atomic view-then-publish, and what truly prevents a double publish is npm rejecting the duplicate immutable version (a harmless E409). The `npm view` guard is just a courtesy to avoid a red run.
- **It doesn't reach a maintainer's terminal.** A manual `npm publish` or roll-back `dist-tag add` can still race the CI flip; close that by a RELEASING.md rule (Section 6 step 10): no manual `dist-tag`/publish while a release run is queued or running.

## 5. Failure-mode table

| Failure point | What users on `npm i -g agentlocks` see | Recovery |
| --- | --- | --- |
| `bun run check`, build, or a platform publish fails | Nothing. `latest` never moved; main was never published. | Re-run. Published platform packages are immutable no-ops on re-run. |
| In-job gate fails before the flip (build flake, lag, wiring) | Nothing. main was only packed, never published. | Re-run after fixing the cause. Don't re-cut the version. |
| A platform binary from a prior run is itself defective | If on `linux-x64`, the gate executes it and fails before the flip. On one of the **three non-linux** targets it is not caught pre-flip: the immutable prior version is skipped on re-run, the gate can't execute it, so the re-run flips and the **post-flip canary** surfaces it within the window. | **Patch-forward.** The prior platform bytes are immutable; a re-run can't replace them and only re-flips over the same unverified binary. |
| Job dies between staging and the flip | Nothing. `latest` unchanged; main not yet published. | Re-run; idempotent. |
| `main@VERSION` already present from a prior dead/foreign run or moved tag | Whatever the stale `main@VERSION` resolves to is `latest`; this run's bytes never went live. | The flip **unconditionally hard-fails** on any pre-existing `main@VERSION` (Section 4.3); the terminal check's `got_wrong` is the backstop. Either way **patch-forward**. |
| Terminal check never installs, but `latest` is the prior good version and only lags | Nothing bad; the new version is fine and propagating. | **Don't roll back.** Only the never-installed branch warns; wrong-version and installed-but-broke hard-fail. Re-check manually. |
| Canary catches a corrupt single binary after the flip | Users on that one target get a binary that fails to exec (launcher prints the spawn error, exits 1). Other three fine. | Roll back `latest` (below), `npm deprecate`, patch-forward. The residual window the canary exists to shrink. |
| Functional bug found after the flip (everything passed) | Everyone on default install gets it. | Roll back `latest`; `npm deprecate` warns; patch-forward. Bytes stay published (immutable). |
| musl / Windows user | No prebuilt binary; launcher falls back to Bun or exits 1 with an actionable message. | Out of scope by design (Section 4.1). Install Bun, or use a glibc/darwin target. |

**Roll back `latest`** (post-flip break-glass, belongs in RELEASING.md). Not tokenless: `npm dist-tag add` and `npm deprecate` aren't OIDC-covered (Section 2), so they run from a logged-in 2FA npm session. The tokenless guarantee covers the forward pipeline, not recovery.

```bash
PREV=0.6.2
for d in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do            # every platform pkg must exist at PREV
  [ "$(npm view "agentlocks-$d@$PREV" version --prefer-online 2>/dev/null)" = "$PREV" ] \
    || { echo "agentlocks-$d@$PREV missing, aborting"; exit 1; }; done
RB="$(mktemp -d)"; WT="$(mktemp -d)"                                   # PREV must INSTALL AND RUN, not just resolve
npm install -g --prefix "$RB" --prefer-online "agentlocks@$PREV" \
  && AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$RB/bin/agentlocks" --version \
  && ( cd "$WT" && LID="$(AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$RB/bin/agentlocks" acquire f.txt --reason rb --id-only)" \
       && AGENTLOCKS_DISABLE_BUN_FALLBACK=1 "$RB/bin/agentlocks" release "$LID" ) \
  || { echo "agentlocks@$PREV does not install/run cleanly, aborting"; exit 1; }
npm dist-tag add "agentlocks@$PREV" latest          # main only; platform tags are theater
npm deprecate "agentlocks@<bad>" "regression; use agentlocks@$PREV or newer"
```

Only main's `latest` moves. The pre-flight installs and runs a real lock cycle on `agentlocks@PREV` (fallback off) so roll-back can't land on a `PREV` that merely resolves but doesn't execute; it runs on the maintainer's one platform, so roll back only to a version with stored green four-target canary evidence (or run the full four-target rollback canary first). Roll-back protects the unpinned path only; anyone who pinned `agentlocks@<bad>` exactly still gets it, and `npm deprecate` warns without changing resolution.

## 6. Concrete minimal changes to `release.yml`

Stay with a **single gated job** (`release`, `environment: release`, OIDC, `id-token: write`), unchanged through `build:binaries`. Then:

1. **Top-level `concurrency`** block, constant group, `cancel-in-progress: false` (Section 4.6).
2. **Early guards, before any publish** (Section 4.5, 4.6): tag-provenance (`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`, plus `v*` tag protection); tag-shape (fail `$VERSION` not `^[0-9]+\.[0-9]+\.[0-9]+$`); monotonic-version (strictly greater than the max published, numeric tuple compare, no `require('semver')`; empty=pass, network-error=retry).
3. **Publish the four platform packages to `latest`** (current lines 68-81), unchanged, skip-if-exists.
4. **Assert exact pins; do not publish main yet.** Keep the `npm pkg set`, add the `node -e` assertion that the optionalDependencies **set** is exactly the four names at exactly `$VERSION` (keys and values, no extras/missing), and remove the main `npm publish` from here. The keystone: the "platform tags don't matter" argument depends on exact pins.
5. **In-job gate** after the pins (Section 4.3): `npm pack` main, then retry the whole install-and-check on `linux-x64`. Distinguish the three propagation states (poll `npm view ...linux-x64@$VERSION --prefer-online` before installing; an install/fetch failure after the version lists is still lag; only install-ok-then-binary-fails is a fast hard-fail). Reuse the current `verify` retry shape but: capture the launcher's own exit via `GOT=$(...)`+`case` (never piped `grep`); pass `--prefer-online` and force optional deps on (`npm_config_omit= --include=optional`); run a **real lock cycle** (`acquire`/`release` in a bare temp dir, no git) as the primary check, not `--help`/`--version`; install to a fresh `RUNNER_TEMP` prefix per attempt and invoke by absolute path. **Raise `timeout-minutes`** (currently 20, `release.yml:18`) to fit build + check + ~6 min gate + flip + ~2 min terminal, or it can die mid-gate in the ambiguous half-state this design avoids.
6. **Flip** after the gate: `npm publish "$TARBALL" --provenance --access public` (the exact verified tarball, not a repack), with the **unconditional hard-fail on a pre-existing `main@VERSION`** (Section 4.3). Give the step `id: flip`, emit `flipped=true`, declare `flipped: ${{ steps.flip.outputs.flipped }}` in the job's `outputs:` map. Then the terminal check (Section 4.5), split three ways, **not** blanket `continue-on-error`.
7. **Move Create-GitHub-Release (lines 107-123) to after the flip but before the terminal check.** Binaries are already on disk (same job), so no artifact plumbing. After the flip so a Release never describes a non-`latest` version; before the terminal check so benign lag reddening that check can't skip the Release. Don't split into a rebuilding job (`bun build --compile` isn't byte-reproducible).
8. **Reframe `verify` as `canary`** (Section 4.4): `needs: release` + `if: ${{ always() && needs.release.outputs.flipped == 'true' }}`; four targets (`macos-13` for Intel); both unpinned and exact installs, fallback off, real lock cycle; `permissions: {}`; a mandatory notify-on-failure routed around `permissions: {}` (webhook, or a separate `notify` job with only `issues: write`).
9. **Pre-flip published-manifest guard** over all four packages (a superset of the linux-`libc`-only check): validate `name`/`version`/`os`/`cpu`/`libc`/`files`/`bin` via `npm view agentlocks-<d>@$VERSION --json` against what main pins, and wait for all four to be installable, before the flip.
10. **Rewrite `RELEASING.md` to this model** (same PR): replace "the `verify` job is the real gate" (the gate is now the in-job pre-flip check); recast "Cutting a release" to stage -> gate -> flip -> canary; **replace** the delegation prompt's "if a step fails after publishing, re-run (publishes are idempotent)" (line 69) with the gate-failure-re-run vs canary-failure-roll-back vs prior-binary-patch-forward split (that line currently instructs the exact wrong recovery for the defective-binary case); qualify "nothing to rotate" (recovery is a 2FA action); add the serialization rule (no manual `dist-tag`/publish, and no new release tag, while a run is queued/running; name the maintainer as roll-back owner with the 30-min commitment).

**Pin npm in this PR:** replace `npm install -g npm@latest` (`release.yml:42`) with a pin to a vetted npm at/above the OIDC-publish floor (>= 11.5.1) and older than the project's package-age window, so an npm release landing after the human approval can't publish bad bytes. **SHA-pin the third-party actions** (`actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node`) as a near-term follow-up PR (its own review surface); until it lands, `latest`-safety is conditional on those floating actions (Section 1).

Net diff vs the current two-job file: a concurrency block; three early guards; an npm pin; main's publish moved after a new in-job pack-and-verify gate (verified tarball, lock-cycle primary check); the pre-existing-`main` hard-fail; a `flipped` output (flip `id`, declared in `outputs:`); the exact-pin set assertion; the four-package manifest guard; a raised `timeout-minutes`; one step relocation; the `verify` -> `canary` reframe (four targets, dual install, `permissions: {}`, mandatory notify); and the RELEASING.md rewrite. No new release job, no new environment, no token, no dist-tag in the forward path. Kept: OIDC, `--provenance`, the environment human gate, the tag trigger, the `tag == package.json` and `bun run check` pre-publish checks, skip-if-exists idempotency.

## 7. Is this overkill?

No. Verify-after-publish is structurally unable to meet the bar: by the time it reports, the immutable bad version is already `latest`, and every remedy is worse than never flipping (the SWC #9043 situation). The bar needs a gate between upload and the flip.

The cost is small because agentlocks collapses it: only main's `latest` is user-visible, so the flip is one `npm publish` and the verify already exists; it just runs before main is published (against the packed tarball and the live binaries) with the fallback off. It stays tokenless, single-job, and *smaller* than a staged-plus-token alternative.

What it meets, precisely: launcher wiring and the `linux-x64` binary are proven before the flip, so nothing broken in those respects becomes the resolved `latest`. The conscious gap, in exchange for staying tokenless: a single corrupt one of the three non-linux binaries can be `latest` for the flip-to-canary window, caught by the canary and rolled back, **bounded only because the notify is mandatory and the roll-back is owned with a response time** (Section 1, 4.4). Closing it pre-flip means the matrix-gated flip via npm Staged Publishing (Section 4.3). And one caveat until a near-term follow-up: the third-party actions and `npm@latest` aren't pinned, so the guarantee is conditional on them until then (Section 1, 6). If even that few-minute single-binary window is unacceptable, adopt the staged-publishing variant; otherwise this is the minimal design that meets the scoped bar and reuses every existing safety primitive.

## 8. References

- npm unpublish policy (immutability, 72h window): https://docs.npmjs.com/policies/unpublish/
- npm dist-tag command: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/
- Adding dist-tags (stage under non-latest, then promote): https://docs.npmjs.com/adding-dist-tags-to-packages/
- npm trusted publishing (OIDC; `npm publish` / `stage publish` only): https://docs.npmjs.com/trusted-publishers/
- OIDC does not cover dist-tag (open): https://github.com/npm/cli/issues/8547
- napi-rs pre-publish (fan-out, platform packages first): https://napi.rs/docs/cli/pre-publish
- esbuild optionalDependencies fan-out: https://github.com/evanw/esbuild/pull/1621
- Biome distribution (main + per-platform packages): https://www.npmjs.com/package/@biomejs/biome
- SWC unverified-build-to-latest incident: https://github.com/swc-project/swc/issues/9043
