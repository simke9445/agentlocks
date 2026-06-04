# Agentlocks — Skeptic FAQ

Written for a skeptical developer (HN/Reddit/Lobsters), not for marketing. Every answer is concrete
and, where it asserts behavior, anchored to code, tests, or CI. The first answer below is the launch
kill gate; the rest defend the advisory model honestly. None of these answers claim hard
enforcement, because Agentlocks does not enforce — it coordinates.

---

### Why not one `git worktree` per agent?

Because they solve different problems, and for the case Agentlocks targets, worktrees are the wrong
fit.

A worktree per agent gives **hard, filesystem-level isolation** — separate working directory,
separate branch, shared object store. For **independent work that lands as separate PRs, use it.**
It's enforced, not advisory, and Agentlocks adds nothing there.

Agentlocks is for the case worktrees don't cover:

- **Worktrees defer collisions to merge time.** Two agents editing the same file in separate
  worktrees both succeed locally; you find out later as a merge conflict. Agentlocks fails the
  second `acquire` immediately, with the blocking owner, its reason, and the next command — before
  divergence exists.
- **Worktrees isolate working directories; they do not automatically coordinate shared state around
  them.** One running dev server, one database/migration state, one build output dir, generated code
  that's costly to rebuild per copy — you either duplicate it per worktree or share it through an
  external path, which reintroduces shared mutable state with zero coordination.
- **Worktrees force a branch per agent** even when you want both agents on one branch with tight
  Codex↔Claude handoffs.

Different axis: worktrees *isolate*, Agentlocks *coordinates*. Compose them — a worktree per
feature, Agentlocks inside a worktree that more than one agent shares. (`README.md:104-111`.)

---

### Why not `flock`?

`flock` gives you a process-level critical section on one machine. It is not a repository resource
registry. It has no concept of repo-relative paths or globs, no owner metadata, no reason string, no
parseable status, no TTL/liveness, no Git-index coordination, and no agent-facing docs or install
guidance. You would be building most of Agentlocks on top of it. Agentlocks records *which agent*
holds *which paths* for *what reason*, exposes it as JSON, and ties it into the `git add`/commit
path. (`README.md:108`.)

---

### Why not a Git hook (e.g. `pre-commit`)?

Two reasons.

1. **A `pre-commit` hook is too late and too narrow.** It fires at commit time, after overlapping
   edits already happened, and it doesn't coordinate `git add` across concurrent workers.
2. **Git hooks collide.** Git supports a single `core.hooksPath`, so installing one fights husky,
   lefthook, or whatever the repo already uses.

Agentlocks installs **no git hook and never touches your git config.** The advisory backstop is a
**harness** PreToolUse hook (Claude Code and Codex), not a git hook: it runs `agentlocks git verify`
*before* the agent's `git commit` tool-call and surfaces staged-but-unlocked paths. It emits an
"allow" decision with advice and **never blocks** — `git verify` is read-only, always exits 0, and
writes nothing. (`README.md:109`, `README.md:111`, `README.md:182-184`;
`src/cli/commit-hook-script.ts:7`, `:420-445`; `tests/improvements-040.test.ts:281-298`.)

---

### What if an agent ignores the protocol?

Then it can still clobber — and we say so plainly. Agentlocks is **advisory**: it reports and
records conflicts; it does not patch your editor, shell, or git, so it cannot stop a tool that
doesn't participate. (`README.md:98-100`, `README.md:406`.)

What it does instead:

- `init` writes an instruction block into `AGENTS.md` that Codex and Claude Code read, so
  participating agents lock before editing and staging. (`README.md:176`, `README.md:436`.)
- The opt-out PreToolUse backstop runs `git verify` before a `git commit` tool-call and surfaces
  `uncovered` (staged, no held lock) and `foreign_covered` (covered only by another agent) paths —
  catching the most common real failure, *forgetting to lock*, without blocking the commit.
  (`tests/improvements-040.test.ts:173-210`.)

A hostile or non-participating writer is explicitly out of scope. That trade is *why* there's no
daemon, no privileges, and no background process. If you need enforcement against uncooperative
processes, you want OS-level access control or worktree isolation, not Agentlocks.

---

### Does it work across machines?

No. Agentlocks coordinates **one local worktree** through files under `.agentlocks/locks/`. It is
not a networked lock server and provides no cross-machine consensus, authentication, or encryption.
If your agents run on different machines, this is the wrong tool. (`README.md:413-414`,
`README.md:434-435`.)

---

### Does it work on Windows?

Yes. It's a Node CLI with no native addons, so it runs anywhere Node ≥ 22.18 runs. CI proves it two
ways: a white-box leg runs the **full lock suite on `windows-latest`**
(`.github/workflows/windows-unit.yml`), and a black-box leg installs the packed npm bundle via the
Windows cmd-shim and runs extended conformance on `windows-latest` (`conformance.yml`). Windows is
the platform whose path / spawn / file-rename semantics differ most from the POSIX dev machines, so
it's a required gate, not an afterthought.

---

### Does it require Bun?

No, not to use it. `npm install -g agentlocks` works with no Bun on the machine: Agentlocks ships as
**one small Node bundle** that runs under your own Node — no per-platform binary, no embedded
runtime. It needs Node ≥ 22.18 (the first release that loads a TypeScript `agentlocks.config.ts`
natively). Bun is only needed to **build from source**. (`README.md:32-35`.)

---

### "Advisory" sounds like hope. What concretely stops a clobber?

Between **cooperating** agents, the mechanism is real, not hope:

- `acquire` over a held path returns exit code 3 with the owner, reason, and next command instead of
  letting the write through silently. (`README.md:48-50`.)
- `expand` / `refresh` / `release` require the agent id recorded on the lock, so one agent can't
  drop another's lease. (`README.md:407`.)
- Staging is serialized through the synthetic `@git/index` lock, and `git end` re-checks a fence
  token, aborting with exit 3 if the lease was reclaimed mid-commit. (`README.md:226-234`,
  `README.md:263-264`.)

What it can't do is stop a writer that never calls `acquire`. "Advisory" is precise about that
boundary on purpose. The honest claim is: *cooperating agents stop clobbering each other; that's the
whole job.*

---

### Does the PreToolUse hook block my commits or change my git config?

No to both. The hook runs `agentlocks git verify` before a `git commit` tool-call, and if it finds
staged-but-unlocked paths it adds an advisory note to the agent's context. It emits an `allow`
decision, fails open on any error, and `git verify` itself is read-only and always exits 0. It
installs no git hook and never reconfigures git. You can keep the id-injection-only hook with
`agentlocks init --no-commit-hook`. (`src/cli/commit-hook-script.ts:7`, `:420-445`;
`README.md:182-184`; `tests/improvements-040.test.ts:281-298`.)

---

### What happens if an agent crashes while holding a lock?

Leases are time-bounded (default TTL 10 min, max 30 min) and classified by liveness. The `auto`
adapter probes the owner's harness (the Codex session index or the Claude Code session transcript);
if the owner can't be probed, the lock becomes reclaimable after a short grace window. A reclaimable
lock no longer counts as coverage and can be removed with `prune` (use `prune --dry-run` first). So a
dead agent's claim does not block the worktree forever. (`README.md:408-409`,
`README.md:438-439`; `tests/improvements-040.test.ts:228-249`.)

---

### Why not just let the agents work separately and merge later?

You can, and sometimes should — that's the worktree-per-agent answer above. Merge-later works when
the work is independent. It works badly when the work is coupled: the merge conflict is the
collision you wanted to avoid, now discovered late, on diverged copies, possibly after both agents
built on top of the conflicting change. Agentlocks moves that signal to *edit time* for the shared
case, so the second agent picks a different file (or waits) instead of producing a conflict.

---

### Is this production-ready / stable?

It's pre-1.0 and honest about it: the lock-record schema and CLI contract can change between minor
versions with no migration layer. It had a green local check in the launch baseline (151 tests,
typecheck, and Biome), npm provenance on `agentlocks@0.8.0`, and a CI conformance matrix including
Windows. Treat it as a sharp tool for local multi-agent work, not as infrastructure with long-term
schema guarantees. (`README.md:432-433`; `analyses/trending-baseline/launch-decision-card.md`.)
