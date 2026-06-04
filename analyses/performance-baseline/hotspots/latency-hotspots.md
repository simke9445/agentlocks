# Latency Hotspots

Source: `analyses/performance-baseline/latency.json` at clean SHA `e5537fa`.

## Fixed Cost

The module-load harness imports the production CLI module graph and exits before dispatch:

| Variant | p50 wall ms | p95 wall ms | p50 paired delta vs `node -e ''` | p95 paired delta |
| --- | ---: | ---: | ---: | ---: |
| module-load-bundle | 73.98 | 79.08 | 11.21 | 15.54 |

Common 0-1-lock commands are startup-bound. Direct invocation paired-delta p50 spans roughly
27.60-42.52 ms, so low-risk bundle/module-load reductions are the primary common-case lever.

## Largest Direct-Invocation Paired Deltas

| Rank | Scenario | Active locks | p50 ms | p95 ms | paired delta p50 ms | paired delta p95 ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `git_begin` | 1000 | 322.81 | 372.29 | 258.77 | 304.82 |
| 2 | `acquire_no_conflict` | 1000 | 251.51 | 306.71 | 187.28 | 240.61 |
| 3 | `status_json` | 1000 | 175.85 | 191.42 | 111.38 | 127.46 |
| 4 | `acquire_conflict` | 1000 | 174.76 | 191.40 | 110.44 | 124.85 |
| 5 | `refresh` | 1000 | 173.54 | 193.72 | 109.92 | 129.03 |
| 6 | `git_begin` | 100 | 129.43 | 142.60 | 65.99 | 76.94 |
| 7 | `acquire_no_conflict` | 100 | 119.70 | 126.64 | 56.44 | 63.09 |

`release` stays near a 31 ms paired delta even at 1000 active locks because it targets a known lock
id and does not scan all conflicts.

## Common 0-1-Lock Direct Invocation

| Scenario | Active locks | p50 ms | p95 ms | paired delta p50 ms | paired delta p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `git_begin` | 1 | 103.60 | 114.93 | 42.52 | 51.34 |
| `acquire_no_conflict` | 1 | 104.81 | 111.13 | 41.62 | 47.69 |
| `refresh` | 1 | 95.21 | 102.27 | 32.10 | 37.85 |
| `git_begin` | 0 | 93.54 | 99.66 | 32.09 | 36.31 |
| `acquire_conflict` | 1 | 95.14 | 102.07 | 31.80 | 38.99 |
| `acquire_no_conflict` | 0 | 95.27 | 101.49 | 31.76 | 37.76 |
| `release` | 1 | 94.59 | 100.71 | 31.62 | 36.65 |
| `git_end` | 1 | 94.62 | 102.50 | 31.19 | 37.50 |
| `status_json` | 1 | 91.96 | 97.38 | 28.64 | 34.39 |
| `status_json` | 0 | 91.38 | 96.91 | 27.60 | 33.35 |

## Interpretation

- Common-case wall time is mostly Node startup plus fixed module-load/parse/dispatch overhead.
- Large-active-set `git_begin`, acquire, status, conflict, and refresh are dominated by active-lock
  read/parse/classify/sort paths.
- `git_begin` has the largest 1000-lock overhead because it refreshes held locks before acquiring
  `@git/index` and then scans active locks again for conflict/keep-alive behavior.
- Any registry write/mutex/sibling-scan optimization must run the cross-process contention proof.
