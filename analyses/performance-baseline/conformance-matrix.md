# Performance Conformance Matrix

This matrix records the contract rows that must stay green before size or latency optimization
claims are accepted.

| Requirement | Level | Evidence | Status |
| --- | --- | --- | --- |
| Production bundle starts with `#!/usr/bin/env node` and is executable on POSIX | MUST | `tests/performance-contract.test.ts` structural bundle test | Covered |
| npm dry-run package contains only `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/agentlocks.mjs`, and `package.json` | MUST | `tests/performance-contract.test.ts` pack structural test | Covered |
| Packed shim runs without Bun on `PATH` for help/version/error paths | MUST | `tests/performance-contract.test.ts` shim PATH test | Covered |
| Source entry and production bundle render identical help, version, capabilities, robot docs, JSON error, and lock JSON contracts | MUST | `tests/goldens/performance/*.json` | Covered |
| Dynamic lock ids, git tokens, temp paths, hostnames, and pids are scrubbed before golden comparison | MUST | `canonicalResult` / `scrubText` in `tests/performance-contract.test.ts` | Covered |
| `git begin` and `git end` id-only/JSON outputs are frozen before latency optimization | MUST | `git-begin-*` and `git-end-*` performance goldens | Covered |
| Stale-but-not-dead overlapping locks still block acquire unless liveness says dead/reclaimable | MUST | liveness-gate test keeps expired unknown conflict blocking | Covered |
| Liveness probes run only for overlapping expired locks | MUST | liveness-gate test spies on `sessionProbe` | Covered |
| Cross-process same-resource acquire grants exactly one winner through the built bundle | MUST | cross-process contention test | Covered |
| Perf instrumentation symbols do not ship in `dist/agentlocks.mjs` | MUST | bundle structural grep for `AGENTLOCKS_PERF` | Covered |
| Generated robot instructions stay aligned with the public CLI surface | SHOULD | source/bundle `robot-docs guide` golden plus existing init tests | Covered |
| Latency claims use paired deltas and committed threshold gates | SHOULD | `analyses/performance-baseline/latency.json` and `thresholds.json` | Covered |
