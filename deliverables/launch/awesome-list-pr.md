# Awesome List PR And Scope-Check Drafts

Status: draft. Do not submit anything until README top-fold, demo, latest npm install, and the
maintainer's launch timing are ready.

These drafts are derived from `analyses/trending-research/phase6-distribution-targets.md`. They
separate high-fit PR targets from category-uncertain lists. A list inclusion is a credibility
surface, not an early user or reposter.

## High-Fit PR Targets

Open these only after checking each repository's current contribution rules.

| Target | Why it fits | Draft type |
| --- | --- | --- |
| `hesreallyhim/awesome-claude-code` | widely referenced Claude Code resource list; Agentlocks directly supports Claude Code shared-worktree coordination | PR |
| `rohitg00/awesome-claude-code-toolkit` | toolkit has ecosystem/resource entries; Agentlocks is a practical CLI utility | PR |
| `andyrewlee/awesome-agent-orchestrators` | agent-orchestrator list with `git-worktree` and `agent-coordination` topics | PR |

Do not prioritize dormant or category-mismatched lists before these. In particular:

- `e2b-dev/awesome-ai-agents` is broad and stale by `pushedAt`; keep it on watchlist.
- `ccplugins/awesome-claude-code-plugins` is plugin-focused; Agentlocks is not a plugin.

Second-wave PR targets after the first three are opened or accepted:

- `jqueryscript/awesome-claude-code`
- `RoggeOhta/awesome-codex-cli`
- `milisp/awesome-codex-cli`

## Suggested Entry

Default:

```markdown
- [Agentlocks](https://github.com/simke9445/agentlocks) - Advisory file locks so multiple AI
  coding agents, such as Claude Code and Codex, can share one Git worktree.
```

Short:

```markdown
- [Agentlocks](https://github.com/simke9445/agentlocks) - Advisory file locks for multiple AI
  coding agents sharing one Git worktree.
```

Long:

```markdown
Agentlocks is a local CLI that lets participating coding agents acquire path locks before editing,
reports the owner/reason/next command on conflicts, and provides a synthetic `@git/index` lock for
staging and commit handoff. It is advisory, not OS-enforced, and is meant for cooperative local
multi-agent workflows.
```

## PR Body: Claude Code List

```markdown
Adds Agentlocks, a small local CLI for advisory file locks between coding agents working in one Git
worktree.

Why it fits this list:

- It targets Claude Code and adjacent coding-agent workflows directly.
- It is local, open source, and installable from npm.
- It documents the advisory boundary clearly: cooperating agents opt in; it is not hard
  enforcement.
- It answers the "why not one worktree per agent?" split: use worktrees for independent branches,
  use Agentlocks when agents intentionally share one branch/worktree or generated state.

Happy to adjust the category or wording to fit the list style.
```

## PR Body: Toolkit List

```markdown
Adds Agentlocks as a practical workflow utility for Claude Code/Codex users.

Agentlocks coordinates participating agents with advisory path leases and an optional `@git/index`
handoff lock. It is useful when multiple agents need one shared worktree rather than isolated
worktrees.

The project is explicit that the locks are advisory and local; tools that ignore the protocol can
still edit files.
```

## PR Body: Agent-Orchestrator List

```markdown
Adds Agentlocks, an advisory file-locking CLI for multi-agent coding workflows.

It can complement orchestrators by giving agents a simple external command contract:

- acquire repo-relative paths before editing;
- report conflict owner, reason, and next action;
- coordinate staging/commit through a synthetic `@git/index` lock;
- verify staged-but-unlocked paths before commit.

It is not a replacement for worktrees or orchestrators. It is a coordination primitive for
cooperative agents that intentionally share one Git worktree.
```

## Scope-Check Issue Targets

Use these before opening a PR to skills/tools lists where a standalone CLI may be out of category.

| Target | Question |
| --- | --- |
| `VoltAgent/awesome-agent-skills` | Are standalone agent workflow CLIs in scope, or only installable skills? |
| `ComposioHQ/awesome-codex-skills` | Are Codex-adjacent local CLIs in scope, or only Codex skills? |
| `Prat011/awesome-llm-skills` | Are agent workflow utilities accepted when they are CLIs rather than skills? |
| `AutoJunjie/awesome-agent-harness` | Are small coordination primitives accepted alongside full harnesses? |

`AutoJunjie/awesome-agent-harness` is intentionally downgraded from direct PR to scope-check here:
Agentlocks is a small CLI coordination primitive, not a full harness.

Scope-check issue draft:

```markdown
Hi, quick scope check before I open a PR.

Would a small local CLI for coordinating AI coding agents be in scope for this list?

Project: https://github.com/simke9445/agentlocks

One-line description:

> Advisory file locks so multiple AI coding agents, such as Claude Code and Codex, can share one Git
> worktree.

It is not a model, prompt pack, hosted service, or hard lock. It is a local command-line tool that
participating agents can call before editing paths, plus a Git-index handoff lock for commits.

Specifically: <paste the target-specific question from the table above>.

If that is outside this list's scope, no worries; I wanted to ask before opening a PR.
```

## Maintainer Response Rules

- If rejected as too new, thank the maintainer and come back only after real adoption.
- If rejected as out of scope, do not argue.
- If asked to shorten, use the short entry.
- If challenged on "why not worktrees," link the README section and state the independent-vs-coupled
  split once.
- Do not open several PRs in one burst before the launch demo is ready.
- Do not ask for stars.
- Do not imply affiliation with Claude Code, Codex, Anthropic, OpenAI, or the target repo; name them
  only as compatible tools.
- The list entry is the one-line suggested entry; the PR-body bullets are for the PR description
  only, not the entry text.
- If invited to PR after a scope-check, open exactly one tiny category-matched PR and stop.
- At most one contact per organization per launch window unless a maintainer explicitly invites
  another.
