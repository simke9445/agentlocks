# Changelog

All notable changes to Lockpick are documented here. Lockpick is pre-release: schemas and the CLI
contract change in place with no migration layer.

## Unreleased

### Changed

- **`lockpick init` no longer writes `CLAUDE.md`.** The Lockpick instructions block always lands in
  `AGENTS.md`, which Claude Code reads as well as Codex, so `--harness claude-code` now writes the same
  `AGENTS.md` block as the default harness (it still installs the `.claude/` `PreToolUse` hooks and
  settings). The `init --json` payload drops the now-redundant `instructions_target` field;
  `instructions_path` is always `AGENTS.md`. The exported `InitInstructionsTarget` type is removed.

## 0.4.0

### Added

- **`lockpick git verify`** — a read-only, advisory check answering "is each staged path covered by a
  held lock?". It never blocks and always exits 0. Coverage is direction-aware (a held glob covers a
  matching path; a held narrow path does not cover a broader request) over non-reclaimable locks, and
  it computes the effective committed set per commit form: `--include-unstaged` (for `git commit -a`),
  `--pathspec <p>` with `--pathspec-mode only|include` (for pathspec / `--only` / `--include` commits).
  It reads lock state without ever writing `.lockpick/` and never performs a network/update check.
- **PreToolUse commit-hook backstop for Claude Code and Codex, installed by default** by `lockpick init`
  (opt out with `--no-commit-hook`). It runs `git verify` before a `git commit` tool-call and surfaces
  staged-but-unlocked (or foreign-locked) paths — advisory only, it never blocks the commit. The Claude
  hook is merged into the existing per-Bash agent-id script (one process, not two); the Codex hook is a
  `^Bash$` `PreToolUse` entry under `.codex/` with a git-root-stable path. No git hook is installed and
  your git config is never touched.
- **`--mine` lost-id recovery** — `status --mine` / `board --mine` show only your locks; `release --mine`
  and `refresh --mine` operate over every lock you hold with no ids. The `--mine` mutates require a
  stable identity (harness id, `--agent-id`, or `LOCKPICK_AGENT_ID`) and reject an unstable per-process
  or bare-session identity with exit 2.
- **`@git/index` fencing** — `git begin` stamps a monotonic generation (persisted under
  `.lockpick/locks/`) onto the index lease and `git begin --id-only` now prints two lines: the lock id,
  then a shell-safe fence token. `git end` / `commit` accept `--git-token` and abort with exit 3 if the
  lease was reclaimed and re-minted. `lockpick commit` runs a foreground keep-alive that re-verifies and
  re-extends the lease across both `git add` and `git commit`, killing the child and aborting on loss.

### Changed

- **Idempotent acquire** — re-acquiring a path (or sub-path) you already hold now refreshes and returns
  your existing lock (exit 0) instead of self-conflicting (exit 3). A request broader than your held
  locks, or overlapping another agent's, still conflicts.
- `git begin --json` now returns a stable `{kind:"git-begin", lock_id, git_token, refreshed_lock_ids}`
  shape even when it refreshes sibling file locks.

## 0.3.0

### Added

- **`board`** — a read-only, mutex-free Who/What/Where overview grouped by agent, showing each
  lease's state and the next step (e.g. `reclaimable now -> prune, then acquire`). Run it before
  claiming to pick a non-overlapping area.
- **`acquire --reclaim`** — when every overlapping conflict is already reclaimable, prune those locks
  and acquire in a single command, reporting `reclaimed_lock_ids`. Also configurable globally via
  `defaults.autoReclaimOnConflict` (off by default).
- **`run` / `edit` / `commit` intent verbs** that bundle the safe lock/act/release ordering:
  `run <paths> --reason -- <cmd>` releases after the wrapped command; `edit` keeps the lock for later
  turns; `commit <paths> --reason -m <msg>` stages and commits only the locked paths (pathspec-scoped)
  through the `@git/index` lock. The wrapped command runs outside the registry mutex.
- **Claude Code liveness adapter** plus an **`auto`** adapter (now the default) that probes by the
  owner's detected harness — the Codex session index or the Claude Code session transcript — and falls
  back to the grace window for un-probeable owners.
- **Owner-mutation keep-alive** (`defaults.keepAliveOnMutation`, on by default): an agent's own
  acquire/expand/refresh extends its other held leases, capped to leases newer than the max TTL so
  over-grabs still reclaim.
- Compact `status --json` now includes each lock's classification (`locks: [{ lock_id, status }]`).
- Conflict JSON now includes `ahead_of` (distinct blocking owners) and an honest `retry_after_ms`
  floor; conflicts with multiple holders render binding-constraint-first; non-JSON conflict output
  writes act-on-able data to stdout and the `next:` guidance to stderr.

### Changed

- `DEFAULT_UNKNOWN_LIVENESS_GRACE_MS` reduced from 600000 to 90000 (and may now be configured to 0),
  so a dead, un-probeable lock reclaims shortly after its lease lapses instead of ~10 minutes later.
- The default liveness adapter is now `auto` (was `unknown`).

## 0.2.0

- Interactive version-update notice and README polish.

## 0.1.x

- Initial advisory file-locking CLI and library: acquire/expand/refresh/release/status/prune,
  `@git/index` coordination, liveness classification, init, capabilities, doctor, and robot-docs.
