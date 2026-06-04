# Changelog

All notable changes to Agentlocks are documented here. Agentlocks is pre-release: schemas and the CLI
contract change in place with no migration layer.

## 0.9.2

### Changed

- **Release gates are aligned with the performance contract suite.** The Windows white-box workflow
  provisions Node/npm before running `bun test`, the test resolves `npm.cmd` on Windows, and the
  npm tarball-size guard allows the small pack-size variance observed between local npm and GitHub's
  runner npm.
- **Resource lock arguments are now one quoted positional list.** `acquire`, `expand`, `status`,
  `board`, `run`, `edit`, and `commit` infer exact path locks versus glob locks from each quoted
  resource argument, so `agentlocks acquire 'a.ts' 'b.ts' 'src/**/*.ts' --reason "edit files"` is
  the public contract. The separate glob flag is removed; quoted future paths and subtree globs can
  be locked before the files or directories exist.
- **Raw resource input is now named distinctly from normalized resources internally.** Command and
  registry inputs use `resourceSpecs` for shell-provided strings, while persisted lock records and
  JSON lock summaries keep `resources` for normalized `{kind,value}` entries.
- **Public JSON now uses `exit_code` instead of `exitCode`.** Agent-facing `--json` output, including
  compact, verbose, init, doctor, and parser-error payloads, uses the snake_case field with no
  compatibility alias.
- **`capabilities --json` is now a v2 self-describing command contract.** Each command advertises
  positionals, compact JSON kind/schema refs, examples, compact-vs-verbose notes, and exact
  `--id-only` output lines where supported.
- **Compact lock JSON is richer without exposing full internal records.** `status`, `board`, and
  conflict payloads now include normalized resources, owner, reason, status, reclaimability, and a
  machine-readable next action so agents can decide whether to refresh, release, wait, prune, or
  retry.
- **`--id-only` line contracts are now conformance-tested.** Successful id-only lock commands have
  pinned line counts and ordering, including `git begin` returning the Git lock id before the fence
  token.
- **Lock-id inputs are now canonical positionals.** `refresh`, `release`, and `git end` no longer
  accept the generic repeatable `--lock`; keep passing lock ids positionally. Role-specific
  `expand --lock`, `git begin --refresh-lock`, and `git end --release-lock` remain.
- **`identify --json` now explains `--mine` reliability.** It reports `reliable`,
  `mine_supported`, and a short `mine_unsupported_reason` for fallback or bare Claude session
  identities so agents can decide before trying `refresh --mine` or `release --mine`.
- **Generated agent instructions now point to live CLI contracts.** The AGENTS snippet and
  `robot-docs guide` direct agents to `capabilities --json` for command shapes, JSON fields,
  `--id-only` line contracts, and exit codes, while keeping the pasted instructions focused on the
  locking and commit protocol.
- **The npm install tree is dependency-free.** `commander` is bundled into `dist/agentlocks.mjs` and
  kept only as a dev dependency for building the CLI, so package managers no longer install a second
  copy of the parser library alongside the bundled command.
- **Active-lock reads are faster without changing lock semantics.** The hot read path now avoids
  unnecessary work, and performance contract goldens plus a bundle-size guard pin the expected
  production shape.

## 0.8.0

### Changed

- **agentlocks now ships as one small Node bundle instead of seven embedded-Bun binaries.**
  `npm i -g agentlocks` previously resolved a prebuilt, Bun-embedded binary per platform — 60–112 MB
  installed, ~100% of it the embedded Bun runtime — from one of seven `agentlocks-<platform>` packages
  pinned through `optionalDependencies`. It now installs a single ~157 KB `dist/agentlocks.mjs`
  (`bun build --target=node --minify`) that runs under the user's own Node: a ~5 file / ~59 kB
  tarball, a >99% smaller install with no per-platform binary download. The bin shim is the standard
  npm one (a `#!/usr/bin/env node` symlink on POSIX, an `agentlocks.cmd` cmd-shim on Windows), so
  Windows is a first-class target served the npm way with no `.exe`. The seven platform packages, the
  `optionalDependencies` fan-out, and the Bun-fallback launcher (`bin/agentlocks.mjs`) are gone.
- **`engines.node` is now `>=22.18`** (was `>=18`). Node 22.18 is the first release with unflagged
  `.ts` type-stripping, which is how the bundle loads a scaffolded `agentlocks.config.ts` without Bun
  on the machine. The release/CI conformance matrix proves the bundle on this floor (22.18.0), a 22.x
  mid (22.22.3), and the release pin (24.16.0), across Linux (glibc + musl), macOS, and Windows.

### Removed

- **The library API and its type declarations.** agentlocks is a CLI, not a library; the package no
  longer publishes `exports` or `.d.ts` files. Import the CLI's behavior by invoking `agentlocks`,
  not by importing from the package.

## 0.7.0

### Added

- **musl (`linux-x64-musl`, `linux-arm64-musl`) is now a supported binary target.**
  `npm i -g agentlocks` on Alpine (musl x64 and arm64) now resolves a prebuilt binary; the launcher
  detects musl and resolves the `-musl` package. The target set grows from four to six platform
  packages. A `win32-x64` binary is built and exercised in CI but not yet shipped (its npm package
  awaits a one-time publish), so Windows continues to use the Bun fallback for now.
- **Windows-safe lock core.** The atomic rename-replace that writes lock records now tolerates
  the transient `EPERM`/`EACCES`/`EBUSY` that `fs.rename` can raise over an existing file on
  Windows when a concurrent reader or scanner holds a handle (POSIX silently replaces it); the
  rename is retried with bounded backoff to stay correct under that contention. A `windows-unit`
  CI job (`bun test` on `windows-latest`) gates the release pipeline and, when set as a required
  status check in branch protection, pull-request merges, so Windows-specific lock behavior cannot
  regress between releases.
- **Every-target-proven-before-`latest` release pipeline.** The release workflow is now
  `build -> publish-stage -> verify (matrix over all 6 shipped targets) -> flip -> release-notes`,
  with a separate `windows-unit` job proving the lock core on `windows-latest`. The `verify` matrix
  is a real `needs:` barrier: nothing `npm i -g agentlocks` resolves becomes `latest` until every
  shipped target has installed and run a real lock cycle on its native OS (including musl Alpine
  containers). The flip is a plain `npm publish` of the packed main tarball that the matrix already
  proved, so the pipeline stays tokenless via OIDC trusted publishing with no dist-tag manipulation.
  The single human approval gates the flip job, so the approver sees the full green matrix before
  authorizing the only irreversible step.

## 0.6.2

### Changed

- **`agentlocks init` now generates a plain, commented `agentlocks.config.ts`.** It no longer emits
  `import type { AgentlocksConfig } from "agentlocks"` / `satisfies AgentlocksConfig`, which made the
  generated config show a `Cannot find module 'agentlocks'` error in editors whenever the CLI was
  installed globally rather than as a local dependency (the common case). The config documents each
  key inline and is validated at load, so the annotation was editor-only sugar. For autocomplete, add
  agentlocks as a dev dependency and append `satisfies AgentlocksConfig`.

## 0.6.1

### Changed

- **`agentlocks init` no longer injects scripts into the host `package.json`.** The added
  `agentlocks` / `agentlocks:status` / `agentlocks:init` entries were thin aliases of the global CLI
  and reached into the host manifest for little benefit. The `init.updatePackageScripts` config field
  and the `recommended_scripts` field of `init --json` are removed.
- **The generated `AGENTS.md` coordination block renders cleaner command examples**: consistent
  placeholder quoting (`--reason '<intent>'` rather than `--reason '"<intent>"'`) and no stray em-dash.

## 0.6.0

A global install now works without Bun, the project has CI, and the multi-process lock core was
hardened against a real double-acquire race. The install model, the agent-ergonomics surface, the
`doctor`, and the locking primitives all got a focused polish pass.

### Added

- **`npm install -g agentlocks` works with no Bun on the machine.** The CLI now ships as a
  self-contained, Bun-embedded binary per platform (`bun build --compile`), published as the
  `agentlocks-<platform>` optional dependencies; a small Node launcher (`bin/agentlocks.mjs`)
  resolves the right binary and execs it, falling back to running the TypeScript entry under Bun
  for development or unsupported platforms. Previously the bin was `#!/usr/bin/env bun`, so an npm
  install without Bun on `PATH` produced a binary that died with `env: bun: No such file or
  directory`. `engines` moves from `bun` to `node >=18`. An install smoke test
  (`scripts/smoke-install.mjs`, run per-OS in CI) builds the binary and runs the launcher with no
  Bun reachable.
- **`agentlocks --version`** prints the package version and is listed in `--help`. Previously the
  most common version probe dead-ended with `unknown option '--version'`.
- **A CI workflow** (`.github/workflows/ci.yml`) runs `bun test`, `tsc --noEmit`, and `biome check`
  on push and pull request, plus a Linux + macOS install-smoke job; the README carries a CI badge.

### Changed

- **Bare `agentlocks` and command groups now print help instead of an error.** `agentlocks`,
  `agentlocks robot-docs`, and `agentlocks git` with no subcommand used to print
  `agentlocks error: (outputHelp)`; they now print help and exit 0.
- **More errors carry a `next:` recovery command.** A missing required option appends the corrected
  command (for example, `next: agentlocks acquire <resources> --reason <text>`), and the
  high-frequency lock-usage errors (missing lock id, lock-not-found) point at
  `agentlocks status --id-only`.
- **`doctor` no longer reports `ok:false` right after a normal `init`.** It validates against
  whichever install variant is present (commit-hook or `--no-commit-hook`), only warns about a
  Claude session-scoped identity when the hook is absent, treats a freshly-held registry mutex as
  healthy, and aligns its stale-mutex threshold with the registry's reclaim model. Findings carry
  exact `next:` commands, and the text summary mirrors the JSON.

### Fixed

- **Registry mutex hardening (multi-process correctness).** An operation that stalled past the 30s
  stale threshold could be reclaimed by a second process so both ran concurrently (a double-acquire
  of the same path), and a thawed holder could delete a successor's mutex. `owner.json` now carries
  a per-acquire nonce, so a holder only ever removes a mutex it still owns, and stale-mutex reclaim
  consults `owner.json` and refuses to evict a provably-live same-host process (bounded by a
  ceiling). Proven by a new concurrency and fuzz suite (`tests/concurrency.test.ts`).
- **Codex liveness no longer steals a live lock.** A present-but-stale Codex `session_index` entry
  was classified `dead` with zero grace, unlike the Claude probe's stale-to-`unknown` rule; since
  Codex does not refresh `updated_at` every turn, a live agent's lock could be reclaimed. It now
  falls through to the unknown-liveness grace.
- **`agentlocks commit` no longer exits 0 after losing the `@git/index` fence** when the commit
  finishes inside the keep-alive interval; it re-verifies the fence after the commit lands.
- **The update notifier now fires.** `REGISTRY_URL` pointed at the nonexistent scoped package
  `@simke9445/agentlocks` (a leftover from the 0.5.0 rename), so every check 404'd and the
  "new version available" notice never appeared since 0.5.0. It now derives from the package name.
- **README accuracy.** The Quick Demo's `git begin`/`git end` example, the `identify --json` and
  error-JSON samples, and the install instructions were corrected so every documented
  "verify it yourself" command reproduces.

## 0.5.1

### Changed

- **README rewrite and npm metadata refresh.** The README now leads with the agent-native value
  proposition (a verifiable "Genuinely agent-native" surface table plus the typo-teaching and
  zero-config-identity examples) instead of opening on reference tables. The npm `description` and
  `keywords` are rewritten around the same positioning. No code or CLI-contract changes.
- Added a GitHub social-preview card (`gh_og_share_image.png`).

## 0.5.0

### Changed

- **Renamed the package from `@simke9445/lockpick` to the unscoped `agentlocks`.** The CLI command, the
  `.agentlocks/` state directory, the `AGENTLOCKS_*` environment variables, the `agentlocks.config.ts`
  config file, and the `AgentlocksConfig` type are all renamed to match. The GitHub repository moved to
  `simke9445/agentlocks` (the old URL redirects). There is no compatibility shim for the old name;
  reinstall with `bun install -g agentlocks` (or `npm install -g agentlocks`) and re-run
  `agentlocks init`.

### Added

- **Runtime config validation.** Loading an `agentlocks.config.ts` now rejects unknown top-level or
  nested keys, wrong value types, and an invalid `liveness.adapter` with a clear, actionable error (for
  example, a stray `install:` key is reported as `Unknown … key "install". Did you mean "init"?`).
  Previously such mistakes were silently ignored, so an intended opt-out had no effect. The new
  `validateAgentlocksConfig` helper and `AgentlocksConfigError` are exported for library use.

## 0.4.1

### Changed

- **`agentlocks init` no longer writes `CLAUDE.md`.** The Agentlocks instructions block always lands in
  `AGENTS.md`, which Claude Code reads as well as Codex, so `--harness claude-code` now writes the same
  `AGENTS.md` block as the default harness (it still installs the `.claude/` `PreToolUse` hooks and
  settings). The `init --json` payload drops the now-redundant `instructions_target` field;
  `instructions_path` is always `AGENTS.md`. The exported `InitInstructionsTarget` type is removed.
- The generated `AGENTS.md` instructions now make **`agentlocks commit` the preferred commit path**, with
  an explanation of what it does (locks the paths and the shared Git index, stages and commits only those
  paths pathspec-scoped, fences the index against a reclaimed lease, and releases, with no lock ids to thread).
  The manual `git begin` → `git add`/`git commit` → `git end --git-token` flow is documented as the
  lower-level alternative.

## 0.4.0

### Added

- **`agentlocks git verify`**: a read-only, advisory check answering "is each staged path covered by a
  held lock?". It never blocks and always exits 0. Coverage is direction-aware (a held glob covers a
  matching path; a held narrow path does not cover a broader request) over non-reclaimable locks, and
  it computes the effective committed set per commit form: `--include-unstaged` (for `git commit -a`),
  `--pathspec <p>` with `--pathspec-mode only|include` (for pathspec / `--only` / `--include` commits).
  It reads lock state without ever writing `.agentlocks/` and never performs a network/update check.
- **PreToolUse commit-hook backstop for Claude Code and Codex, installed by default** by `agentlocks init`
  (opt out with `--no-commit-hook`). It runs `git verify` before a `git commit` tool-call and surfaces
  staged-but-unlocked (or foreign-locked) paths — advisory only, it never blocks the commit. The Claude
  hook is merged into the existing per-Bash agent-id script (one process, not two); the Codex hook is a
  `^Bash$` `PreToolUse` entry under `.codex/` with a git-root-stable path. No git hook is installed and
  your git config is never touched.
- **`--mine` lost-id recovery**: `status --mine` / `board --mine` show only your locks; `release --mine`
  and `refresh --mine` operate over every lock you hold with no ids. The `--mine` mutates require a
  stable identity (harness id, `--agent-id`, or `AGENTLOCKS_AGENT_ID`) and reject an unstable per-process
  or bare-session identity with exit 2.
- **`@git/index` fencing**: `git begin` stamps a monotonic generation (persisted under
  `.agentlocks/locks/`) onto the index lease and `git begin --id-only` now prints two lines: the lock id,
  then a shell-safe fence token. `git end` / `commit` accept `--git-token` and abort with exit 3 if the
  lease was reclaimed and re-minted. `agentlocks commit` runs a foreground keep-alive that re-verifies and
  re-extends the lease across both `git add` and `git commit`, killing the child and aborting on loss.

### Changed

- **Idempotent acquire**: re-acquiring a path (or sub-path) you already hold now refreshes and returns
  your existing lock (exit 0) instead of self-conflicting (exit 3). A request broader than your held
  locks, or overlapping another agent's, still conflicts.
- `git begin --json` now returns a stable `{kind:"git-begin", lock_id, git_token, refreshed_lock_ids}`
  shape even when it refreshes sibling file locks.

## 0.3.0

### Added

- **`board`**: a read-only, mutex-free Who/What/Where overview grouped by agent, showing each
  lease's state and the next step (e.g. `reclaimable now -> prune, then acquire`). Run it before
  claiming to pick a non-overlapping area.
- **`acquire --reclaim`**: when every overlapping conflict is already reclaimable, prune those locks
  and acquire in a single command, reporting `reclaimed_lock_ids`. Also configurable globally via
  `defaults.autoReclaimOnConflict` (off by default).
- **`run` / `edit` / `commit` intent verbs** that bundle the safe lock/act/release ordering:
  `run <resources> --reason -- <cmd>` releases after the wrapped command; `edit` keeps the lock for
  later turns; `commit <resources> --reason -m <msg>` stages and commits only the locked resources
  (pathspec-scoped)
  through the `@git/index` lock. The wrapped command runs outside the registry mutex.
- **Claude Code liveness adapter** plus an **`auto`** adapter (now the default) that probes by the
  owner's detected harness (the Codex session index or the Claude Code session transcript) and falls
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
