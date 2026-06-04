# X Thread Draft

Status: draft. Demo media exists; do not post until the latest npm install is re-verified and the
maintainer approves launch timing.

## Thread

1/ I built Agentlocks: advisory file locks so Codex and Claude Code can work in one shared Git
worktree without silently clobbering each other.

The second overlapping agent gets the blocking owner, reason, and next command.

[attach `assets/agentlocks-demo-collision.gif`]

2/ The common answer is "use one git worktree per agent."

That is right for independent work.

Agentlocks is for the coupled case: one branch, one live app, shared generated state, fast
Codex/Claude handoffs, and collisions you want surfaced at edit time instead of merge time.

3/ It is deliberately advisory.

It coordinates agents that opt in. It does not patch your editor, shell, or Git. A tool that ignores
the protocol can still clobber files.

That trade keeps it local and boring: no daemon, no hosted service, just files under
`.agentlocks/locks/`.

4/ Basic flow:

```bash
npm install -g agentlocks
agentlocks init
lock=$(agentlocks acquire src/auth.ts --reason "refactor login" --id-only)
agentlocks refresh "$lock"
agentlocks release "$lock"
```

Node >= 22.18. Bun is only needed to build from source.

5/ There is also a Git-index handoff:

```bash
{ read git_lock; read git_token; } < <(agentlocks git begin --refresh-lock "$lock" --reason "commit" --id-only)
git add <locked paths>
git commit
agentlocks git end "$git_lock" --git-token "$git_token" --release-lock "$lock"
```

6/ Dogfood: the launch artifacts were drafted and reviewed by Codex and Claude Code in one shared
worktree coordinated by Agentlocks.

The tool's own launch made the coordination problem concrete.

7/ Repo:

https://github.com/simke9445/agentlocks

I want sharp criticism on the advisory boundary and the worktree comparison. If the README
overclaims, I will fix it.

## Media

Attach `assets/agentlocks-demo-collision.gif`.

## Short Post Variant

Agentlocks is a small CLI for running Codex + Claude Code in one shared Git worktree.

It is advisory, not magic: agents opt in, lock paths before editing, and the second overlapping agent
gets owner + reason + next command instead of a silent clobber.

Repo: https://github.com/simke9445/agentlocks
