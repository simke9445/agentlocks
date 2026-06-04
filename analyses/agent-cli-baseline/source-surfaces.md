# Agent CLI Baseline Source Surfaces

Measured on 2026-06-04 from `/Users/djsimovic/Work/agentlocks`.

## Worktree State

Command:

```bash
git status --short --branch
```

Observed:

```text
## main...origin/main
 M CHANGELOG.md
 M README.md
 M bun.lock
 M deliverables/launch/demo-script.md
 M deliverables/launch/status.md
 M docs/dependency-evidence.md
 M package.json
?? AGENT_CLI_IMPROVEMENT_PLAN.md
?? assets/agentlocks-demo-collision.svg
```

The tracked edits and SVG asset above pre-exist this implementation pass and must not be staged as
part of agent CLI work unless a later phase explicitly locks and edits those paths. This baseline
chunk locks only `AGENT_CLI_IMPROVEMENT_PLAN.md` and `analyses/agent-cli-baseline/**`.

## Baseline Commands

```bash
rg -n "exitCode|schema_version|lock_id|resources|--lock|id_only|reliable|mine_supported" src tests README.md CHANGELOG.md
bun run --silent agentlocks -- capabilities --json
bun run --silent agentlocks -- robot-docs guide
bun test tests/cli.test.ts tests/locks.test.ts tests/init.test.ts
```

Targeted tests passed:

```text
65 pass
0 fail
320 expect() calls
Ran 65 tests across 3 files.
```

## Current Contract Evidence

| Surface | Evidence |
| --- | --- |
| Public JSON still emits camelCase `exitCode` | `src/locks/commands.ts` renders compact lock JSON with `exitCode`; `src/cli/commands/init.ts` compact init JSON emits `exitCode`; `src/cli/doctor.ts` emits `exitCode`; `README.md` shows an `identify --json` example with `exitCode`. |
| Capabilities schema is v1 and compact | `src/cli/capabilities.ts` exposes `schema_version: 1` and a `CommandCapability` with `name`, `usage`, `summary`, `category`, `mutates`, `json`, `id_only`, `verbose`, `flags`, `required`, `exit_codes`, `next`, and optional `dry_run`. |
| Capabilities lack output shape metadata | `src/cli/capabilities.ts` has no `positionals`, `json_kind`, `json_schema`, `json_schema_ref`, `examples`, or `id_only_lines` fields. |
| Raw resource input is still named `resources` internally | `src/locks/types.ts`, `src/locks/registry.ts`, `src/locks/resources.ts`, `src/cli/program.ts`, and `src/cli/commands/wrapped.ts` use `resources: string[]` or `resources?: string[]` for raw shell inputs. |
| Normalized lock records also use `resources` | `src/locks/types.ts` defines lock records and operation results with `resources: LockResource[]`. |
| `refresh`, `release`, and `git end` still accept duplicate lock-id inputs | `src/cli/program.ts` documents positional lock ids as equivalent to repeatable `--lock` for those commands; `src/cli/capabilities.ts` lists `--lock` in their flags. |
| `git begin --id-only` is two lines but capabilities do not encode it | `src/locks/commands.ts` comments that `--id-only` is exactly two shell-safe lines: lock id then fence token; `src/cli/capabilities.ts` only says `id_only: true`. |
| Compact `status --json` is too thin for next action | `src/locks/commands.ts` compact `status` returns `kind`, `exitCode`, `lock_count`, `lock_ids`, and `locks: [{ lock_id, status }]`. |
| Compact `board --json` has normalized resources but lacks owner/reason/next action in each lock summary | `src/locks/commands.ts` compact `board` groups by agent and includes lock id, status, resources, and reclaimability. |
| Compact conflict JSON loses normalized resource shape | `src/locks/commands.ts` maps conflict resources to string values with `resources: conflict.resources.map((resource) => resource.value)`. |
| Identity reliability exists internally | `src/locks/session.ts` exposes `isReliableOwnerIdentity`, and `src/locks/git-verify.ts` includes caller `reliable` in `git verify --json`. |
| `identify --json` does not expose `reliable` or `mine_supported` | `src/locks/commands.ts` compact `identified` JSON returns `kind`, `exitCode`, `agent_id`, `source`, `harness`, and `harness_scope`. |

## Current Runtime Artifacts

- `analyses/agent-cli-baseline/capabilities.current.json` contains the current single-line
  `agentlocks capabilities --json` output.
- `analyses/agent-cli-baseline/robot-docs.current.txt` contains the current
  `agentlocks robot-docs guide` output.

## Stale Seed Assumptions

The seed said `executeLockCommand` still read `command.paths` and `command.globs`, and that registry
request APIs exposed `paths` and `globs`. That is stale for this checkout. The current issue is a
name collision: raw positional strings and normalized resource records are both called `resources`.
