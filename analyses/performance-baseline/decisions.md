# Performance Baseline Decisions

## Claude Plan Review

- Artifact: `/Users/djsimovic/.codex/artifacts/claude-agentlocks-build-size-latency-plan-review-20260604T172107Z.md`
- Overall score: 72/100
- Verdict: REVISE

Accepted P1 findings before optimization:

- Version constants must be release-safe. If the package metadata import candidate is implemented,
  prefer build-time injection from `package.json` or a build/prepack assertion over a hand-synced
  committed constant.
- Probe-gating invariants must track both predicates: only overlapping locks are conflict
  candidates, and the liveness probe is invoked only for overlapping locks whose lease has expired.
- Variance thresholds must be explicit. The Phase 0 gate is recorded in
  `analyses/performance-baseline/thresholds.json`.
- Clean-baseline checks must include untracked files. Phase 0 measurements were run from a detached
  clean worktree at `e5537fa`, after committing the harness files.
- Registry mutex/write-path optimizations require contention proof, including cross-process
  acquire contention against the built bundle.
- Common-command latency must be framed as startup-bound. Fixed-cost bundle/module-load reductions
  and large-active-set scaling are separate scoreboards.

Accepted P2 findings before or during attribution:

- Use separate size and latency impact scales.
- Move deterministic size/pack regression guards earlier than wall-clock latency budgets.
- Require either multiple-comparison correction or two independent sessions for claimed wins.
- If replacing `localeCompare` for lock ids, test the actual lock-id generator alphabet and
  adversarial mixed digit/case ids.
- Report raw bytes as the V8 parse/startup proxy and gzip/packed bytes as the ship/install proxy.
