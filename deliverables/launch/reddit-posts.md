# Reddit Post Drafts

Status: draft. Do not post until subreddit rules are checked on launch day and the demo GIF is ready.

## r/programming

Title:

```text
Agentlocks: advisory file locks for running multiple coding agents in one Git worktree
```

Body:

I built a small TypeScript CLI for a failure mode I keep hitting with coding agents: two agents work
in the same repo, both touch the same file or the Git index, and the conflict is discovered late.

Agentlocks records advisory leases under `.agentlocks/locks/`. A cooperating agent runs:

```bash
agentlocks acquire src/auth.ts --reason "refactor login" --id-only
```

If a second agent tries the same path, it gets the blocking owner, reason, and next command. There is
also a synthetic `@git/index` lock for staging/commit handoff.

Limitations: it is advisory. It does not patch the editor, shell, or Git. A non-participating tool
can still clobber. Worktrees are better for independent work; Agentlocks is for coupled local work
where two agents need one branch/worktree or shared state around it.

Repo: https://github.com/simke9445/agentlocks

I am looking for criticism of the locking model and the worktree comparison.

## r/ClaudeAI Or Claude Code Community

Title:

```text
I made a small CLI so Claude Code and Codex can coordinate in one repo
```

Body:

I use Claude Code and Codex together and wanted something more concrete than "I am editing this
file" notes.

Agentlocks is a local CLI that lets agents acquire advisory leases over repo-relative paths before
editing. It also installs optional Claude Code/Codex PreToolUse backstops that run `agentlocks git
verify` before a `git commit` tool-call and surface staged-but-unlocked files. The hook is advisory
and never blocks.

The honest positioning:

- use worktrees for independent branches/PRs;
- use Agentlocks when agents need one shared worktree or shared state;
- do not use it as hard enforcement against tools that ignore it.

Repo: https://github.com/simke9445/agentlocks

I would like feedback from people already running Claude Code with other agents or subagents.

## r/commandline

Title:

```text
Agentlocks: a local advisory locking CLI for multi-agent repo work
```

Body:

Agentlocks is a Node CLI for local advisory file leases in a Git repo. It is aimed at coding-agent
workflows, but the interface is a normal command-line contract:

```bash
npm install -g agentlocks
agentlocks init
agentlocks acquire README.md --reason "edit docs" --id-only
agentlocks status --json
agentlocks release <lock_id>
```

It records JSON lock files under `.agentlocks/locks/`, has TTL/liveness-based stale recovery, and
provides a synthetic `@git/index` lock for staging/commit coordination.

It is not a daemon or cross-machine lock server. It coordinates cooperating local tools only.

Repo: https://github.com/simke9445/agentlocks

## Posting Rules

- Read the current subreddit rules before posting.
- Do not cross-post identical copy in many communities on the same day.
- Lead with limitations if the audience is skeptical.
- Do not argue with "just use worktrees"; explain the independent-vs-coupled split once and move on.
