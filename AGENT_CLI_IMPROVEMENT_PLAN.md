# Agent-Facing CLI Improvement Plan

This is the execution plan for improving Agentlocks as an agent-facing CLI API. It is intentionally
operational: a fresh Codex or Claude Code agent should be able to pick this up, verify the current
contract, implement one green chunk at a time, and leave the CLI more self-describing for other
agents.

Agentlocks remains a CLI, not a library. The target surface is the command line contract, structured
output, generated agent instructions, and machine-readable discovery. Do not add exported package
APIs, prompt-optimization behavior, command aliases, repository-specific defaults, compatibility
layers, migrations, deprecated aliases, or fallback behavior for older internal layouts.

## Objective

Make Agentlocks feel like a dependable, self-describing API when an autonomous coding agent invokes
it from a shell.

Primary operating targets:

- An agent can discover the command contract from `agentlocks capabilities --json` without reading
  README prose.
- Public JSON is consistently named, compact by default, and rich enough to decide the next command.
- `--id-only` output is explicitly described for every command, including multi-line outputs.
- Resource terminology distinguishes raw positional input from normalized lock records.
- Identity-dependent commands tell an agent whether `--mine` is safe before the agent tries it.
- Generated AGENTS instructions stay short and point to live CLI contract surfaces instead of
  duplicating all details.

## Current Baseline

These facts were verified locally on 2026-06-04.

| Surface | Current state |
| --- | --- |
| Published package shape | `package.json` publishes a `bin` named `agentlocks` at `dist/agentlocks.mjs`. |
| Product contract | `CHANGELOG.md` states the library API and type declarations were removed; invoke `agentlocks` instead of importing it. |
| Maturity | Pre-live. Contracts can change in place with implementation, tests, docs, skills, and wiki updated together. |
| Resource public contract | `acquire`, `expand`, `status`, `board`, `run`, `edit`, and `commit` use one quoted positional resource list. |
| Internal raw resource inputs | `LockCommand`, `FileLockRegistry` params, and resource normalization currently use `resources?: string[]` for raw specs. The seed's `paths`/`globs` concern is stale for this checkout, but the name still conflicts with normalized `LockResource[]` storage. |
| Normalized resources | Lock records use `resources: LockResource[]`, where each entry is `{ kind, value }`. |
| JSON naming | Public JSON still mixes camelCase `exitCode` with snake_case fields such as `lock_id`, `schema_version`, `retry_after_ms`, and `git_token`. |
| Capabilities shape | `capabilities --json` lists command names, usage, flags, required fields, exit codes, and next commands, but not positionals, JSON schemas, examples, compact-vs-verbose fields, or `--id-only` line shapes. |
| Compact JSON | Compact `status` exposes ids and statuses; compact `board` exposes normalized resources and reclaimability; compact conflicts expose string resource values but omit normalized resource objects and a richer next-action contract. |
| `git begin --id-only` | Intentionally prints two shell-safe lines: `git_lock_id`, then `git_token`. This is documented in code comments and README usage, but not metadata-encoded in capabilities. |
| Duplicate lock id inputs | `refresh`, `release`, and `git end` accept both positional lock ids and repeatable `--lock`. Role-specific flags like `expand --lock`, `git begin --refresh-lock`, and `git end --release-lock` are still useful. |
| Identity reliability | `git verify --json` includes caller reliability. `identify --json` does not expose `reliable` or `mine_supported`, even though `release --mine` and `refresh --mine` depend on that distinction. |
| Existing launch plan | `GITHUB_TRENDING_PLAN.md`, `analyses/`, and `deliverables/` are currently untracked launch artifacts. This plan must not overwrite them. |

Before execution, re-run this baseline. Do not rely on the seed's worktree note without current
`git status --short` and source inspection.

## Critical Contract Gates

Do these in order. If a gate fails, stop and repair the plan before implementation continues.

### Gate 1: Resource Terminology Is Unambiguous

Raw command and registry input should be named `resourceSpecs: string[]` internally. Normalized
storage/output remains `resources: LockResource[]`.

Reason:

- "resource spec" means the shell-provided text before normalization.
- "resource" means a normalized `{ kind, value }` record after validation.
- Agents reading TypeScript, JSON examples, or capabilities should not have to infer which shape a
  field uses from context.

Acceptance:

- Command parse output, registry params, and normalization options use `resourceSpecs`.
- Lock records and public normalized JSON continue to use `resources`.
- Tests cover path specs, glob specs, future paths, dedupe, and Git index inclusion.
- README, robot docs, generated AGENTS text, and changelog use the same terminology.

### Gate 2: Public JSON Uses Snake Case Everywhere

Because Agentlocks is pre-live, change public JSON in place instead of carrying compatibility aliases.

Acceptance:

- `exitCode` becomes `exit_code` in every public JSON payload.
- Existing snake_case fields remain snake_case.
- Error JSON includes `exit_code` as well as `ok`, `code`, `message`, and optional `details`.
- `schema_version` is bumped only if the shape changes meaningfully; the plan assumes a bump from
  v1 to v2 for the public machine-readable contract.
- Compact and verbose JSON use the same top-level naming style.
- Tests prove no public JSON payload still emits `exitCode`.

### Gate 3: Capabilities Describes Output Shapes

`capabilities --json` should become the source of truth for agents, not just a list of flags.

Acceptance:

- Each command includes `positionals`.
- Each command includes `json_kind` for the compact default JSON payload when `--json` is available.
- Each command includes either `json_schema` inline or a stable `json_schema_ref` with examples.
- Each command with `--id-only` includes `id_only_lines`.
- Commands that do not support JSON state that explicitly.
- Capabilities includes compact and verbose output differences where relevant.
- Capabilities remains a single-line JSON stdout payload and stays small enough for agents to parse
  cheaply.

### Gate 4: Compact JSON Is Useful Without Leaking Full Internals

Compact JSON should be the default agent surface. `--verbose` remains the full internal record.

Acceptance:

- `status --json` compact locks include `lock_id`, `status`, normalized `resources`, `owner`,
  `reason`, `reclaimable`, and `next`.
- `board --json` compact locks include the same lock summary shape grouped by agent.
- Conflict JSON includes normalized resource objects as well as owner, reason, status,
  `retry_after_ms` when available, `suggested_action`, and `next`.
- Compact JSON does not expose unnecessary timestamps, filesystem internals, or verbose lock record
  fields unless they are needed for the next agent action.

### Gate 5: `--id-only` Is Metadata-Encoded

Agents use `--id-only` because it is easy to thread through shell variables. Capabilities must
describe the line contract exactly.

Acceptance:

- `acquire --id-only`, `expand --id-only`, `refresh --id-only`, `release --id-only`,
  `status --id-only`, `board --id-only`, `prune --id-only`, and Git commands all document their
  line shapes.
- `git begin --id-only` advertises `id_only_lines: ["git_lock_id", "git_token"]`.
- Tests assert the documented line count and order for successful `--id-only` commands.

### Gate 6: Lock Id Inputs Are Canonical

Pre-live, remove generic duplicate lock-id inputs where they do not add real agent value.

Acceptance:

- `refresh`, `release`, and `git end` use positional lock ids as canonical input.
- Generic repeatable `--lock` is removed from those commands.
- `expand --lock` remains because it names the lock being expanded.
- `git begin --refresh-lock` remains because it names held file locks to refresh.
- `git end --release-lock` remains because it releases file locks after ending the Git-index lock.
- README, generated AGENTS text, robot docs, tests, and capabilities all match the new contract.

### Gate 7: `identify --json` Explains `--mine` Reliability

Agents should be able to ask once whether `--mine` commands will work.

Acceptance:

- `identify --json` includes `reliable: boolean`.
- `identify --json` includes `mine_supported: boolean`.
- If unsupported, include `mine_unsupported_reason` with a short machine-parseable code:
  `fallback_identity`, `session_scoped_identity`, `unreliable_identity`, or `missing_identity`.
- Human output explains the same state without bloating normal help.
- Tests cover fallback identity, bare Claude session identity, scoped Claude identity, Codex
  identity, explicit `--agent-id`, `--agent-id` with a live harness environment, and
  `AGENTLOCKS_AGENT_ID`.

### Gate 8: Generated Instructions Stay Small

Generated AGENTS text should teach the coordination protocol, then point to live CLI surfaces.

Acceptance:

- Generated instructions include only critical locking, refresh, Git-index, staging, committing, and
  release rules.
- Generated instructions direct agents to `agentlocks capabilities --json` and
  `agentlocks robot-docs guide` for detailed command contracts.
- Generated text does not duplicate large command tables that can drift from the CLI.
- Golden tests pin the generated text.

## Exact Skill Routing

The loaded skill list is large. Use only the skills that directly fit this plan.

### Core Skills

| Skill | Use | Adaptation for Agentlocks |
| --- | --- | --- |
| `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` | Primary rubric for agent-facing CLI surfaces. | Use the 11-dimension 0-1000 scoring model, but focus the pass on the API-improvement backlog in this plan. Do not stop at a scorecard once implementation begins. |
| `planning-workflow` | Maintain this plan, run review rounds, and convert the final plan into implementation tasks. | Use Codex plus local Claude Code review instead of assuming web GPT/Gemini/Grok availability. |
| `codebase-archaeology` | Reconfirm current source truth before each implementation chunk. | Keep it narrow: CLI parser, lock command execution, registry params, JSON rendering, capabilities, robot docs, generated init instructions, and tests. |
| `testing-conformance-harnesses` | Treat public CLI JSON as a contract with MUST/SHOULD clauses. | Build a contract matrix for commands and require every MUST clause to pass before a chunk commits. |
| `testing-golden-artifacts` | Pin stable text and JSON artifacts. | Use for capabilities examples, robot docs, generated AGENTS text, and compact JSON examples where diff review matters. |
| `beads-workflow`, `beads-br`, `beads-bv` | Convert this plan into a dependency-aware task graph after review. | Keep dependencies intact so agents can pick ready work without re-reading the full plan. |
| `code-review` | Review each implementation chunk before commit. | Findings first, file:line grounded, with tests and contract drift called out. |
| `multi-model-triangulation` | Cross-check the final plan and high-risk contract decisions. | Use Codex plus local Claude Code as the practical minimum; other models are optional only if explicitly available. |

### Secondary Skills

| Skill | Use |
| --- | --- |
| `codebase-audit` | Run a focused API/DX audit if the implementation expands beyond the seed backlog. |
| `security-review` | Use if JSON changes touch filesystem path handling, command spawning, lock ownership, or release/install behavior. |
| `world-class-doctor-mode-for-cli-tools` | Use only if identity reliability becomes a `doctor` diagnostic, not for the core plan. |
| `de-slopify` / `ai-slop-cleaner` | Use only to tighten docs and generated instructions after the contract is implemented. |
| `changelog-md-workmanship` | Use if multiple chunks need a carefully reconstructed changelog entry. |

### Out Of Scope Skills

SaaS billing, Supabase, Stripe, estate planning, tax, Slack migration, spreadsheets, presentations,
cloud deployment, Rust-specific migration skills, frontend UI skills, and launch/distribution skills
are not part of this plan unless the maintainer explicitly changes scope.

There is no loaded `ask-claude` skill in this session. Claude review is handled by the direct
`claude -p` protocol below, modeled after the existing trending plan but with stronger review
requirements.

## Repository Coordination Rules

All agents must follow `AGENTS.md`.

Before touching files, acquire the narrowest lock:

```bash
bun run --silent agentlocks -- acquire '<resource>' '<resource>' --reason "<intent>" --id-only
```

If new files become necessary, expand before editing:

```bash
bun run --silent agentlocks -- expand '<resource>' '<resource>' --lock <lock_id>
```

Before staging, refresh and acquire the Git-index lock:

```bash
bun run --silent agentlocks -- refresh <lock_id>
bun run --silent agentlocks -- git begin --refresh-lock <lock_id> --reason "<commit intent>" --id-only
```

Stage only locked paths. Release after commit:

```bash
bun run --silent agentlocks -- git end <git_lock_id> --release-lock <lock_id>
```

Implementation policy:

- Work on the current branch, normally `main`.
- Make one small green commit per implemented and unit-tested logic chunk.
- Run targeted tests for the chunk, then `bun run check`, before committing.
- Update implementation, tests, README, robot docs, generated instructions, skill instructions, wiki,
  and changelog together when a public contract changes.
- Do not stage unrelated untracked launch artifacts unless the active task explicitly covers them.

## Artifact Layout

Create these paths only when execution reaches them, and lock them first.

| Artifact type | Path |
| --- | --- |
| Baseline inventory | `analyses/agent-cli-baseline/` |
| Contract matrix | `analyses/agent-cli-contract/` |
| Claude review outputs | `${CODEX_HOME:-$HOME/.codex}/artifacts/agentlocks-agent-cli/` |
| Local decision log | `analyses/agent-cli-decisions.md` |
| Task graph fallback | `analyses/agent-cli-tasks.md` if beads are unavailable |
| Golden examples | `tests/goldens/` or command-specific existing golden paths |

## End-To-End Pipeline

### Phase 0: Baseline And Contract Inventory

Owner: Codex.

Purpose: verify exact current truth before changing anything.

Commands:

```bash
git status --short
rg -n "exitCode|schema_version|lock_id|resources|--lock|id_only|reliable|mine_supported" src tests README.md CHANGELOG.md
bun run --silent agentlocks -- capabilities --json
bun run --silent agentlocks -- robot-docs guide
bun test tests/cli.test.ts tests/locks.test.ts tests/init.test.ts
```

Outputs:

- `analyses/agent-cli-baseline/source-surfaces.md`
- `analyses/agent-cli-baseline/capabilities.current.json`
- `analyses/agent-cli-baseline/robot-docs.current.txt`
- A short list of stale seed assumptions, if any.

Exit gate:

- Every baseline claim has a file:line or runtime transcript.
- Current unrelated worktree changes are identified and left untouched.

### Phase 1: Resource Terminology Cleanup

Owner: Codex implements; code-review checks public contract drift.

Work items:

- Rename raw command fields from `resources` to `resourceSpecs`.
- Rename registry request fields from `resources` to `resourceSpecs`.
- Rename normalization options from `resources` to `resourceSpecs`.
- Keep normalized lock records as `resources: LockResource[]`.
- Update tests and docs to explain "resource spec" versus "resource".

Primary tests:

- Resource normalization unit tests.
- Acquire/expand/status/board command tests.
- Typecheck.

Exit gate:

- `rg -n "resources\\?: string\\[]|resources: string\\[]" src` has no remaining raw-input fields
  except deliberate public parser locals or test fixtures.
- `bun run check` is green.
- Commit this chunk before Phase 2.

### Phase 2: Public JSON Snake Case

Owner: Codex implements; Claude reviews agent readability.

Work items:

- Replace public `exitCode` with `exit_code`.
- Add `exit_code` to JSON error payloads.
- Update compact and verbose renderers.
- Update tests that parse JSON payloads.
- Update README, robot docs, changelog, generated instructions, and any wiki-facing docs.

Primary tests:

- CLI JSON tests for lock commands, init, doctor, capabilities, git verify, and parse errors.
- Recursive assertions proving representative public JSON payloads no longer emit `exitCode`,
  including status, board, conflicts, prune, Git commands, identify, capabilities, init, doctor, and
  parse errors.

Exit gate:

- `rg -n '"exitCode"|\\bexitCode\\b' tests/goldens README.md CHANGELOG.md src/cli src/locks` returns only
  internal TypeScript property names where public JSON is not rendered, or no hits after the internal
  model is also renamed.
- `bun run check` is green.
- Commit this chunk before Phase 3.

### Phase 3: Capabilities Output Schemas

Owner: Codex implements; Claude reviews whether an agent could implement against the result.

Work items:

- Extend `CommandCapability` with `positionals`.
- Add `json_kind` for each JSON-capable command.
- Add compact JSON schema refs or small inline schemas.
- Add examples for the commands agents use most: `acquire`, `expand`, `refresh`, `release`,
  `status`, `board`, `identify`, `git begin`, `git end`, `git verify`, `init`, `doctor`.
- Add `json_alternate_schema_refs` where one command has multiple valid runtime shapes, including
  conflict payloads and multi-result `batch` envelopes.
- Model `lock.batch.compact` for multi-operation JSON such as multi-id `refresh`/`release` and
  `git end <git_lock_id> --release-lock <lock_id> --json`.
- Keep examples schema-valid: every `json_example` must include its schema's required top-level
  keys and avoid verbose-only fields such as `root` in compact `init`.
- Add `id_only_lines` for commands where `id_only` is true.
- Add compact-vs-verbose notes where the two differ materially.
- Ensure `git.verify.compact` matches runtime exactly: required `ok`, `exit_code`, `command`,
  `caller`; optional `state`, `staged_total`, `covered`, `foreign_covered`, `uncovered`, `renames`.
- Normalize command-level `required` entries so each token is either a flag or a
  `positionals[].name`; do not use prose tokens such as `lock-id` or `resource`.
- Advertise `expand --json` with the runtime kind it actually emits.

Primary tests:

- Capabilities shape test.
- Size budget test.
- Golden or snapshot diff for representative capabilities output.
- Required-token resolvability test for every command.
- Example-vs-schema validation for every JSON-capable command.

Exit gate:

- A fresh agent can answer "what JSON does `git begin --json` return?" from capabilities alone.
- A fresh agent can resolve every `required[]` entry to either a flag or positional name.
- `bun run check` is green.
- Commit this chunk before Phase 4.

### Phase 4: Compact JSON Enrichment

Owner: Codex implements; code-review checks leakiness and next-action quality.

Work items:

- Define a reusable compact lock summary shape.
- Use it in `status`, `board`, and conflict JSON.
- Include normalized `resources` entries, owner, reason, status, reclaimability, and next action.
- Keep verbose JSON as the full internal record.
- Avoid duplicating large internals in compact output.

Primary tests:

- Compact `status --json` shape.
- Compact `board --json` shape.
- Conflict `--json` shape.
- `--verbose --json` still exposes full detail.

Exit gate:

- Compact JSON is sufficient to decide whether to refresh, wait, reclaim, release, or acquire.
- `bun run check` is green.
- Commit this chunk before Phase 5.

### Phase 5: `--id-only` Metadata And Tests

Owner: Codex implements; Claude reviews shell ergonomics.

Work items:

- Add `id_only_lines` metadata to capabilities.
- Add tests for successful `--id-only` line counts and order.
- Explicitly encode `git begin --id-only` as two lines.
- Update README and robot docs examples to match capabilities language.

Primary tests:

- `acquire --id-only`
- `status --id-only`
- `git begin --id-only`
- `git end --id-only`

Exit gate:

- Every command with `id_only: true` has a tested line contract or an explicit reason it cannot.
- `bun run check` is green.
- Commit this chunk before Phase 6.

### Phase 6: Canonical Lock Id Inputs

Owner: Codex implements; code-review checks command compatibility assumptions.

Work items:

- Remove generic repeatable `--lock` from `refresh`.
- Remove generic repeatable `--lock` from `release`.
- Remove generic repeatable `--lock` from `git end`.
- Keep role-specific `expand --lock`, `git begin --refresh-lock`, and `git end --release-lock`.
- Update CLI help, capabilities, README, robot docs, generated AGENTS text, tests, and changelog.

Primary tests:

- Parser rejects removed generic flags.
- Parser accepts canonical positional lock ids.
- Role-specific flags still work.
- Error suggestions name the new canonical command.

Exit gate:

- No public docs tell agents to use removed generic `--lock` flags.
- `bun run check` is green.
- Commit this chunk before Phase 7.

### Phase 7: Identity Reliability In `identify --json`

Owner: Codex implements; Claude reviews the human explanation.

Work items:

- Add `reliable`, `mine_supported`, and optional `mine_unsupported_reason`.
- Align with `isReliableOwnerIdentity`.
- Surface the same concept in capabilities.
- Update README and robot docs.

Primary tests:

- Fallback identity is unreliable and mine unsupported.
- Bare Claude session identity is unreliable and mine unsupported.
- Scoped Claude identity is reliable.
- Codex identity is reliable.
- Explicit `--agent-id` is reliable.
- `AGENTLOCKS_AGENT_ID` is reliable.

Exit gate:

- An agent can run `identify --json` and decide whether `refresh --mine` is valid.
- `bun run check` is green.
- Commit this chunk before Phase 8.

### Phase 8: Generated Instructions And Robot Docs

Owner: Claude drafts concise wording; Codex verifies and applies.

Work items:

- Keep generated AGENTS text focused on lock/refresh/Git-index/staging/release rules.
- Point agents to `capabilities --json` and `robot-docs guide`.
- Remove duplicated command tables that can drift.
- Update existing goldens.

Primary tests:

- Init/generated instruction tests.
- Robot-docs golden tests.
- CLI help smoke tests.

Exit gate:

- Generated text is small enough to paste into an AGENTS file without crowding out repo policy.
- `bun run check` is green.
- Commit this chunk before Phase 9.

### Phase 9: Contract Matrix And Final Verification

Owner: Codex.

Work items:

- Produce a contract matrix of public commands, positionals, flags, JSON shapes, `--id-only` shapes,
  exit codes, and tests that cover them.
- Add a capabilities-versus-runtime conformance guard: for every JSON-capable command, execute a
  representative invocation and assert live top-level JSON keys include
  `json_schemas[json_schema_ref].required` and no undeclared keys outside `required + optional`.
- Include divergent documented branches in that guard: `refresh --mine`, `release --mine`,
  multi-positional `refresh`, multi-positional `release`, conflict JSON, and
  `git end <git_lock_id> --release-lock <lock_id> --json`.
- Assert runtime discriminators against capabilities: `kind` must match `json_kind` when the schema
  has a `kind` field, and schema-specific discriminators such as `git verify`'s `command` field must
  match their documented literal.
- Validate every command `json_example` against its declared schema.
- Run the recursive `exitCode` leak guard against every representative JSON-capable command payload
  and conflict payloads.
- Run full check.
- Run a few black-box smoke commands against the built bundle.

Commands:

```bash
bun run check
bun run build
node dist/agentlocks.mjs capabilities --json
node dist/agentlocks.mjs robot-docs guide
node dist/agentlocks.mjs identify --json
```

Exit gate:

- Contract matrix has no uncovered MUST clauses.
- Capabilities schemas are tied to runtime payloads by tests, not only by manual review.
- Built bundle smoke checks pass.
- No unrelated files are staged.

### Phase 10: Review, Score, Convert To Tasks

Owner: Codex synthesizes; Claude reviews; human approves before implementation if the plan changed
materially.

Work items:

- Run the Claude review protocol below.
- Integrate accepted plan revisions.
- Convert the plan into beads with dependencies, or write `analyses/agent-cli-tasks.md` if beads are
  unavailable.
- Start implementation only after the reviewed plan has no P0 review findings.

Exit gate:

- Claude returns a rubric and score.
- Overall plan score is at least 850/1000.
- No rubric dimension is below 750.
- No P0 findings remain.
- Task graph dependencies match phase dependencies.

## Claude Review Protocol

Claude review must not be killed, wrapped in a timeout, or gated behind a timeout.

Forbidden for Claude review:

- `timeout claude ...`
- `gtimeout claude ...`
- watchdog scripts that send `kill`, `pkill`, or `killall`
- shell background jobs that are later killed because review is slow
- tmux/NTM timeout wrappers that terminate the Claude process
- treating slow review as failure solely because a wall-clock timer expired

Allowed:

- Start Claude in the foreground and wait.
- Poll terminal output if the process is still running.
- If authentication, quota, or CLI startup fails, record that as an external review blocker.
- If Claude itself returns an error, save the error output and retry only after the cause is clear.

Run without a timeout wrapper:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/artifacts/agentlocks-agent-cli"
review_ts="$(date -u +%Y%m%dT%H%M%SZ)"
prompt_file="${CODEX_HOME:-$HOME/.codex}/artifacts/agentlocks-agent-cli/claude-agent-cli-plan-review-${review_ts}.prompt.md"
review_file="${CODEX_HOME:-$HOME/.codex}/artifacts/agentlocks-agent-cli/claude-agent-cli-plan-review-${review_ts}.md"

{
  cat <<'PROMPT'
Review AGENT_CLI_IMPROVEMENT_PLAN.md for Agentlocks.

Context:
- Agentlocks is a pre-live CLI, not a library.
- The goal is agent-facing API improvement: CLI contract, JSON, capabilities, id-only behavior,
  identity reliability, generated AGENTS text, and tests.
- Do not propose compatibility layers, aliases, library exports, or prompt-optimization behavior.
- Be adversarial and specific.

Return this exact structure:

1. Overall score: <0-1000>
2. Decision: approve | revise | rewrite
3. Rubric table with columns:
   - dimension
   - score_0_to_1000
   - evidence
   - required_revision
4. P0 findings
5. P1 findings
6. P2 findings
7. Missing tests or contract gaps
8. Git-diff-style plan revisions

Use these rubric dimensions:
- source_fidelity
- agent_contract_clarity
- implementation_decomposability
- test_and_conformance_coverage
- repo_policy_compliance
- json_schema_quality
- capabilities_self_documentation
- shell_ergonomics
- reviewability
- risk_control
- user_value

Scoring rules:
- Scores are 0-1000.
- Any score above 700 must cite plan section evidence or repo source evidence.
- Overall score is the weighted mean, with source_fidelity, test_and_conformance_coverage,
  repo_policy_compliance, and agent_contract_clarity weighted highest.
- A P0 finding caps the overall score at 699.
- A missing test strategy for a public contract change caps test_and_conformance_coverage at 699.
- A recommendation that violates the CLI-not-library contract caps repo_policy_compliance at 699.
PROMPT
  printf '\n\n--- PLAN ---\n\n'
  cat AGENT_CLI_IMPROVEMENT_PLAN.md
} > "$prompt_file"

claude -p "$(cat "$prompt_file")" > "$review_file"
```

Codex then integrates or rejects each revision:

- Accept revisions that are source-faithful, contract-compatible, testable, and useful for agents.
- Reject revisions that add compatibility layers, aliases, library APIs, generic prompt behavior, or
  repo-specific defaults.
- Record rejections in `analyses/agent-cli-decisions.md` if implementation has started.

## Task Graph

Convert the phases into beads or a fallback task file with these dependencies.

| Task | Blocks | Depends on |
| --- | --- | --- |
| T0 Baseline inventory | All implementation tasks | None |
| T1 Resource terminology cleanup | T2, T3, T4 | T0 |
| T2 Snake-case JSON | T3, T4, T5, T9 | T0 |
| T3 Capabilities schemas | T5, T9 | T1, T2 |
| T4 Compact JSON enrichment | T9 | T1, T2 |
| T5 `--id-only` metadata | T9 | T3 |
| T6 Canonical lock id inputs | T8, T9 | T0 |
| T7 Identity reliability | T9 | T0, T2 |
| T8 Generated instructions | T9 | T3, T5, T6, T7 |
| T9 Contract matrix and verification | T10 | T1, T2, T3, T4, T5, T6, T7, T8 |
| T10 Claude review and final synthesis | Implementation handoff | T9 for implementation review, or T0 for plan-only review |

## Acceptance Summary

The plan is complete when:

- The Claude review protocol has produced a rubric and score without a timeout wrapper.
- The plan score is at least 850/1000, with no P0 findings and no dimension below 750.
- Every public contract change has a named test strategy.
- Every implementation chunk can be committed independently after targeted tests and `bun run check`.
- The task graph preserves dependencies.
- The CLI remains a CLI, not a library.

## Ready-To-Run Goal Prompt

Use this prompt to start the implementation run after review:

```text
Implement AGENT_CLI_IMPROVEMENT_PLAN.md in /Users/djsimovic/Work/agentlocks.

Follow AGENTS.md exactly: acquire narrow Agentlocks file locks before edits, refresh before staging,
take the Git-index lock, stage only locked paths, run targeted tests and `bun run check`, and commit
each green logic chunk before moving on.

Do not create a branch unless the maintainer explicitly asks. Do not add compatibility layers,
deprecated aliases, library exports, prompt-optimization behavior, or repo-specific defaults.

Start with Phase 0 baseline. For each phase, update implementation, tests, README, robot docs,
generated instructions, changelog, skill instructions, and wiki where the public contract changes.

When invoking Claude for plan or artifact review, do not use timeout/gtimeout/watchdog wrappers and
do not kill the Claude process for being slow. Require Claude to return a rubric table and an overall
0-1000 score.
```
