# Active Lock Read Path Optimization

## Change

`FileLockRegistry.readActiveLocks` now reads active lock files concurrently, while preserving sorted
public output for status, board, prune, acquire conflict reporting, and other public surfaces. The
internal sibling keep-alive scan skips sorting because it does not expose active-set order. New
active lock records are serialized as compact JSON, and the latency benchmark fixtures now match
that production serialization.

## Measurement Setup

- Pre-change comparator: clean `2d67e34` after package metadata injection.
- Post-change comparator: clean `829b833`.
- Command: `node scripts/performance/latency-benchmark.mjs --out-dir <tmp> --samples 80
  --warmups 5 --bootstrap 300 --variants direct --active-counts 1,1000 --scenarios
  acquire_no_conflict,refresh,status_json,git_begin`.
- The harness interleaves `node -e ''`, keeps active-lock-set size constant per sample, and reports
  paired command-minus-Node-floor deltas with bootstrap CIs.

## Latency Result

Direct production bundle, paired delta milliseconds.

| Scenario | Active locks | Pre p50 | Post p50 | Delta p50 | Pre p95 | Post p95 | Delta p95 | Post p50 CI | Post p95 CI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `acquire_no_conflict` | 1 | 41.15 | 32.90 | -8.25 | 52.78 | 37.24 | -15.55 | 32.23..33.22 | 35.93..37.98 |
| `acquire_no_conflict` | 1000 | 169.97 | 94.45 | -75.52 | 197.71 | 106.57 | -91.15 | 93.52..95.27 | 102.59..108.56 |
| `refresh` | 1 | 31.68 | 31.16 | -0.53 | 37.46 | 36.57 | -0.88 | 30.41..32.34 | 35.12..37.34 |
| `refresh` | 1000 | 105.62 | 57.48 | -48.14 | 127.31 | 64.70 | -62.61 | 56.63..58.64 | 61.85..67.39 |
| `status_json` | 1 | 27.64 | 26.66 | -0.98 | 32.27 | 31.95 | -0.32 | 26.34..27.40 | 29.68..33.37 |
| `status_json` | 1000 | 106.63 | 71.17 | -35.46 | 132.39 | 78.01 | -54.37 | 69.48..72.01 | 76.09..81.20 |
| `git_begin` | 1 | 41.90 | 32.44 | -9.46 | 45.90 | 38.12 | -7.78 | 31.48..33.19 | 36.31..39.59 |
| `git_begin` | 1000 | 244.37 | 135.97 | -108.41 | 272.32 | 148.13 | -124.20 | 134.43..137.04 | 141.60..150.23 |

The largest target cases improved by 54.37 ms to 124.20 ms at p95 paired delta. The 1-lock cases
did not show a material regression; the small p95 changes are within the baseline drift thresholds.

## Size Side Effect

Measured with `node scripts/performance/measure-size.mjs --out-dir /tmp/agentlocks-readpath-clean`
at clean `829b833`.

| Metric | Phase 0 baseline | After package metadata | After read path | Delta vs Phase 0 | Delta vs previous |
| --- | ---: | ---: | ---: | ---: | ---: |
| `dist/agentlocks.mjs` raw bytes | 170145 | 168868 | 168892 | -1253 | +24 |
| `gzip -9 dist/agentlocks.mjs` bytes | 46358 | 45801 | 45806 | -552 | +5 |
| `npm pack --dry-run --json --ignore-scripts` bytes | 64443 | 63876 | 63899 | -544 | +23 |

The round adds 24 raw bytes versus the previous commit, but remains well below Phase 0 and buys a
large p95 latency reduction on read-heavy common commands. This is the recorded size exception for
the latency win.

## Behavior Proof

- `bun test tests/locks.test.ts tests/concurrency.test.ts tests/performance-contract.test.ts
  tests/performance-scripts.test.ts` passed with 39 tests before commit.
- `bun run check` passed with 166 tests, typecheck, and lint before commit.
- Cross-process built-bundle contention still proves exactly one same-resource acquirer wins.
- A focused lock-file test asserts active lock records remain valid JSON and are compact on disk.
- Public status/order surfaces still call the sorted read path.

## Risk And Rollback

The correctness-sensitive mutex boundary is unchanged. The change only parallelizes file reads under
the existing atomic-directory mutex where mutations already hold it, and preserves sorted public
rendering. If this chunk needs to be reverted, use `git revert 829b833`.
