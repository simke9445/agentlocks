# Optimization Scoreboard

Scoring uses the revised plan scale:

```text
score = impact x confidence / effort
```

Size impact and latency impact are scored separately. Candidates below `2.0`, candidates without
behavior proof, and candidates that regress the other axis are rejected.

## Size Candidates

| Candidate | Impact | Confidence | Effort | Score | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Build-time injected package `name`/`version` constants replacing all `package.json` imports | 1 | 4 | 2 | 2.0 | Implement first. Throwaway build measured 1,137 raw-byte reduction; release-safe build injection required. |
| Shrink generated commit-hook payloads | 4 | 2 | 4 | 2.0 | Defer. Large contributor, but needs generated-instruction proof and concrete shrink design. |
| Replace Commander with a minimal parser | 4 | 4 | 5 | 3.2 | Defer despite score. High-risk parser contract change; only after smaller wins and another Claude review. |
| Simplify capabilities/rendering payloads | 3 | 2 | 4 | 1.5 | Reject for now; contract-heavy and no measured delta yet. |
| Remove tree-shaken helpers in `src/json.ts` | 0 | 4 | 1 | 0.0 | Reject as shipped metric no-op unless build-and-measure proves otherwise. |

## Latency Candidates

| Candidate | Impact | Confidence | Effort | Score | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Fixed-cost package-metadata injection side effect | 1 | 2 | 2 | 1.0 | Side effect only; do not claim latency win without repeated measurement. |
| Large-N active-lock read/parse/sort attribution for `git_begin`/acquire/status/refresh | 4 | 3 | 4 | 3.0 | Investigate after first size lever; requires registry correctness and contention proof. |
| Fast-path `--version` before full command construction | 2 | 2 | 3 | 1.33 | Defer until bundle/module-load deltas are remeasured; may split parser behavior. |
| Replace Commander for fixed startup/parse overhead | 3 | 4 | 5 | 2.4 | Defer with parser replacement gate and Claude review. |

## First Lever

Proceed with the build-time package metadata injection candidate. It has a small but measured raw
bundle win, low behavioral surface, and exercises the Phase 1 goldens before riskier parser or
registry changes.
