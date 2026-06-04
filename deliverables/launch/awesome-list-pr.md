# Awesome List PR Draft

Status: draft. Do not submit until README top-fold, demo, and latest npm install are ready.

## Target Lists

Prioritize lists where Agentlocks is a natural fit:

- `hesreallyhim/awesome-claude-code`
- `e2b-dev/awesome-ai-agents`
- `RoggeOhta/awesome-codex-cli`
- `VoltAgent/awesome-claude-code-subagents`
- `rohitg00/awesome-claude-code-toolkit`

Check each list's contribution rules before opening a PR. Do not submit if the list only accepts
widely adopted tools or if the category would be forced.

## Suggested Entry

```markdown
- [Agentlocks](https://github.com/simke9445/agentlocks) - Advisory file locks for coordinating Codex,
  Claude Code, and other coding agents in one shared Git worktree.
```

Shorter variant:

```markdown
- [Agentlocks](https://github.com/simke9445/agentlocks) - Advisory file locks for multi-agent coding
  in one Git worktree.
```

## PR Body

```markdown
Adds Agentlocks, a local CLI for advisory file leases between coding agents working in one Git
worktree.

Why it fits this list:

- It targets Claude Code / Codex / coding-agent workflows directly.
- It is local and open source, with npm install and no hosted service.
- It documents the advisory limitation clearly: cooperating agents opt in; it is not hard
  enforcement.

I am happy to adjust the category or wording to fit this list's style.
```

## Maintainer Response Rules

- If rejected as too new, thank the maintainer and come back only after real adoption.
- If asked to shorten, use the shorter variant.
- If challenged on "why not worktrees," link the README section rather than debating in the PR.
- Do not open several PRs in one burst before the launch demo is ready.
