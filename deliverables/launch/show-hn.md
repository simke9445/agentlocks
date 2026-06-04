# Show HN Draft

Status: draft. Do not post until Phase 2 correctness, Phase 3 demo, README top-fold, and npm install
verification are green.

## Title Options

1. Show HN: Agentlocks - advisory file locks for Codex and Claude Code in one worktree
2. Show HN: I built a small CLI so coding agents stop clobbering each other
3. Show HN: Advisory locks for running multiple coding agents in one Git worktree

Recommended: option 1. It names the product, the mechanism, and the audience without overclaiming.

## Submission URL

Use the GitHub repo URL after README top-fold and demo are merged:

```text
https://github.com/simke9445/agentlocks
```

## Submission Text

I built Agentlocks because I wanted Codex and Claude Code working in the same repo without relying on
chat notes like "I am editing this file" and hoping they stay current.

It is a small TypeScript CLI that records advisory leases under `.agentlocks/locks/`. A cooperating
agent runs `agentlocks acquire <paths> --reason "<intent>"` before editing. If another agent tries to
acquire an overlapping path, it gets the blocking owner, reason, and next command instead of a silent
overlap. There is also a synthetic `@git/index` lock for staging/commit handoff and an advisory
PreToolUse backstop for Codex/Claude Code commit tool-calls.

This is not hard enforcement. It does not patch your editor, shell, or Git, and it cannot stop a tool
that ignores it. Worktrees are still the right answer for independent work. Agentlocks is for coupled
local work where two agents need one branch, one working tree, or shared state around that tree.

Install:

```bash
npm install -g agentlocks
agentlocks init
agentlocks acquire README.md --reason "edit docs" --id-only
```

The launch artifacts were drafted and reviewed with Codex and Claude Code in one shared worktree
coordinated by Agentlocks. The limitations are in the README; I would especially like criticism of
the advisory model and the "why not one worktree per agent?" answer.

## First Comment

Use `deliverables/launch/hn-first-comment.md`.

## Do Not Post If

- `bun run check` is red.
- The npm global install path has not been verified from the latest published package.
- The README top fold has no visual collision demo.
- The first comment still sounds like hard enforcement.
- The maintainer cannot spend the next several hours answering questions.
