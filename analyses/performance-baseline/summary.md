# Performance Baseline Summary

- generated_at: 2026-06-04T18:15:20.787Z
- git_sha: e5537fa
- clean_worktree: true
- samples_per_case: 200
- warmups_per_case: 10

## Size

- raw bundle bytes: 170145
- gzip -9 bundle bytes: 46358
- npm dry-run packed size: 64443

## Latency

| variant | scenario | active locks | command p50 ms | command p95 ms | paired delta p50 ms | paired delta p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| direct | acquire_no_conflict | 0 | 95.27 | 101.49 | 31.76 | 37.76 |
| direct | acquire_no_conflict | 1 | 104.81 | 111.13 | 41.62 | 47.69 |
| direct | acquire_no_conflict | 10 | 104.42 | 111.21 | 42.35 | 50.14 |
| direct | acquire_no_conflict | 100 | 119.70 | 126.64 | 56.44 | 63.09 |
| direct | acquire_no_conflict | 1000 | 251.51 | 306.71 | 187.28 | 240.61 |
| direct | acquire_conflict | 1 | 95.14 | 102.07 | 31.80 | 38.99 |
| direct | acquire_conflict | 10 | 105.01 | 112.80 | 42.08 | 48.53 |
| direct | acquire_conflict | 100 | 112.05 | 119.71 | 48.80 | 54.17 |
| direct | acquire_conflict | 1000 | 174.76 | 191.40 | 110.44 | 124.85 |
| direct | refresh | 1 | 95.21 | 102.27 | 32.10 | 37.85 |
| direct | refresh | 10 | 105.28 | 112.04 | 41.90 | 47.39 |
| direct | refresh | 100 | 112.04 | 116.90 | 48.82 | 53.17 |
| direct | refresh | 1000 | 173.54 | 193.72 | 109.92 | 129.03 |
| direct | release | 1 | 94.59 | 100.71 | 31.62 | 36.65 |
| direct | release | 10 | 94.29 | 97.30 | 31.08 | 34.70 |
| direct | release | 100 | 94.28 | 98.53 | 31.18 | 35.66 |
| direct | release | 1000 | 94.62 | 101.26 | 30.16 | 35.81 |
| direct | status_json | 0 | 91.38 | 96.91 | 27.60 | 33.35 |
| direct | status_json | 1 | 91.96 | 97.38 | 28.64 | 34.39 |
| direct | status_json | 10 | 101.48 | 105.98 | 38.33 | 42.53 |
| direct | status_json | 100 | 109.59 | 114.06 | 45.89 | 51.17 |
| direct | status_json | 1000 | 175.85 | 191.42 | 111.38 | 127.46 |
| direct | git_begin | 0 | 93.54 | 99.66 | 32.09 | 36.31 |
| direct | git_begin | 1 | 103.60 | 114.93 | 42.52 | 51.34 |
| direct | git_begin | 10 | 108.63 | 113.73 | 45.49 | 50.02 |
