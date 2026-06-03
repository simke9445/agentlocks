# Bundle-size reduction — recommendation + status (PROVEN on CI)

Goal: shrink the installed `agentlocks` footprint (60–112 MB/platform, ~100% embedded
Bun runtime) to the smallest defensible size. Graded research loop; PROVEN PoC. Implemented and
heading to a tagged `0.8.0` release (the original "no publish/tag" rail was lifted by the user).

## Recommendation: **Option 1 — drop the embedded-Bun binaries, ship one Node bundle. CLI-only (no library API).**

The 60–112 MB is entirely the embedded Bun runtime; the app is ~6,800 LOC + one dep
(commander) and uses **zero** Bun runtime APIs. Bundling the CLI for Node yields **156.61 KB**
(tarball **59.4 kB**) — a ~1000× install-footprint reduction — and the npm install path already
required Node (the launcher shebang), so the compiled binary was near-pure overhead. Per user
direction, agentlocks ships **only a CLI `bin`** — no exposed JS library API, no `exports`, no `.d.ts`.

Option 2 (native Rust/Go rewrite) is the only path to *both* small size and zero-runtime, but is a
large effort, unjustified unless "no runtime on the machine" is a hard requirement. Option 3
(minify/strip/UPX) is marginal (the runtime is the floor) and UPX is rejected (AV false-positives;
we already fought win32 AV/E403).

## STATUS: bundle direction PROVEN end-to-end on real CI

`shrink-bundle-size` @ `67a8cce`, CI run **26886447426 = completed/success, 8/8 jobs green** (no
publish, no tag — `release.yml` is tag-only, `ci.yml` is main/PR-only; the branch push ran only
`bundle-conformance.yml`).

| Claim | Result (real signal) |
| --- | --- |
| Bundle size | **156.61 KB** minified; **tarball 59.4 kB / 5 files** (CHANGELOG, LICENSE, README, `dist/agentlocks.mjs`, package.json) vs 60–112 MB |
| Local suite | `bun test` **177 pass / 0 fail**; `tsc` + `biome` clean (62 files); `actionlint` clean |
| Local PoC (darwin-arm64) | `npm i -g` → bin symlink → `#!/usr/bin/env node`; `--version` 0.7.0; EXTENDED conformance + ts-config-smoke PASS |
| **CI pack** | `prepack` builds the exact published tarball once; every leg installs *those bytes* |
| **CI install-conformance** | global `npm i -g` (no Bun present), `--version` → 0.7.0, EXTENDED conformance + ts-config-smoke PASS on **ubuntu / macOS / windows × node 22.18.0 & 24.16.0** (6 legs) |
| **CI musl-conformance** | same, Alpine `node:22.22.3` via docker (JS actions can't run in-container on arm64) |
| Windows cmd-shim + `.mjs` exec (min-node) | `0.7.0`, `PASS: all extended assertions passed`, `PASS: valid .ts config loaded under Node v22.18.0`, `ts-config-smoke: OK` |
| Min-node type-stripping | `.ts` config loads + validates under **Node v22.18.0** (the declared `engines.node` floor) on every OS |
| Startup (local, 20 runs) | bun-binary median 28.8 ms (mean 102 — 60 MB cold page-in); node-bundle median 92.6 ms, low variance. ~3× warm regression, ~wash cold. Soft dimension; 92 ms is fine for a CLI. |

### codex gates (R2) — closed by this CI run
- **HIGH — Windows npm cmd-shim + `.mjs` exec:** CLOSED (both windows legs green, incl. min-node).
- **HIGH — cross-OS single-tarball install:** CLOSED (ubuntu + macOS + windows + Alpine/musl).
- **HIGH — library "self-run" on import:** structurally ELIMINATED — there is no library API (CLI-only).
- **MED — engine/config contract on minimum Node:** CLOSED (`ts-config-smoke` green on the 22.18.0 legs).
- **MED — dev story after dropping the Bun-source fallback:** dev uses `bun run bin/agentlocks.ts`; `prepack` builds `dist/` for pack/`npm link`.
- **Perf (6/10):** unchanged soft spot — warm startup ~3× the binary; acceptable for a CLI, documented above.

## Changes APPLIED (bundle migration committed `0fffa67`; pipeline refactor + docs this round)
- **package.json:** `bin` → `dist/agentlocks.mjs`; `files` → `["dist/","README.md","CHANGELOG.md","LICENSE"]`;
  **`exports` removed** (CLI-only); **`engines.node` `>=22.18`**; **no** `optionalDependencies`; **version `0.8.0`**.
- **scripts/build-bundle.mjs:** cleans `dist/` then builds the single CLI bundle (`bun build --target=node --minify`),
  rewrites the shebang to `#!/usr/bin/env node`, `chmod 0o755`. (Library bundle removed.)
- **Binary scaffolding deleted (`git rm`, all commits preserved):** `npm/<platform>/` ×7,
  `scripts/build-binaries.mjs`, `scripts/smoke-install.mjs`, the launcher `bin/agentlocks.mjs`, and the
  binary-only CI scripts (`platform-target`, `assert-target-identity`, `assert-optional-deps`,
  `check-manifest`, `verify-install-and-prove.sh`). Surviving `scripts/ci/`: `check-monotonic.mjs`, `dist-integrity.sh`.
- **Pipeline refactor (this round):** extracted reusable `.github/workflows/conformance.yml` (3 OS × 3 node
  {22.18.0, 22.22.3, 24.16.0} + Alpine/musl, asserts `--version`); white-box-only `windows-unit.yml`;
  parallelized `pack ∥ windows-unit`; `ci.yml` + `release.yml` now call the SAME conformance reusable, so CI
  proves the release gate on every push. `bundle-conformance.yml` folded in and deleted. `actionlint` clean.
- **Docs rewritten to the bundle model:** `RELEASING.md`, `docs/production_ci_design.md`, `CHANGELOG.md`
  (`## 0.8.0`), `README.md` (install blurb + dropped Library API section), `AGENTS.md`.

## RESOLVED — the binary-vs-bundle reconciliation
The two-distribution-models conflict (bundle `package.json` vs `2d9aacd`'s 7-binary `release.yml`) is
resolved in favor of **bundle-only**, per user direction. `release.yml` was rewritten (not silently
reverted) to pack → prove → publish the single tarball; the binary scaffolding was removed by `git rm`
(trunk-based, all commits preserved). No platform packages to publish, so the win32 npm bootstrap /
E403 / trusted-publisher saga is moot. OIDC trusted publishing for the single `agentlocks` package is
confirmed working (0.7.0 published through the same `flip` path).

## Next
1. Prove the refactor green on real CI (`ci.yml` dispatch on the branch) — the reusable conformance must pass.
2. Loop a **codex review** against the release-readiness rubric until zero blocking findings.
3. Merge to `main` (fast-forward, all commits preserved), tag `v0.8.0`, push; monitor `release.yml`
   to the `release` approval gate (the maintainer approves — never self-approved).
