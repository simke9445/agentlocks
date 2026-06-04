# Outreach Email Brief

Status: draft. Use only for people who reasonably care about coding-agent workflows. Do not spam.

## Who To Send To

Good targets:

- developers publicly using both Codex and Claude Code;
- maintainers of agent-tooling newsletters or link roundups;
- authors of multi-agent workflow repos or guides;
- people who recently complained about agents overwriting each other, stale handoffs, or branch
  sprawl.

Bad targets:

- generic VC/newsletter inboxes with no dev-tool audience;
- maintainers of unrelated AI lists;
- anyone who would need a cold explanation of what Codex or Claude Code is.

## Short Email

Subject:

```text
Small CLI for Codex + Claude Code shared-worktree coordination
```

Body:

```text
Hi <name>,

I built Agentlocks, a small open-source CLI for coordinating multiple coding agents in one Git
worktree:

https://github.com/simke9445/agentlocks

It gives cooperating agents advisory file leases. If Codex holds `src/auth.ts` and Claude Code tries
the same path, Claude gets the blocking owner, reason, and next command instead of silently
overlapping. It also has a synthetic `@git/index` lock for staging/commit handoff.

The honest boundary: it is advisory, local, and opt-in. It does not patch editors, shells, or Git,
and worktrees are still better for independent branches.

I am launching it for people already running multiple coding agents and would value sharp feedback
on the "why not worktrees?" answer.

Thanks,
Djordje
```

## Follow-Up Rules

- One follow-up maximum.
- Do not ask for a star.
- Ask for criticism, not promotion.
- If they share feedback, turn repeated confusion into README/FAQ edits before wider posting.
