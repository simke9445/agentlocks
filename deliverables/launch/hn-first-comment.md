# HN First Comment

The maintainer posts this as the **first comment** under the Show HN, immediately after submission.
First-person, maintainer voice. Goal: disarm the two objections that will otherwise dominate the
thread (advisory ≠ enforcement; why not worktrees) before anyone else raises them, and invite
criticism rather than defend.

Keep it honest and short. Do not edit in marketing language. Do not claim enforcement.

---

## Comment text (paste this)

Author here. Quick, honest framing before the obvious objections land.

**What it is:** Agentlocks is a small TypeScript CLI that gives coding agents (I use Codex and
Claude Code together) advisory file *leases* so they can work in **one shared Git worktree** without
silently overwriting each other. An agent runs `agentlocks acquire src/auth.ts` before editing; a
second agent that tries the same path gets a clean conflict — blocking owner, its reason, and the
exact command to run next — instead of a silent overwrite. It's just files under
`.agentlocks/locks/`: no daemon, no database, no service.

**It's advisory, and I want to be precise about what that means.** It coordinates agents that opt in
and call it before editing and staging. It does **not** patch your editor, shell, or git, so it
cannot stop a tool that ignores the protocol. There's an opt-out PreToolUse hook for Codex and
Claude Code that runs `agentlocks git verify` before a `git commit` tool-call and *surfaces*
staged-but-unlocked paths — but it **never blocks the commit** (it emits "allow" with an advisory
note and fails open). If you were hoping for hard, kernel-enforced locking, this isn't that, and the
README says so.

**"Why not one `git worktree` per agent?"** Fair, and for *independent* work that lands as separate
PRs, a worktree per agent is the right tool — it's real filesystem isolation, it's enforced, and you
don't need this. Agentlocks is for the case worktrees don't cover well: work that must share one
tree, or one piece of coupled state around that tree. Worktrees isolate working directories, which
means a dev server, DB state, build dir, cache, or generated output is either duplicated per copy or
shared some other way without coordination. They also defer overlapping edits to merge time and
force a branch per agent even when you wanted both agents on one line of history with fast handoffs.
Different axis: worktrees *isolate*, Agentlocks *coordinates*, and you can use both — a worktree per
feature, Agentlocks inside one that two agents share.

**Dogfood:** the launch artifacts were drafted and reviewed by Claude Code and Codex in one shared
worktree coordinated by Agentlocks: lease before editing, refresh while iterating, and use the
synthetic `@git/index` lock for staging/commit handoff.

I'd genuinely like to hear where the advisory model breaks for your workflow, and where you think
worktrees are simply the better answer. Repo, install (`npm install -g agentlocks`, Node ≥ 22.18, no
Bun needed), and a limitations section are linked above. Happy to fix wrong claims today.

---

## Pre-loaded follow-up replies (only if asked)

**"Advisory is useless / just use hard locks."** On a shared worktree there is no portable hard lock
for arbitrary file edits without intercepting the editor/shell/git — which would need a daemon and
privileges, the things that keep this zero-infra. Advisory is the honest ceiling for cooperative
agents. The backstop catches the common real failure (you staged a file you never locked) at commit
time without blocking you.

**"What stops an agent from ignoring it?"** Nothing forces a non-participant. Two mitigations:
`init` writes an instruction block into `AGENTS.md` that Codex and Claude Code read, and the
PreToolUse `git verify` backstop flags uncovered staged paths before a commit tool-call. Both are
advisory. A hostile or non-participating writer is explicitly out of scope.

**"Doesn't this need Bun?"** No. It ships as one Node bundle that runs under your Node (≥ 22.18,
the first release that loads a TypeScript config natively). Bun is only for building from source.

**"Windows?"** It's a Node CLI with no native addons. CI runs the full lock suite on
`windows-latest` plus black-box conformance on the packed npm bundle there.

**"Cross-machine / team server?"** No — single local worktree, files under `.agentlocks/locks`. Not
a networked lock server, by design.
