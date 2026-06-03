# Bundle-size reduction — recommendation + migration plan

Goal: shrink the installed `agentlocks` footprint (60–112 MB/platform, ~100% embedded
Bun runtime) to the smallest defensible size. Graded research loop; PROVEN PoC; no publish.

## Recommendation: **Option 1 — drop the embedded-Bun binaries, ship one Node bundle.**

The 60–112 MB is entirely the embedded Bun runtime; the app is 6,837 LOC + one dep
(commander) and uses **zero** Bun runtime APIs. Bundling the CLI for Node yields **156.59 KB**
— a ~400–700× reduction — and the npm install path already requires Node (the launcher
shebang), so the compiled binary was near-pure overhead.

Option 2 (native Rust/Go rewrite) is the only path to *both* small size and zero-runtime,
but it is a large effort and unjustified unless "no runtime on the machine" becomes a hard
requirement. Option 3 (minify/strip/UPX) is marginal (runtime is the floor) and UPX is
rejected (AV false-positives; we already fought win32 AV/E403).

## Proven evidence (real signal — darwin-arm64, Node v25.8.1, branch `shrink-bundle-size`)

| Claim | Result |
| --- | --- |
| Bundle size | **156.59 KB** minified (245 KB unmin) vs 60–112 MB |
| CLI under node | `--version` → 0.7.0, `--help` OK |
| `.ts` config under node | `status --json` with `agentlocks.config.ts` → valid JSON (type-strip + `?mtime` query both work) |
| Full suite | `bun test` **177 pass / 0 fail**; `tsc` + `biome` clean |
| Behavioral fidelity | **EXTENDED conformance PASS** against `node dist/agentlocks.mjs` (conflict exit 3, stale-reclaim, commit-lands-in-git, sub-paths) |
| Library import | `dist/index.mjs` imports 44 exports with **no** self-run (after the fix below) |
| Startup (20 runs) | bun-binary median 28.8 ms (mean 102 — 60 MB cold page-in); node-bundle median 92.6 ms (low variance). ~3× warm regression, ~wash cold. V8 compile-cache saves only ~5 ms. |

### Grades (multi-model)
- **Claude (self):** 52/60 pre-codex, ~49 after honest re-weight.
- **codex (independent, read-only):** **42/60** — Size 10, Correctness 8, Coverage 6, Perf 6,
  Supply 8, Migration 4. Verdict: *"ship the direction only after fixing the library entry,
  reconciling the Node engine/config contract, and proving the single tarball across the real
  release matrix."* codex was correctly more skeptical; its findings drive the plan below.

## Changes already made on the branch (isomorphic, verified green)
- `src/index.ts`: removed the `if (import.meta.main) await main()` run-guard → pure library
  entry (fixes codex HIGH: importing the lib no longer executes the CLI).
- `tests/cli.test.ts`: CLI tests now spawn the real entry `bin/agentlocks.ts` (which calls
  `main()` directly) instead of `src/index.ts`. Suite stays 177 pass.
- `scripts/build-bundle.mjs`: reproducible bundle build (+ shebang rewrite + chmod + lib build).

## Migration steps (not yet applied — the product/release changes)
1. **package.json**
   - `bin`: `{ "agentlocks": "dist/agentlocks.mjs" }`
   - `files`: `["dist/", "README.md", "CHANGELOG.md", "LICENSE"]` (drop `src/`, `bin/`)
   - `exports`: `{ ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs" } }`
     (ship compiled lib + `tsc --emitDeclarationOnly` types instead of raw `./src/index.ts`)
   - **`engines.node`: `>=22.18`** — see contract below.
   - Remove the publish-time `optionalDependencies` injection.
2. **Delete** (mostly deletion — lowers real risk vs codex's perceived 4/10): `npm/<platform>/`
   ×7, `scripts/build-binaries.mjs`, the launcher's binary-resolution + Bun fallback
   (`bin/agentlocks.mjs` → replaced by the bundle). The entire **win32 npm bootstrap / E403 /
   trusted-publisher saga becomes moot** — no platform packages to publish.
3. **release.yml**: replace the 7-package build/publish/verify matrix with: pack one tarball →
   install it → run `scripts/conformance-scenario.mjs` via `node .../dist/agentlocks.mjs extended`
   on {ubuntu-glibc, alpine-musl, macos, windows} before the `latest` flip. One `npm publish
   --provenance`; lockfile sha512 + provenance cover the single JS artifact (simpler than
   7-package attestation). `windows-unit.yml`: run conformance against `node dist/agentlocks.mjs`
   (replaces the `.exe`).

## Engine/config contract (resolves codex HIGH)
`init` scaffolds `agentlocks.config.ts`; importing `.ts` needs Bun or **Node ≥22.18**
(type-stripping). With `engines.node >=18`, a Node 18/20 user who runs `init` then any command
would fail to load the scaffolded config. Resolution:
- **Bump `engines.node` to `>=22.18`.** Defensible in 2026: Node 18 EOL 2025-04-30, Node 20 EOL
  2026-04-30 (both EOL as of today); 22 is active LTS. Then the scaffolded `.ts` always loads.
- **Additive hardening (respects "config needn't be TS"):** make the loader resolve
  `agentlocks.config.{ts,mts,mjs,js,cjs}` (first found), so anyone pinning older Node can opt
  into a portable `.mjs`/`.js` config that imports on any Node ≥18. Small change to
  `DEFAULT_CONFIG_FILE` → a resolver in `loadConfigFile`.
- **Alternative** if Node 20 must stay supported: have `init` scaffold `agentlocks.config.mjs`
  by default (portable everywhere) with a JSDoc `@type` import for editor DX.

## Residual proof — needs a branch CI run (the gate to ≥55/60; cannot run on this darwin host)
- **Windows** (codex HIGH): node bundle + npm cmd-shim + `.mjs` exec + CRLF + path/hook spawning.
- **Min-node** (codex MED): `.ts` type-strip + `?mtime` file URL on the *minimum* claimed Node.
- **Package-manager matrix** (codex LOW): npm/pnpm/bun/yarn, global + local, with zero optional deps.

## Dev story (resolves codex MED)
Removing the Bun-source fallback: dev still uses `bun run bin/agentlocks.ts`. For `npm link` of a
checkout, add a `prepare` script that runs `bun scripts/build-bundle.mjs` so a linked checkout has
`dist/`. Document in CONTRIBUTING.

## Phasing + rollback (de-risks "everything changes at once")
- Phase 1: land bundle build + node `bin` + lib `.d.ts`; keep platform packages published-but-unused
  behind the new CI matrix.
- Phase 2: after the matrix is green on all OS, delete platform packages + old matrix.
- Rollback: the platform-package pattern is fully recoverable from git (one revert).
