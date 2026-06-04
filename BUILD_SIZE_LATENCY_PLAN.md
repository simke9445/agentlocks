# Build Size And Latency Improvement Plan

This is the execution plan for making `agentlocks` smaller to ship and faster to run on the common
locking path. It mirrors the operational style of `GITHUB_TRENDING_PLAN.md`: a fresh Codex or
Claude Code agent should be able to pick this up, measure the current state, make one evidenced
improvement at a time, and stop before correctness, CLI contract, or repository coordination
regresses.

This plan has two optimization axes:

- Minimize production build size. Smaller `dist/agentlocks.mjs`, smaller npm packed size, and no
  accidental runtime dependency surface.
- Minimize common command latency. Faster `acquire`, `refresh`, `release`, `status`, `git begin`,
  and related commands, especially in the no-conflict and small-lock-set cases.

Lower is better on both axes, but not at the cost of lock correctness. A fast lock tool that silently
breaks advisory coordination is a regression.

## Objective

Primary operating target:

- Keep the npm-installed CLI as a single Node-runnable bundle.
- Drive raw bundle bytes down every round unless a measured latency/correctness win justifies the
  bytes.
- Drive common command p50 and p95 wall time down every round, with startup cost separated from
  lock-operation cost.
- Preserve the public CLI contract, generated agent instructions, JSON schemas, exit codes, and
  golden help text unless a deliberate contract change is made in place.
- Commit each unit-tested logic chunk on `main` per `AGENTS.md`.

Provisional target policy after the first full pass:

| Metric | Current provisional snapshot | Phase 0 target policy |
| --- | ---: | --- |
| Raw bundle bytes, `dist/agentlocks.mjs` | 169,039 bytes | Re-anchor to clean Phase 0 baseline; Round 1 should target at least one scored reduction, stretch is a measured 20-30% reduction |
| gzip bundle bytes, `gzip -9c dist/agentlocks.mjs` | 46,125 bytes | Track with raw bytes; do not optimize gzip alone |
| npm dry-run packed size | 64,190 bytes | Re-anchor to clean Phase 0 baseline; avoid cutting useful README/CHANGELOG content solely for package bytes |
| `node -e ''` startup floor p50 | 71.27 ms from older rough run | Measure only; this is the runtime floor, not a repo target |
| `agentlocks --version` p50 | 91.67 ms from older rough run | Replace with paired Phase 0 benchmark; target statistically significant overhead reduction |
| `acquire --id-only` p50, 0-1 active locks | 98.86 ms from older rough run | Replace with paired Phase 0 benchmark; target statistically significant overhead reduction |
| `status --json` p50, 0-1 active locks | 94.30 ms from older rough run | Replace with paired Phase 0 benchmark; target statistically significant overhead reduction |
| `release --id-only` p50, 0-1 active locks | 97.28 ms from older rough run | Replace with paired Phase 0 benchmark; target statistically significant overhead reduction |

Do not use the rough p50/p95 rows above as implementation success thresholds. Phase 0 must replace
them with clean, reproducible artifacts. For latency, report paired per-iteration deltas instead of
subtracting two unrelated means:

```text
paired_delta_ms[i] = command_latency_ms[i] - adjacent_node_floor_ms[i]
```

The improvement claim is valid only when the bootstrap confidence interval for the paired delta
change excludes zero and p95 does not regress beyond the variance envelope.

## Current Baseline

These facts were measured on 2026-06-04 in `/Users/djsimovic/Work/agentlocks`. They are a planning
snapshot, not the source of truth, because `dist/` is gitignored and the bundle can drift unless
Phase 0 rebuilds it from a pinned clean SHA. Treat every exact number in this section as provisional
until Phase 0 writes committed benchmark artifacts.

| Surface | Current state |
| --- | --- |
| Product shape | Standalone CLI, Bun/TypeScript dev stack, shipped as one Node bundle |
| Package version | `agentlocks@0.8.0` |
| Runtime entry | `dist/agentlocks.mjs` |
| Bundle bytes | 169,039 bytes in the observed local `dist/agentlocks.mjs`; Phase 0 must rebuild and stamp the committed SHA |
| gzip bundle bytes | 46,125 bytes in the observed local `dist/agentlocks.mjs`; Phase 0 must rebuild and stamp the committed SHA |
| npm pack dry-run | 64,190 bytes packed, 218,399 bytes unpacked, 5 entries |
| Packed files | `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/agentlocks.mjs`, `package.json` |
| Runtime dependencies | No `dependencies`; `commander@14.0.3` is a dev dependency and is bundled |
| Build command | `bun run build` -> `bun scripts/build-bundle.mjs` -> `bun build --target=node --minify` |
| Installed Bun | 1.3.13 |
| Installed Node | v25.8.1 |
| Installed Claude harness | `/Users/djsimovic/.local/bin/claude` |
| `hyperfine` | Not found on PATH; use a local Node benchmark harness unless it is installed later |
| Local host | Darwin 25.5.0 arm64, Apple M1 Pro |

Older rough latency baseline from a temporary directory using `node dist/agentlocks.mjs`:

| Command | n | p50 | p95 | min | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `node -e ''` | 30 | 71.27 ms | 83.29 ms | 66.01 ms | 131.65 ms |
| `agentlocks --version` | 30 | 91.67 ms | 107.59 ms | 86.97 ms | 108.40 ms |
| `acquire <file> --reason benchmark --id-only` | 30 | 98.86 ms | 143.21 ms | 93.12 ms | 157.89 ms |
| `status --json` | 30 | 94.30 ms | 108.90 ms | 89.06 ms | 109.26 ms |
| `release <lock> --id-only` | 30 | 97.28 ms | 123.83 ms | 93.44 ms | 130.39 ms |

Commands used for the size baseline:

```bash
wc -c dist/agentlocks.mjs
npm pack --dry-run --json --ignore-scripts
```

The next agent must replace the timing snapshot and size snapshot with repeatable Phase 0 artifacts
before making improvement claims.

## Critical Optimization Gates

### Gate 1: Behavior Before Bytes

Every size reduction must pass the lock behavior suite and preserve generated output contracts.

Required proof:

- `bun test`
- `bun run typecheck`
- `bun run lint`
- `bun run check`
- conformance scenario against `dist/agentlocks.mjs`
- golden comparison for help, capabilities, robot docs, JSON errors, and package dry-run metadata

No byte reduction is worth deleting a contract accidentally.

### Gate 2: Startup Floor Before Hot Path Claims

Most current wall time is Node process startup. Do not claim that the lock core is slow until the
benchmark separates:

- empty Node startup,
- CLI parse and dispatch,
- config/root discovery,
- lock registry mutex acquisition,
- active lock scanning and conflict matching,
- output rendering.

The primary latency metric is wall time because users feel it. The secondary metric is a paired
delta against adjacent `node -e ''` samples from the same loop. Do not subtract independent
aggregates; the variance of that difference is larger than either input and will make small wins
look more precise than they are.

### Gate 3: One Lever Per Commit

Use the optimization scorecard before editing:

```text
score = impact x confidence / effort
```

Use anchored scales so two agents can reproduce the same decision:

| Factor | Scale |
| --- | --- |
| Impact | 1 = <2 KB or <2 ms, 2 = 2-5 KB or 2-5 ms, 3 = 5-15 KB or 5-10 ms, 4 = 15-30 KB or 10-20 ms, 5 = >30 KB or >20 ms |
| Confidence | 1 = hypothesis only, 2 = source evidence, 3 = one local measurement, 4 = repeated local measurement + tests, 5 = repeated measurement + attribution + regression guard |
| Effort | 1 = one small file/test, 2 = local refactor, 3 = cross-module change, 4 = parser/registry behavior change, 5 = broad rewrite or new dependency |

Apply the `score >= 2.0` gate independently per axis: keep a size scoreboard and a latency
scoreboard. A candidate touching both axes is scored on the axis it primarily moves, with the other
axis recorded as a side effect. The side-effect axis must also clear a no-regression bar: bundle
and pack bytes must not increase, and paired latency p50/p95 must stay within the variance envelope,
or the candidate is rejected regardless of its primary-axis score. Each passing logic chunk gets its
own commit after `bun run check`, per repository policy. Do not bundle parser rewrites, registry I/O
changes, and bundle-script changes into one commit.

### Gate 4: No Compatibility Layers

Agentlocks is not live yet. If a contract changes, update implementation, tests, docs, generated
instructions, and wiki in place. Do not add deprecated aliases, migration paths, fallback schemas,
or old report formats to preserve earlier internal layouts.

### Gate 5: No Dependency Churn Without Evidence

Default to removing bytes and simplifying code before adding packages. If a package is proposed:

- use `bun add` or `bun pm view`,
- record publish timestamp evidence,
- reject packages published less than seven days ago,
- explain why the package reduces size or latency enough to pay for supply-chain risk.

For this plan, new dependencies are presumed unnecessary until a measured candidate proves
otherwise.

## Agent Model And Harness Split

Use Codex and Claude Code as different reviewers, not duplicate agents.

| Lane | Harness | Strength | Owns |
| --- | --- | --- | --- |
| Measurement and implementation | Codex | Repo inspection, benchmark scripts, tests, focused edits | Baselines, bundle analysis, lock hot-path patches |
| Cross-model reviewer | Claude Code via `claude -p` | Plan critique, missed tradeoffs, human-readable rubric | Plan review and implementation-review scorecards |
| Synthesis | Codex in this repo | Grounding, file edits, final decisions | Apply or reject review findings with source evidence |
| Human | Maintainer | Irreversible product calls | Approval for release, package adoption, externally visible claims |

Cross-review rule:

- Codex writes grounded artifacts and implementation patches.
- Claude reviews the plan or diff with an explicit rubric and numeric score.
- Codex applies only Claude findings that are technically true, repo-compatible, and useful.
- Rejected findings are recorded with a short reason.

## Skill Inventory And Adaptations

The loaded skill list is large. Route by fit; do not run every skill blindly.

### Core Skills To Use

| Skill | Use | Adaptation for this repo |
| --- | --- | --- |
| `planning-workflow` | Keep this plan self-contained and reviewable | Use the existing local plan format, not a giant architecture rewrite |
| `profiling-software-performance` | Produce ranked latency and size-attribution evidence before optimizing | Use Node CLI scenarios, npm pack metadata, Bun metafiles, and temp worktrees |
| `extreme-software-optimization` | Drive the improvement loop | Baseline, profile, prove behavior unchanged, implement one scored lever, verify, repeat |
| `testing-golden-artifacts` | Freeze complex CLI outputs and package metadata | Golden help text, `capabilities --json`, `robot-docs guide`, JSON errors, pack dry-run files |
| `testing-conformance-harnesses` | Turn the CLI contract into a coverage matrix | Track MUST/SHOULD clauses for lock semantics, exit codes, JSON fields, generated instructions |
| `simplify-and-refactor-code-isomorphically` | Shrink accidental code while preserving behavior | Use only when it reduces bundle size or hot-path work with an isomorphism proof |
| `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` | Score agent-facing command surfaces | Borrow scoring discipline and parseable-output rules; do not add aliases or prompt-specific defaults |
| `codebase-archaeology` | Map current command dispatch, config loading, and registry I/O before edits | Keep exploration narrow and source-backed |
| `code-review` | Review implementation diffs before commit | Focus on correctness, security, performance regressions, and test gaps |
| `multi-model-triangulation` | Cross-validate high-impact choices | Adapt from copy-paste flow to local `claude -p`; optional other models only if explicitly available |

### Secondary Skills To Use If The Run Expands

| Skill | Use |
| --- | --- |
| `deadlock-finder-and-fixer` | Audit registry mutex changes, lock lifecycle changes, and contention behavior |
| `testing-fuzzing` | Stress resource normalization and conflict matching after algorithmic changes |
| `testing-metamorphic` | Verify order-independent resource sets and equivalent path/glob formulations |
| `mock-code-finder` | Check for dead stubs or placeholder code before bundle-size work |
| `release-preparations` | Re-run pack/install checks before publishing a size/latency release |
| `gh-actions` | Add CI budget checks after benchmarks stabilize |
| `beads-workflow`, `beads-br`, `beads-bv` | Convert this plan into a dependency-aware task graph if multiple agents execute it |
| `agent-mail` | Coordinate locks and ownership if multiple agents work concurrently |

### Skills To Treat As Out Of Scope

SaaS billing, Stripe, Supabase, cloud deployment, presentations, spreadsheets, estate planning,
Slack migration, social launch, visual asset, and docs-site skills are not part of this performance
plan unless the maintainer explicitly changes scope.

## Repository Coordination Rules

All agents must follow `AGENTS.md`.

Before touching files:

```bash
bun run --silent agentlocks -- acquire '<path>' '<path>' --reason "<intent>" --id-only
```

If new files become necessary:

```bash
bun run --silent agentlocks -- expand '<path>' '<path>' --lock <lock_id>
```

Before staging:

```bash
bun run --silent agentlocks -- refresh <lock_id>
bun run --silent agentlocks -- git begin --refresh-lock <lock_id> --reason "<commit intent>" --id-only
```

Stage only locked paths. Release after commit:

```bash
bun run --silent agentlocks -- git end <git_lock_id> --release-lock <lock_id>
```

For this plan, use these artifact paths:

| Artifact type | Path |
| --- | --- |
| Performance baselines | `analyses/performance-baseline/` |
| Benchmark harness scripts | `scripts/performance/` |
| Golden artifacts | `tests/goldens/performance/` or existing golden paths |
| Bundle analysis | `analyses/performance-baseline/bundle/` |
| Hotspot tables | `analyses/performance-baseline/hotspots/` |
| Decision log | `analyses/performance-baseline/decisions.md` |
| Claude raw reviews | `${CODEX_HOME:-$HOME/.codex}/artifacts/` |

Create these paths only when a phase reaches them, and acquire locks first.

## End-To-End Pipeline

### Phase 0: Bootstrap, Lock, And Baseline

Owner: Codex.

Purpose: establish exact current truth before optimizing anything.

Commands:

```bash
git status --short
git rev-parse --short HEAD
git diff --quiet -- . && git diff --cached --quiet -- . || {
  echo "Phase 0 baseline must run from a clean committed checkout. Commit or stash all local work, including this plan, before measuring." >&2
  exit 1
}
bun --version
node --version
bun run build
wc -c dist/agentlocks.mjs
gzip -9c dist/agentlocks.mjs | wc -c
npm pack --dry-run --json --ignore-scripts
node dist/agentlocks.mjs --version
node dist/agentlocks.mjs --help
```

`npm pack --dry-run --json --ignore-scripts` is valid only immediately after `bun run build`,
because `--ignore-scripts` skips `prepack`. Either assert `dist/agentlocks.mjs` was just rebuilt in
the same Phase 0 step or run a second pack check without `--ignore-scripts` when validating publish
behavior.

Benchmark requirements:

- Benchmark in a temporary directory, not the repo's real `.agentlocks`.
- Capture `node -e ''` startup floor in the same run, interleaved with command samples.
- Run warmups before measurements.
- Use at least 200 measured iterations for p95. Report p99 only when n >= 1000.
- Hold active-lock-set size constant per measured sample. For acquire at count N, reset to a fresh
  temp registry or release the just-acquired lock before each sample. For release, refresh, and
  `git end`, create the target lock in an unmeasured setup step immediately before each measured
  sample.
- Record p50, p95, min, max, sample count, bootstrap confidence interval, git SHA, host, Node,
  Bun, and command.
- Record load average and run-to-run startup-floor drift. Reject runs whose `node -e ''` median
  drifts beyond the configured variance envelope between interleaved blocks, and replicate material
  wins across two independent sessions before treating sub-5 ms changes as real.
- Benchmark both direct invocation (`node dist/agentlocks.mjs`) and the installed bin shim from a
  dry-run package install or equivalent local shim path.
- Include scaling cases with 0, 1, 10, 100, and 1000 active locks.
- Include no-conflict, conflict, refresh, release, status, `git begin`, and `git end`.

Outputs:

- `analyses/performance-baseline/env.md`
- `analyses/performance-baseline/size.json`
- `analyses/performance-baseline/latency.json`
- `analyses/performance-baseline/summary.md`

Exit gate:

- Baseline artifacts exist and can be regenerated.
- No untracked benchmark junk is left in the repo.
- No optimization has been attempted yet.

### Phase 1: Contract Capture Before Optimization

Owner: Codex.

Purpose: freeze behavior so size and latency changes can be aggressive without becoming vague.

Work items:

- Capture golden outputs for `--help`, `--version`, `capabilities --json`, `robot-docs guide`,
  representative acquire/conflict/release/status JSON, and JSON error output.
- Run those goldens against both the TypeScript source entry and the built production bundle
  (`node dist/agentlocks.mjs`) so minifier, target, and shebang regressions cannot hide.
- Run at least `--help`, `--version`, and one JSON error golden through the packed-and-installed bin
  shim too, because `scripts/build-bundle.mjs` rewrites the shebang and executable bit.
- Add structural bundle assertions independent of PATH: first line of `dist/agentlocks.mjs` is
  exactly `#!/usr/bin/env node` and file mode is executable (`0o755` on POSIX).
- Run packed-shim goldens with a PATH that excludes Bun after confirming Bun is not available there,
  so a regressed `#!/usr/bin/env bun` shebang cannot pass just because this development host has Bun.
- Canonicalize dynamic fields such as timestamps, lock ids, temp paths, hostnames, and pids.
- Build a conformance matrix from current CLI contracts and tests.
- Add a package dry-run golden or structural assertion for packed entries and bundle mode.
- Confirm generated instruction text stays aligned with the public CLI surface.
- Add a conflict-semantics conformance row for stale-but-not-dead overlapping locks: they must
  still block acquire unless the liveness probe classifies them as dead/reclaimable.
- Add an invariant row for liveness probe gating: the existing `findConflicts` overlap check must
  continue to use the same `conflictingResources` predicate that constructs conflict resources, so a
  cheaper overlap heuristic cannot silently widen probe-skipping.
- The liveness invariant test should track two separate sets across randomized resource/lock
  fixtures: classified locks are exactly `{ lock | conflictingResources(requested, lock.resources).length > 0 }`,
  and session-probed locks are exactly `{ lock | overlap(lock) && Date.parse(lock.leaseExpiresAt) < now }`.
  Non-expired overlapping locks should be classified as held without invoking the liveness probe.

Exit gate:

- Golden updates are reviewable.
- Conformance matrix names every relevant MUST/SHOULD clause.
- A future parser or registry change can fail tests if it drifts output accidentally.

### Phase 2: Bundle Attribution

Owner: Codex.

Purpose: find the bytes before deleting them.

Commands:

```bash
bun build bin/agentlocks.ts --target=node --minify --outfile /tmp/agentlocks.mjs \
  --metafile analyses/performance-baseline/bundle/metafile.json \
  --metafile-md analyses/performance-baseline/bundle/metafile.md
wc -c /tmp/agentlocks.mjs
```

Work items:

- Rank modules by bundled byte contribution, but treat Bun metafile data as pre-minify attribution.
- Compare `commander`, embedded hook scripts, package metadata import, command renderers, and registry
  code by size.
- Confirm the top three cut candidates with build-and-measure deltas against the minified output;
  do not rely solely on `--metafile` rankings.
- Check whether `package.json` imports inline more metadata than necessary.
- Check whether generated hook script bodies dominate the bundle.
- Check whether command dispatch imports force code that could be delayed, simplified, or generated
  smaller.
- Check README/CHANGELOG contribution to npm pack size, but do not cut useful docs just to win bytes.

Opportunity matrix:

| Candidate | Size impact | Latency impact | Confidence | Effort | Score | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Replace all `package.json` imports with generated name/version constants | TBD | Low | TBD | TBD | TBD | Must remove all three import sites: `program.ts`, `capabilities.ts`, `update-notice.ts` |
| Reduce or generate hook script payloads | TBD | Low | TBD | TBD | TBD | TBD |
| Replace Commander with a minimal parser | TBD | High | TBD | TBD | TBD | TBD |
| Simplify duplicated renderers or schemas | TBD | Medium | TBD | TBD | TBD | TBD |
| Externalize dependencies | Negative for install simplicity | Maybe | Low | High | likely reject | Reject unless proven |

Source-hygiene candidates that do not move shipped metrics stay out of both scoreboards. Example:
unused `stableStringify` / `sortJsonValue` in `src/json.ts` are tree-shaken from
`dist/agentlocks.mjs` today, so removing them is not a build-size optimization unless
build-and-measure proves shipped bytes change.

Exit gate:

- Top byte contributors are ranked from an artifact, not guessed.
- Every candidate has a score.
- No candidate below `score >= 2.0` moves to implementation.

### Phase 3: Latency Attribution

Owner: Codex.

Purpose: identify actual hot paths for common commands.

Scenarios:

- `--version`
- `--help`
- `acquire <path> --reason benchmark --id-only`
- `acquire <path> --reason benchmark --json`
- `acquire` conflict path with 1 and 100 active locks
- `refresh <lock> --id-only`
- `release <lock> --id-only`
- `status --json`
- `git begin --refresh-lock <lock> --reason benchmark --id-only`
- `git end <git_lock> --release-lock <lock> --id-only`

Attribution requirements:

- Separate startup floor from command overhead.
- Measure module load, V8 compile, and top-level evaluation as a distinct fixed-cost bucket. Use a
  perf-harness entry that imports the full CLI module graph and exits before dispatch, then compare
  it with `node -e ''`. This is the cross-axis bridge that shows whether bundle-size reductions
  also reduce command latency.
- Time parse/dispatch, config/root load, mutex wait, active lock read, conflict matching, lock write,
  event append, liveness probing, and output formatting.
- Default to a separate non-shipped instrumentation harness entry that `bin/agentlocks.ts` never
  imports. If shared instrumentation becomes necessary, first update `scripts/build-bundle.mjs` to
  pass `--define AGENTLOCKS_PERF=false` and add an ambient `declare const AGENTLOCKS_PERF: boolean`
  so `bun run typecheck` remains green. A runtime `process.env.AGENTLOCKS_PERF` branch is not enough
  because `bun build --minify` will keep the branch body in the production bundle; an imported
  constant is also not enough unless the production-bundle assertion proves it was eliminated.
- Add a production-bundle assertion that no perf-instrumentation symbols ship in
  `dist/agentlocks.mjs`.
- Re-run scaling cases after every optimization because bottlenecks move.

Exit gate:

- Top five hotspots are ranked with artifact paths.
- At least one hotspot ties directly to a common command.
- Implementation candidates are scored before edits.

### Phase 4: First Build-Size Lever

Owner: Codex implements; Claude reviews the plan/diff if the candidate is broad.

Pick the highest-scoring size candidate. Likely candidates, pending Phase 2 evidence:

- Replace every `package.json` import with a tiny committed `src/version.ts` that exports the
  package `name` and `version`, plus a test or CI script that asserts those constants equal
  `package.json`. All current import sites must be removed together (`src/cli/program.ts`,
  `src/cli/capabilities.ts`, and `src/cli/update-notice.ts`) or Bun will still inline the full
  package object and save zero bytes.
- Shrink embedded generated scripts without changing generated output.
- Remove unreachable code from the production entry.
- Collapse duplicated output helpers that survive minification poorly.
- Replace Commander only if goldens and byte/latency evidence make the rewrite worth the risk.

Required proof per change:

```text
Change: <description>
Bundle bytes before:
Bundle bytes after:
npm dry-run packed size before:
npm dry-run packed size after:
Behavior proof:
Golden outputs:
Conformance rows affected:
Bundle string check: package metadata strings such as `devDependencies` and `packageManager` absent when the version-constant candidate claims success.
Rollback command: git revert <sha>
```

Exit gate:

- `bun run check` green.
- Bundle and pack size improved or the exception is justified.
- Golden/conformance outputs unchanged unless deliberately updated.
- Commit made if logic was implemented and unit tested.

### Phase 5: First Latency Lever

Owner: Codex implements; Claude reviews high-risk changes.

Pick the highest-scoring latency candidate. Likely candidates, pending Phase 3 evidence:

- Fast-path `--version` and possibly `--help` before full command construction where safe.
- Reduce Commander parse/dispatch overhead, or replace Commander after contract capture.
- Avoid unnecessary dynamic config import/stat work on commands that do not need it.
- Reduce active-lock JSON parse work when a command targets a known lock id.
- Optimize status and conflict matching for large active-lock sets.
- Optimize registry sorts for large active-lock sets, including replacing `localeCompare` only after
  a differential characterization test proves the replacement comparator produces identical
  ordering for a randomized corpus of valid lock ids. Change both lock-id sort sites together and do
  not extend the comparator to user-supplied resource paths. Pin ordering with the differential test
  and `status --json` golden.
- Avoid unnecessary sibling lease scans on no-conflict mutations.
- Do not re-implement the liveness-probe overlap gate. `findConflicts` already skips probes only
  when `conflictingResources` returns no overlap; the work item is to guard that invariant with a
  conformance/metamorphic test, not to add a new heuristic.
- Reduce per-write `JSON.stringify(value, null, 2)` cost in lock writes only if profiling proves it
  matters. `formatJsonArtifact` does not sort. Tree-shaken helpers in `src/json.ts` are source
  hygiene only unless they measurably affect shipped bytes.

Required proof per change:

```text
Change: <description>
Command benchmark before:
Command benchmark after:
Node startup floor:
Paired command-vs-floor delta and bootstrap CI:
Correctness proof:
Golden outputs:
Conformance rows affected:
Rollback command: git revert <sha>
```

Exit gate:

- Common command latency improves in p50 and does not regress p95 beyond the variance envelope.
- Scaling cases do not regress.
- `bun run check` green.
- Commit made if logic was implemented and unit tested.

### Phase 6: Shared Parser And Dispatch Decision

Owner: Codex drafts; Claude reviews with rubric.

This is the main cross-axis decision. Commander may contribute both bytes and latency, but replacing
it is high-risk because it owns help text, parse errors, typo handling, exit behavior, and command
surface predictability.

Decision options:

| Option | When to choose | Risks |
| --- | --- | --- |
| Keep Commander | Commander is not a top byte or latency contributor | Leaves some size/startup cost |
| Wrap Commander with fast paths | `--version`, `--help`, or id-only paths dominate user latency | Split behavior between parsers |
| Replace Commander with minimal parser | Commander is top contributor and goldens fully pin behavior | Reimplementation bugs and help drift |

Hard gate before replacement:

- Existing CLI parse/error/help behavior is fully golden-tested.
- Claude review score is >= 85/100 with no P0 or P1 findings.
- Codex has a rollback plan.
- The projected score is `impact x confidence / effort >= 2.0`.

### Phase 7: CI Budgets And Regression Guards

Owner: Codex.

Purpose: keep wins from drifting away.

Work items:

- Add a deterministic size-budget check for `dist/agentlocks.mjs`.
- Add npm dry-run structural checks for packed entries.
- Add benchmark script with JSON output.
- Add a non-flaky latency budget only after enough samples exist to set a defensible threshold.
- Prefer warning/report mode for latency in CI until variance is understood.
- Keep benchmark artifacts out of normal npm package contents.

Exit gate:

- Size regression fails locally and in CI.
- Latency benchmark can be run by agents without installing extra tools.
- CI does not become flaky because of wall-clock noise.

### Phase 8: Repeat Until Saturation

Owner: Codex with Claude review on broad changes.

Loop:

1. Rebuild and remeasure.
2. Re-rank bundle bytes and latency hotspots.
3. Score all remaining candidates.
4. Implement the highest-scoring candidate only if `score >= 2.0`.
5. Prove behavior unchanged.
6. Run `bun run check`.
7. Commit the tested chunk.
8. Ask Claude for rubric review if the change is broad or the plan changes.
9. Stop when no candidate scores >= 2.0, targets are met, or a human gate is reached.

## Claude Plan Review Loop

Use this loop for the plan itself and for high-risk implementation diffs.

### Step 1: Codex Produces Grounded Draft

Codex reads local repo files, benchmark artifacts, bundle metadata, and tests. Each claim is labeled:

- `confirmed`: verified locally or by artifact.
- `likely`: inferred from current evidence.
- `hypothesis`: plausible optimization candidate needing measurement.

### Step 2: Claude Code Reviews With Rubric And Score

Run:

```bash
review_path="${CODEX_HOME:-$HOME/.codex}/artifacts/claude-agentlocks-build-size-latency-plan-review-$(date -u +%Y%m%dT%H%M%SZ).md"
review_log="${review_path%.md}.log"
mkdir -p "$(dirname "$review_path")"
claude -p "In the current repo, read BUILD_SIZE_LATENCY_PLAN.md and review it as an Agentlocks build-size and common-command latency improvement plan. Return exactly this structure: # Claude Review; ## Overall Score with <0-100>/100; ## Dimension Scores markdown table with rows Build-size leverage max 20, Latency rigor max 20, Measurement validity max 15, Correctness safety max 15, Skill integration max 10, Task decomposition max 10, Agentlocks policy compliance max 10; ## Findings sorted P0 then P1 then P2, each with Severity, Plan section, Problem, Concrete edit; ## Missing Tests Or Artifacts; ## Verdict using APPROVE only if score >= 85 and no P0/P1 findings, otherwise REVISE. Be adversarial and specific; focus on missed correctness risks, weak metrics, unrealistic latency goals, build-size blind spots, and bad sequencing." > "$review_path" 2> "$review_log"
status=$?
if [ "$status" -ne 0 ] || [ ! -s "$review_path" ] || ! grep -q '^## Overall Score' "$review_path"; then
  printf 'Claude review failed or produced an unparsable artifact. status=%s review=%s log=%s\n' "$status" "$review_path" "$review_log" >&2
  exit 1
fi
printf 'CLAUDE_REVIEW_PATH=%s\n' "$review_path"
```

Claude Code can take several minutes. Do not kill it solely because it is slow; wait until the
process exits, then read the artifact. The direct redirection keeps the review output attached even
when the process runs longer than an interactive polling interval.
Parse only `$review_path` for `## Overall Score`, findings, and verdict; `$review_log` is diagnostic
stderr and must not participate in the review gate.

### Step 3: Codex Integrates Or Rejects

Codex applies only changes that are:

- technically true,
- compatible with Agentlocks' CLI contract,
- aligned with repo policy,
- useful for size or latency goals.

Rejected changes go into `analyses/performance-baseline/decisions.md` when the execution run creates
that artifact set.

### Step 4: Review Gate

Before implementation starts, the plan should reach:

- Claude overall score >= 85/100,
- no P0 findings,
- no unresolved P1 findings,
- clear first three implementation chunks.

## Ready-To-Run Goal Prompt

Use this prompt to execute the full goal:

```text
Goal: Execute BUILD_SIZE_LATENCY_PLAN.md for agentlocks end to end.

Optimize on two axes: minimize production build size and minimize common command latency for
`acquire`, `refresh`, `release`, `status`, `git begin`, and `git end`. Lower is better, but lock
correctness, JSON contracts, help text, generated instructions, and package integrity must not
regress.

Use Codex as the measurement, implementation, and synthesis lane. Use Claude Code via local
`claude -p` as the cross-model reviewer. Claude reviews must return a rubric, dimension scores,
overall score out of 100, prioritized findings, missing tests/artifacts, and an APPROVE or REVISE
verdict.

Follow repository `AGENTS.md` exactly: commit straight to `main` unless a human explicitly gates the
change, acquire narrow Agentlocks locks before editing, refresh before staging, acquire the
synthetic Git-index lock before committing, stage only locked paths, run `bun run check` before each
commit, and release locks promptly.

Start with Phase 0 and Phase 1 from a clean committed SHA. Do not optimize until the clean-size
baseline, paired-sampling benchmark harness, built-bundle goldens, and conformance matrix exist. The
latency harness must interleave `node -e ''` with command samples, keep active-lock-set size
constant per measured sample, isolate module load/V8 compile/top-level eval cost, include direct
`node dist/agentlocks.mjs` and installed-shim variants, run enough samples for stable p95, and
report bootstrap confidence intervals for paired deltas. Then run the loop:
1. Build and measure.
2. Rank bundle bytes and latency hotspots with artifacts.
3. Score candidates as impact x confidence / effort.
4. Implement exactly one candidate with score >= 2.0.
5. Prove behavior unchanged with tests, goldens, and conformance rows.
6. Run `bun run check`.
7. Commit the tested chunk.
8. Re-measure and re-rank.
9. Ask Claude for rubric review on the plan or any broad/high-risk diff.
10. Stop when no candidate scores >= 2.0, targets are met, or a human approval gate is reached.

Do not add command aliases, prompt-optimization behavior, repository-specific defaults,
compatibility layers, migration paths, deprecated flags, or new dependencies without package-age
evidence and a measured score that justifies the risk.

Do not optimize liveness probing by changing conflict semantics. `findConflicts` already skips
probes when `conflictingResources` finds zero overlap; preserve that predicate and add regression
coverage. A stale overlapping lock remains a conflict unless the liveness probe classifies it as
dead/reclaimable.
```

## Phase-To-Skill Routing

| Phase | Primary skills | Secondary skills |
| --- | --- | --- |
| 0 Baseline | `profiling-software-performance`, `codebase-archaeology` | `codebase-report` |
| 1 Contract capture | `testing-golden-artifacts`, `testing-conformance-harnesses` | `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` |
| 2 Bundle attribution | `profiling-software-performance`, `simplify-and-refactor-code-isomorphically` | `mock-code-finder` |
| 3 Latency attribution | `profiling-software-performance` | `deadlock-finder-and-fixer` |
| 4 Build-size lever | `extreme-software-optimization`, `testing-golden-artifacts` | `code-review` |
| 5 Latency lever | `extreme-software-optimization`, `testing-conformance-harnesses` | `testing-fuzzing`, `testing-metamorphic` |
| 6 Parser decision | `planning-workflow`, `multi-model-triangulation`, `code-review` | `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` |
| 7 CI budgets | `gh-actions`, `release-preparations` | `codebase-audit` |
| 8 Repeat loop | `extreme-software-optimization`, `multi-model-triangulation` | `beads-workflow`, `agent-mail` |

## Stop Conditions

Hard blockers:

- `bun run check` red.
- Golden or conformance drift that is not intentionally updated.
- Benchmark harness cannot reproduce a baseline.
- Claude review score below 85 for a broad/high-risk plan change.
- Any P0 Claude finding unresolved.
- Parser replacement proposed before contract capture is complete.
- New dependency proposed without package-age evidence.
- Unrelated worktree changes would be staged or overwritten.

Non-blockers:

- `hyperfine` is unavailable; use the local Node benchmark harness.
- Bundle cannot reach stretch target because correctness-critical code dominates.
- Latency cannot beat the measured Node startup floor.
- CI latency budgets start in report-only mode while variance is characterized.

## Evidence Sources To Recheck During Execution

- Local package contract: `package.json`, `scripts/build-bundle.mjs`, `bin/agentlocks.ts`.
- CLI parser and help: `src/cli/program.ts`, `src/cli/index.ts`, `tests/cli.test.ts`.
- Lock core: `src/locks/registry.ts`, `src/locks/commands.ts`, `src/locks/matching.ts`,
  `src/locks/resources.ts`, `src/locks/session.ts`.
- Generated instructions and hooks: `src/init.ts`, `src/cli/commit-hook-script.ts`,
  `tests/commit-hook.test.ts`, `tests/init.test.ts`.
- Current goldens: `tests/goldens/`.
- Build output: `dist/agentlocks.mjs`.
- Package dry run: `npm pack --dry-run --json --ignore-scripts`.
- Bun build analyzer: `bun build --metafile=<path> --metafile-md=<path>`.

## Final Notes

The order matters:

1. Baseline.
2. Contract capture.
3. Attribution.
4. One scored size lever.
5. One scored latency lever.
6. Re-measure.
7. Repeat.

Do not start with the most dramatic rewrite. If a tiny generated-version constant saves bytes with
near-zero risk, take that first. If replacing Commander saves both bytes and latency, it still waits
until help, errors, JSON contracts, and generated docs are pinned tightly enough that a custom parser
cannot drift unnoticed.
