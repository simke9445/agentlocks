# Final Performance Sweep

## Scope

This artifact records the final post-optimization validation sweep and the follow-up recheck for the
only noisy p95 case. It complements the committed Phase 0 baseline artifacts and the per-lever proof
files.

## Full Sweep

- Command: `node scripts/performance/measure-size.mjs --out-dir /tmp/agentlocks-final-sweep`
  followed by `node scripts/performance/latency-benchmark.mjs --out-dir
  /tmp/agentlocks-final-sweep`.
- Measured SHA: `078e85c`.
- Worktree state: clean.
- Latency matrix: 63 cases, direct + installed-shim variants, 0/1/10/100/1000 active locks, 200
  samples and 10 warmups per case.
- Startup-floor drift: worst case 0.0655, below the committed 0.08 rejection threshold.

## Size Result

The full sweep measured the optimized tree before later release-only version/changelog commits:

| Metric | Phase 0 baseline | Full sweep (`078e85c`) | Delta |
| --- | ---: | ---: | ---: |
| `dist/agentlocks.mjs` raw bytes | 170145 | 168892 | -1253 |
| `gzip -9 dist/agentlocks.mjs` bytes | 46358 | 45806 | -552 |
| `npm pack --dry-run --json --ignore-scripts` bytes | 64443 | 63899 | -544 |

Current HEAD after release commit `e783970` was rechecked separately:

| Metric | Current HEAD `e783970` |
| --- | ---: |
| `dist/agentlocks.mjs` raw bytes | 168892 |
| `gzip -9 dist/agentlocks.mjs` bytes | 45810 |
| `npm pack --dry-run --json --ignore-scripts` bytes | 64113 |

The current pack increase is from release changelog growth, not bundled runtime code.

## Latency Result

Representative paired p95 deltas versus Phase 0:

| Variant | Scenario | Active locks | Phase 0 p95 | Final p95 | Delta |
| --- | --- | ---: | ---: | ---: | ---: |
| direct | `acquire_no_conflict` | 1000 | 240.61 | 105.63 | -134.98 |
| direct | `refresh` | 1000 | 129.03 | 68.99 | -60.04 |
| direct | `status_json` | 1000 | 127.46 | 81.58 | -45.87 |
| direct | `git_begin` | 1000 | 304.82 | 148.30 | -156.53 |
| shim | `acquire_no_conflict` | 1000 | 212.39 | 109.63 | -102.76 |
| shim | `refresh` | 1000 | 131.00 | 69.88 | -61.13 |
| shim | `status_json` | 1000 | 129.70 | 92.03 | -37.66 |
| shim | `git_begin` | 1000 | 341.54 | 178.68 | -162.86 |

Common 0/1-lock paths remained startup-bound and mostly flat or slightly better. `release` and
`git_end` are expected to stay near the fixed startup floor because they target known lock ids and
do not scan the active set.

## Outlier Recheck

The full sweep showed one installed-shim `git_end` p95 outlier at one active lock:

| Case | Phase 0 p95 | Full sweep p95 | Delta |
| --- | ---: | ---: | ---: |
| shim `git_end`, 1 active lock | 39.84 | 50.93 | +11.09 |

It was immediately rechecked on clean current HEAD `e783970`:

| Case | Phase 0 p95 | Recheck p95 | Delta | Recheck p95 CI |
| --- | ---: | ---: | ---: | --- |
| shim `git_end`, 1 active lock | 39.84 | 38.72 | -1.13 | 36.97..41.12 |

The replicated run does not support a `git_end` regression claim.

## Current Verification

- `bun run check` passed at current HEAD `e783970`: 166 tests, typecheck, and lint. The only lint
  warning is the known large committed Phase 0 `latency.json` artifact.
- Current HEAD size recheck passed the deterministic bundle/pack budgets in
  `tests/performance-contract.test.ts`.
- Agentlocks lock status was clean before the final artifacts were written. A separate agent later
  acquired `tests/performance-contract.test.ts` for a Windows portability fix; this final-sweep
  artifact does not touch that file.

## Claude Implementation Review

- Artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-build-size-latency-implementation-review-20260604T194542Z.md`
- Overall score: 87/100.
- Verdict: APPROVE.
- P0/P1 findings: none.
- Non-blocking findings recorded for future work: widen the very tight size-budget headroom,
  split/attribute the active-lock read and compact-record levers more precisely, and tame the large
  committed `latency.json` lint warning.
