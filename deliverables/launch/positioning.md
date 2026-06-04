# Agentlocks — Launch Positioning

Canonical positioning for the launch. The HN first comment and skeptic FAQ are derived from this
file; keep them in sync. Every factual claim is labeled `confirmed` / `likely` / `hypothesis` and,
where it asserts product behavior, anchored to code, tests, or CI so a skeptical reviewer can check
it.

Scope reminder (do not drift from this): **Agentlocks is advisory. Participants opt in. The
PreToolUse hooks surface staged-but-unlocked paths before a `git commit` tool-call; they do not
hard-block writers.** No claim below may imply hard enforcement.

---

## One-sentence hook

> **Agentlocks gives Codex and Claude Code advisory file leases so they can work in one shared Git
> worktree without silently overwriting each other — collisions surface at edit time, not at merge
> time.**

Shorter, for a title or thumbnail:

> Advisory file locks so multiple AI coding agents can share one Git worktree.

---

## Who feels this pain today

`likely` — The pain is concentrated, not universal. The buyer is a developer who already runs **two
or more coding agents at once** (Codex + Claude Code, or one agent with subagents) and points them
at the **same repository**, because the work is coupled:

- They share one running dev server, one database/migration state, one build output directory, or
  generated code that is expensive to rebuild per copy.
- They want both agents landing on **one branch / one line of history**, with fast handoffs ("Codex
  scaffolds the module, Claude refines the same files minutes later").
- They have hit the actual failure: two agents edit the same file and one silently wins; a "working
  on `auth.ts`" note in chat goes stale; two `git add` runs race the shared index.

`hypothesis` — This audience is small today but growing as multi-agent operation becomes normal. The
launch bet is that the people who have *felt* the silent-overwrite failure convert well; the people
who have not will not, and that is fine. We are awareness-constrained, not value-constrained.

Who is **not** the buyer (state this plainly, it builds trust): someone running fully independent
features that can each become their own PR. That person should use a worktree per agent (see below)
and does not need Agentlocks.

---

## Kill gate: why one shared worktree instead of one `git worktree` per agent?

This is the first objection and it must not be hand-waved. The honest answer concedes the strong
case for worktrees and then names the case they do not cover.

### What worktree-per-agent is genuinely good at

`confirmed` (this is how `git worktree` works) — A worktree per agent gives **hard, filesystem-level
isolation**: each agent gets its own working directory and its own branch over a shared object
store. Two agents literally cannot touch the same file, because they are editing different files on
disk. For **independent, parallelizable work that lands as separate PRs**, this is the right tool,
it is enforced (not advisory), and Agentlocks adds nothing. We should say so.

### Where it falls short — and why those gaps are exactly Agentlocks' niche

1. **It defers collisions to merge time instead of preventing them.** Two agents editing the same
   file in separate worktrees both "succeed" locally; you discover the conflict later, as a merge
   that a human or agent has to resolve. Agentlocks makes the second agent's `acquire` fail
   *immediately* with the blocking owner, its reason, and the next command — before divergence
   exists to merge. `confirmed` — conflict payload names owner + reason + `next:` line
   (`README.md:48-50`, `src/cli/program.ts`).

2. **Worktrees isolate working directories; they do not automatically coordinate the shared state
   around them.** `node_modules`, build output, generated code, caches, a running dev server, or one
   live database are either duplicated per worktree (cost, drift, and sometimes impossible for a
   single live service) or shared by symlink / external path — which reintroduces shared mutable
   state with **zero coordination**. Agentlocks is the coordination layer for that coupled state.

3. **Branch sprawl for work meant to be one history.** Worktree-per-agent forces a branch-per-agent
   topology and a merge step even when you wanted both agents contributing to one branch with tight
   handoffs. Agentlocks lets them share the branch and serializes only the genuinely shared
   resources: the files being edited, and the Git index at staging time via the synthetic
   `@git/index` lock. `confirmed` — `git begin`/`git end` take and release `@git/index`
   (`README.md:96`, `README.md:226-234`).

4. **Overhead at small granularity.** Spinning up and tearing down a worktree (plus a branch
   namespace and a working-copy's worth of disk) is heavy when the unit of work is a few files for a
   few minutes. A lease is a JSON file under `.agentlocks/locks/`. `confirmed` — no daemon, no
   database, no service (`README.md:22-23`, `README.md:100`).

### The framing that survives scrutiny

**Worktrees and Agentlocks solve different problems on different axes, and they compose.**

- Worktrees *isolate*; Agentlocks *coordinates*.
- They isolate **independent** work; Agentlocks coordinates **coupled** work that must share one
  tree.
- Worktree isolation is hard but **per-worktree** — the moment you intentionally share mutable state
  outside those directories, worktrees no longer coordinate it. Agentlocks is advisory but covers
  that coupled local case.

> Use a worktree per agent when the work is independent enough to land as separate branches. Reach
> for Agentlocks when the work must share one worktree — shared non-Git state, one live branch,
> tight Codex↔Claude handoffs — and the cost of isolation (rebuild, merge, branch sprawl) is higher
> than the cost of coordination.

`likely` — Nothing stops you using both: a worktree per *feature*, Agentlocks *inside* a worktree
that more than one agent shares.

---

## What "advisory" protects — and what it does not

The trust move is precision, not overselling. (`README.md:98-100`, `README.md:402-414`,
`GITHUB_TRENDING_PLAN.md` Gate 2.)

### What it protects (`confirmed`)

- **Cooperating agents from each other.** `acquire` over repo-relative paths/globs returns a clean
  conflict instead of a silent overwrite when a lease is held (`README.md:94`).
- **The shared Git index.** `git begin` takes `@git/index`; `git end` re-checks a fence token and
  aborts with exit code 3 if the lease was reclaimed mid-commit (`README.md:226-234`,
  `README.md:263-264`).
- **Owner integrity.** `expand`, `refresh`, and `release` require the agent id recorded on the lock
  (`README.md:407`).
- **Against stale "I'm on it" notes.** Leases have a TTL (default 10 min, max 30 min) and a liveness
  classification, so a dead agent's claim becomes reclaimable instead of blocking forever
  (`README.md:408-409`).
- **The forgot-to-lock failure, at commit time.** The PreToolUse backstop runs `agentlocks git
  verify` before a `git commit` tool-call and surfaces staged-but-unlocked paths
  (`uncovered`) and paths covered only by another agent (`foreign_covered`)
  (`tests/improvements-040.test.ts:173-210`).

### What it does NOT protect (`confirmed` — say this out loud)

- It does **not** stop an editor, shell command, raw `git`, or any non-participating tool that
  ignores the protocol. It patches nothing (`README.md:98-100`, `README.md:406`).
- The PreToolUse backstop **never blocks a commit**. It emits an `allow` decision with advice text
  and fails open on any error; `git verify` is read-only and always exits 0 — it never writes
  `.agentlocks/` (`src/cli/commit-hook-script.ts:7`, `src/cli/commit-hook-script.ts:420-445`,
  `src/cli/program.ts:478`, `tests/improvements-040.test.ts:281-298`).
- It is **not** cross-machine, networked, authenticated, or encrypted. It is files in one local
  worktree (`README.md:413-414`, `README.md:434-435`).

`confirmed` — This is a deliberate trade, not a missing feature: advisory-only is *why* there is no
daemon, no privileges, and no lock-holding background process (`README.md:99-100`).

---

## The 10-second demo that proves the hook

`confirmed` — grounded in `README.md:37-50`. The proof is a collision, shown, not explained:

1. Agent A: `lock=$(agentlocks acquire src/auth.ts --reason "refactor login" --id-only)`
2. Agent B: `agentlocks acquire src/auth.ts` → clean conflict: blocking owner, its reason, exact
   `next:` command.
3. No silent overwrite. A releases; B proceeds.

The visual asset (Phase 3) is two panes — a Codex lane and a Claude lane in the same worktree — where
B's overlapping `acquire` prints the conflict. The point a viewer must get in 10 seconds: *the second
writer is told, instead of the first writer being erased.*

---

## The dogfood story (the proof is the process)

`hypothesis` (launch narrative; becomes `confirmed` once the artifacts are committed through the
Agentlocks flow) —

> Codex and Claude Code built these launch artifacts in one shared Git worktree, coordinated by
> Agentlocks: each acquired leases before editing, refreshed before staging, took `@git/index`
> before committing, and staged only locked paths.

Current evidence: Claude Code produced the initial Phase 1 narrative draft through `claude -p`, and
Codex is performing the grounded source-check and integration pass under an Agentlocks lease. The
final pasteable launch claim should be promoted from `hypothesis` to `confirmed` only after the
artifacts are staged and committed through `agentlocks git begin` / `agentlocks git end`.

This is stronger than a synthetic demo because the tool is load-bearing in its own launch. If it
could not coordinate two agents through a real multi-file writing task, the launch should pause.

---

## Evidence labels (summary)

| Claim | Label | Anchor |
| --- | --- | --- |
| Advisory only; patches nothing | confirmed | `README.md:98-100`, `README.md:406` |
| Participants opt in (lock before editing/staging) | confirmed | `README.md:436` |
| `git verify` flags staged-but-unlocked (`uncovered`) | confirmed | `tests/improvements-040.test.ts:173-183` |
| Foreign-covered paths surfaced separately | confirmed | `tests/improvements-040.test.ts:199-210` |
| Reclaimable/dead locks do not count as coverage | confirmed | `tests/improvements-040.test.ts:228-249` |
| `git verify` read-only, always exits 0, no writes | confirmed | `README.md:265`, `tests/improvements-040.test.ts:281-298` |
| PreToolUse hook never blocks; fails open | confirmed | `src/cli/commit-hook-script.ts:7`, `:420-445` |
| `@git/index` fence aborts with exit 3 if reclaimed | confirmed | `README.md:226-234`, `:263-264` |
| No Bun at runtime; Node ≥ 22.18, one Node bundle | confirmed | `README.md:32-35` |
| Full lock suite runs on Windows in CI | confirmed | `.github/workflows/windows-unit.yml` |
| Single local worktree; not networked | confirmed | `README.md:413-414`, `:434-435` |
| Worktree-per-agent is right for independent work | confirmed | `git worktree` semantics |
| The coupled-work audience converts well | hypothesis | launch bet |
| Dogfood pipeline is the strongest proof | hypothesis | launch narrative |

---

## Answers to the five Phase 1 questions (one line each)

1. **Why share one worktree vs one per agent?** Worktrees isolate independent work but defer
   collisions to merge time, do not coordinate shared external state, and force branch sprawl;
   Agentlocks coordinates coupled work in one tree and surfaces collisions at edit time. They
   compose.
2. **What does "advisory" protect / not protect?** Protects cooperating agents, the shared index,
   owner integrity, and stale claims; does not stop non-participating tools and never hard-blocks.
3. **Who feels the pain?** Developers running 2+ agents on one coupled repo who have hit the
   silent-overwrite / stale-note / index-race failures.
4. **One-sentence hook?** Advisory file leases so Codex and Claude Code share one worktree without
   silently clobbering each other — collisions surface at edit time, not merge time.
5. **What 10-second demo proves it?** A acquires `src/auth.ts`; B's overlapping `acquire` gets owner
   + reason + next command instead of a silent overwrite.
