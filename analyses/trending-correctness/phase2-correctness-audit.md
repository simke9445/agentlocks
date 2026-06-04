# Phase 2 Correctness And Hostile-Demo Audit

Captured: 2026-06-04T15:46Z

## Purpose

This audit maps the Phase 2 launch-hardening requirements from `GITHUB_TRENDING_PLAN.md` to current
repo evidence. It is read-only: no source, test, workflow, or documentation files outside this
artifact were changed.

Phase 2 local correctness is green on the current worktree, but public launch is **not complete**
until the demo asset exists, README top-fold changes land, the local commits are pushed, and CI is
green on the pushed SHA.

## Current Coordination State

Earlier in this run, Phase 2 was blocked by a parallel source/test refactor. That blocker is now
cleared:

- commit: `94cd3f7 Unify resource lock arguments`
- branch state: `main` is ahead of `origin/main` by 1 commit
- current board: only this audit/status lock is held
- current worktree: source/test refactor files are clean; launch-plan artifacts remain untracked

Consequence: source/test mutation is no longer blocked by a live lock, but CI cannot be green on the
refactor until the local commit is pushed.

## Coverage Matrix

| Phase 2 work item | Current evidence | Status |
| --- | --- | --- |
| Concurrent acquire/release stress tests | `tests/concurrency.test.ts:46-59` asserts exactly one same-path acquire wins; `:63-78` asserts distinct paths all succeed; `:265-307` runs deterministic randomized concurrent acquire/release churn and then re-tests mutual exclusion. | Covered; local `bun run check` green |
| Concurrent Git-index behavior | `tests/concurrency.test.ts:81-103` asserts exactly one concurrent `git-begin` holder; `tests/improvements-040.test.ts:302-359` covers generation tokens and reclaimed-fence failure. | Covered; local `bun run check` green |
| Stale lock classification and prune behavior | `tests/locks.test.ts:401-484` covers `prune --id-only` and dry-run JSON; `tests/locks.test.ts:493-528` covers `acquire --reclaim`; `tests/improvements-040.test.ts:228-249` asserts reclaimable/dead locks do not cover staged paths. | Covered; local `bun run check` green |
| Crash/SIGKILL recovery expectations | `tests/concurrency.test.ts:166-220` covers stale mutex recovery for dead same-host pid, live same-host pid, and different-host owner. There is no literal SIGKILL child-process integration test; the dead-pid mutex test is the current proxy for crash recovery. | Partially covered |
| Git-index lock under commit flow | `scripts/conformance-scenario.mjs:384-395` and following lines exercise the high-level `agentlocks commit` path in a real temp Git repo; `tests/improvements-040.test.ts:326-359` covers fence verification at the registry layer. | Covered; local `bun run check` green |
| Windows conformance remains real | `.github/workflows/windows-unit.yml` runs the full `bun test` lock suite on `windows-latest`; `.github/workflows/conformance.yml` installs the packed tarball through npm on `windows-latest` and runs the extended conformance scenario. | Covered by workflow design; needs pushed CI check |
| Node floor and no-Bun global install path | `.github/workflows/conformance.yml` proves Node `22.18.0`, `22.22.3`, and `24.16.0`; POSIX and Windows legs install `main.tgz` with npm and run `node scripts/conformance-scenario.mjs`; `scripts/ts-config-smoke.mjs` is included in the same workflow. | Covered by workflow design; needs pushed CI check |
| Filesystem path normalization and glob semantics | `tests/locks.test.ts:17-44` covers safe repo-relative resources; `tests/locks.test.ts:49-80` covers exact/path-glob/conservative-glob/Git-index conflicts; `scripts/conformance-scenario.mjs:249-259` includes path handling in extended black-box conformance. | Covered; local `bun run check` green |
| Update-check behavior for automation safety | `tests/update-notice.test.ts` covers version comparison, update guidance, unscoped registry URL, machine-readable skip, and non-interactive skip. | Covered; local `bun run check` green |
| Published dependencies and runtime surface | `npm pack --dry-run --json --ignore-scripts` reports 5 files: `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/agentlocks.mjs`, and `package.json`; package metadata still declares runtime dependency `commander@14.0.3`; `npm view agentlocks@latest ... --json` confirms latest `0.8.0` has the same dependency and Node floor. | Intentional-looking but needs source owner decision |

## Current Tarball Surface

Command:

```bash
npm pack --dry-run --json --ignore-scripts
```

Observed:

- package: `agentlocks@0.8.0`
- packed size: 59,722 bytes
- unpacked size: 202,161 bytes
- entries: 5
- files:
  - `CHANGELOG.md`
  - `LICENSE`
  - `README.md`
  - `dist/agentlocks.mjs`
  - `package.json`

This is launch-friendly: it does not publish tests, source, analyses, local lock state, or launch
drafts. It still ships `package.json`, so any declared runtime dependency remains visible even if the
bundle inlines it.

## Current Registry Surface

Command:

```bash
npm view agentlocks@latest version time dist.unpackedSize dependencies bin engines --json
```

Observed:

- latest version: `0.8.0`
- published: 2026-06-03T14:51:00.298Z
- unpacked size: 201,364 bytes
- bin: `agentlocks` -> `dist/agentlocks.mjs`
- engine: Node `>=22.18`
- runtime dependency: `commander@14.0.3`

## Findings

## Claude Rubric Review

Claude Code reviewed this audit with an explicit rubric adapted from loaded scoring skills:

- overall score: 74/100
- confidence: medium-high
- recommendation: proceed only after conditions
- blocking findings:
  - stale blocker should be removed from audit/status once refactor is confirmed landed;
  - no recorded demo exists yet, so the public launch gate remains closed.
- nonblocking improvements:
  - fix dependency-evidence docs drift;
  - record the `commander` dependency decision;
  - consider one cross-platform crash-recovery test;
  - prefer test names over brittle line ranges in the coverage matrix;
  - confirm latest pushed CI and README assets.

Codex verification: the stale-lock finding was confirmed locally (`94cd3f7`, no other locks, local
`bun run check` green). The demo-media finding is accepted as still blocking. The
dependency-evidence drift and current `commander` decision were fixed in `docs/dependency-evidence.md`
after the refactor lock cleared.

### F1: Phase 2 Has Broad Existing Coverage

The repo already covers the core hostile-demo claims better than a typical launch repo: mutex
contention, concurrent same-path acquire, concurrent Git-index acquire, stale mutex recovery,
reclaimable locks, `git verify`, path/glob normalization, Windows white-box tests, and black-box npm
install conformance.

Action: do not add duplicate tests before demo work. The final local source state is green; add only
gap-closing tests if a concrete launch claim needs stronger proof.

### F2: Crash Recovery Is Covered By Proxy, Not A Literal SIGKILL Scenario

The stale mutex tests simulate dead/live/foreign mutex owners, which is the important registry
behavior after a crash. There is not a child-process test that launches a real lock holder, kills it,
and proves recovery through the public CLI.

Action: if Phase 2 needs a stronger hostile-demo proof, add one CLI-level SIGKILL/crash integration
test after the source/test lock clears. Keep it focused and cross-platform; skip literal SIGKILL on
Windows if the test cannot be made stable.

### F3: Dependency Evidence Had Docs Drift

`package.json` is a single-package manifest with exact dependency pins. `docs/dependency-evidence.md`
previously said package entries referenced pins with `catalog:` and `workspaces.catalog`, which did
not match the current manifest.

Action taken: `docs/dependency-evidence.md` now has a 2026-06-04 verification date, updated package
ages, single-package manifest wording, and no workspace-catalog claim.

### F4: Runtime Dependency Surface Needs An Owner Decision

The bundle is one `dist/agentlocks.mjs` file, but the published manifest still declares
`commander@14.0.3`. That may be intentional for source parity or harmless npm metadata, but the Phase
2 plan explicitly calls out reviewing whether published `dependencies` are necessary for the bundled
CLI.

Action taken for this launch: `docs/dependency-evidence.md` records that `commander` remains the only
declared runtime dependency for the current release line even though the CLI ships as one bundled
`dist/agentlocks.mjs`. Re-evaluate before the next npm release if the goal becomes a dependency-free
install surface.

## Verification

Local command:

```bash
bun run check
```

Result on 2026-06-04T15:46Z:

- 151 tests passed.
- 0 tests failed.
- 624 assertions ran.
- `tsc --noEmit` passed.
- `biome check .` passed: 46 files checked, no fixes applied.

Local package-surface command:

```bash
npm pack --dry-run --json --ignore-scripts
```

Result: 5-file tarball surface, listed above.

Do not run the real `npm pack --json --ignore-scripts` in this worktree without acquiring a lock for
the generated tarball path or running in a scratch copy, because it writes `agentlocks-*.tgz`.

## Phase 2 Exit Gate State

Local correctness gate passed. Public launch gate not passed.

Reasons:

- `main` is ahead of `origin/main` by 1 local commit, so pushed CI has not proven this SHA.
- No recorded collision demo exists yet.
- README top-fold demo integration is still pending.
- A literal crash/SIGKILL CLI test remains optional unless the launch copy starts claiming that
  specific recovery behavior.
