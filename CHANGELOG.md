# Changelog

All notable changes to Lockpick are documented here. Lockpick is pre-release: schemas and the CLI
contract change in place with no migration layer.

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
