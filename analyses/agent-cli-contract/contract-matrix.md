# Agent CLI Contract Matrix

Verified locally on 2026-06-04 after the agent-facing CLI improvement gates.

Source of truth:

- `agentlocks capabilities --json` for command metadata, positionals, JSON shape refs, id-only line contracts, exit codes, environment identity order, and defaults.
- `agentlocks robot-docs guide` for concise agent workflow text.
- `bun run check` for source tests, typecheck, and lint.

## Contract Summary

| Command | Positionals | Key flags | JSON contract | `--id-only` lines | Exit codes | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| `acquire` | required repeatable `resources: resource_spec` | `--reason`, `--ttl-ms`, `--reclaim`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `lock.acquired.compact`; alternate `lock.conflict.compact` | `lock_id` | 0, 2, 3 | `tests/locks.test.ts`: resource normalization, compact output, id-only contracts, conflict JSON |
| `expand` | required repeatable `resources: resource_spec` | `--lock`, `--reason`, `--ttl-ms`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `lock.updated.compact` with runtime kind `refreshed`; alternate `lock.conflict.compact` | `lock_id` | 0, 2, 3 | `tests/locks.test.ts`: atomic expand conflict, ownership checks, id-only contracts; `tests/cli.test.ts`: role-specific `--lock` remains accepted and runtime kind matches capabilities |
| `refresh` | optional repeatable `lock_ids: lock_id`; `--mine` can replace ids | `--mine`, `--ttl-ms`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `lock.updated.compact`; alternate `lock.batch.compact` for multi-positional ids | `lock_id`, `...` | 0, 2, 3 | `tests/locks.test.ts`: ownership checks, batched ids, id-only contracts; `tests/cli.test.ts`: single-id, `--mine`, and multi-id runtime schemas plus removed generic `--lock` rejected |
| `release` | optional repeatable `lock_ids: lock_id`; `--mine` can replace ids | `--mine`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `lock.updated.compact`; alternate `lock.batch.compact` for multi-positional ids | `lock_id`, `...` | 0, 2, 3 | `tests/locks.test.ts`: ownership checks, batched ids, id-only contracts; `tests/cli.test.ts`: single-id, `--mine`, and multi-id runtime schemas plus removed generic `--lock` rejected |
| `status` | optional repeatable `resources: resource_spec` | `--mine`, `--json`, `--id-only`, `--verbose` | `lock.status.compact` | `lock_id`, `...` | 0, 2 | `tests/locks.test.ts`: compact lock summaries include normalized resources, owner, reason, status, reclaimable, next |
| `board` | optional repeatable `resources: resource_spec` | `--mine`, `--json`, `--id-only`, `--verbose` | `lock.board.compact` | `lock_id`, `...` | 0, 2 | `tests/locks.test.ts`: grouped board state and compact summary parity with status |
| `prune` | none | `--dry-run`, `--json`, `--id-only`, `--verbose` | `lock.prune.compact` | `lock_id`, `...` | 0, 2 | `tests/locks.test.ts`: dry-run behavior, id-only pruned ids |
| `identify` | none | `--agent-id`, `--json`, `--verbose` | `lock.identified.compact` | unsupported | 0 | `tests/locks.test.ts`: fallback, bare Claude session, scoped Claude, Codex, explicit id, harness precedence over explicit id, env id reliability |
| `git begin` | none | `--reason`, `--refresh-lock`, `--ttl-ms`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `git.begin.compact`; alternate `lock.conflict.compact` | `git_lock_id`, `git_token` | 0, 2, 3 | `tests/locks.test.ts`: git-index conflicts, generation/fence token, id-only line ordering |
| `git end` | required repeatable `git_lock_ids: lock_id` | `--release-lock`, `--git-token`, `--agent-id`, `--json`, `--id-only`, `--verbose` | `lock.batch.compact` for the documented `--release-lock` path; alternate `lock.updated.compact` for a single Git lock release | `git_lock_id`, `released_lock_id`, `...` | 0, 2, 3 | `tests/locks.test.ts`: fence verification and id-only release ordering; `tests/cli.test.ts`: `git end --release-lock` batch schema and removed generic `--lock` rejected |
| `git verify` | none | `--staged`, `--include-unstaged`, `--pathspec`, `--pathspec-mode`, `--json`, `--verbose` | `git.verify.compact` | unsupported | 0 | `tests/improvements-040.test.ts`: staged/unstaged/pathspec coverage, foreign coverage, sequencer bypass, no writes; `tests/cli.test.ts`: capabilities schema matches runtime keys |
| `run` | required repeatable `resources: resource_spec`; required child argv after `--` | `--reason`, `--ttl-ms`, `--agent-id` | unsupported; child stdout/stderr own the stream | unsupported | 0, 2, 3 plus child exit code | `tests/cli.test.ts`: wrapped command success and conflict behavior |
| `edit` | required repeatable `resources: resource_spec`; required child argv after `--` | `--reason`, `--ttl-ms`, `--agent-id` | unsupported; child stdout/stderr own the stream | unsupported | 0, 2, 3 plus child exit code | `tests/cli.test.ts`: keeps lock and prints id |
| `commit` | required repeatable `resources: resource_spec` | `--reason`, `--message`, `--keep`, `--ttl-ms`, `--agent-id` | unsupported; wraps git add/commit | unsupported | 0, 2, 3 plus git exit code | `tests/cli.test.ts`: stages/commits only locked resources; commit hook tests cover raw git verification |
| `init` | none | `--check`, `--harness`, `--no-commit-hook`, `--json`, `--verbose` | `init.compact` | unsupported | 0, 1 | `tests/init.test.ts`: idempotency, check mode, generated AGENTS text, harness files |
| `capabilities` | none | `--json` | `capabilities.v2` | unsupported | 0 | `tests/cli.test.ts`: schema version, command metadata, positionals, resolvable required tokens, schema refs and alternates, example-vs-schema validation, runtime schema conformance, id-only lines, size budget |
| `robot-docs guide` | none | none | unsupported text guide | unsupported | 0 | `tests/cli.test.ts` golden output |
| `doctor` | none | `--json`, `--verbose` | `doctor.compact` | unsupported | 0, 1 | `tests/cli.test.ts`: read-only health checks and verbose diagnostics |

## Gate Coverage

- Resource specs are raw command inputs; persisted and compact JSON lock summaries use normalized `resources: [{kind,value}]`.
- Public agent-facing JSON uses `exit_code`; tests recursively reject public `exitCode` leakage across representative JSON commands and conflict payloads.
- Capabilities v2 exposes positionals, JSON shape refs, alternate conflict/batch schemas, examples, compact-vs-verbose notes, id-only line metadata, and non-JSON reasons.
- Capabilities schemas are checked against representative runtime JSON payloads, including `--mine`, multi-id, conflict, and `git end --release-lock` branches, so hand-maintained metadata cannot drift silently.
- Command examples are validated against their declared schema refs.
- Command-level `required` entries resolve to either flags or positional names.
- Compact `status`, `board`, and conflict JSON include owner, reason, normalized resources, status, reclaimability, and next action without exposing full lock records.
- `git begin --id-only` is pinned as exactly two lines: Git lock id, then fence token.
- `refresh`, `release`, and `git end` use positional lock ids; generic repeatable `--lock` is rejected for those commands.
- `identify --json` reports `reliable`, `mine_supported`, and `mine_unsupported_reason` when applicable.
- Generated AGENTS text and `robot-docs guide` point agents to `capabilities --json` for detailed command contracts.

## Final Verification

Completed locally on 2026-06-04:

```bash
bun run check                                      # pass: 157 tests, 1641 expects, typecheck, lint
bun run build                                      # pass: dist/agentlocks.mjs, 170.14 KB
node dist/agentlocks.mjs capabilities --json       # pass: schema_version 2
node dist/agentlocks.mjs robot-docs guide          # pass: guide rendered
node dist/agentlocks.mjs identify --json           # pass: reliable/mine_supported JSON rendered
```
