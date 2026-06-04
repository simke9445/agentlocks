# Phase 6 Distribution Targets

Captured: 2026-06-04T17:02Z

Purpose: identify credible launch surfaces and early-user/reposter targets for Agentlocks before
any public launch post. This is a distribution plan, not permission to post. All external posts,
PRs, issues, comments, emails, and direct messages remain human-gated.

## Executive Read

The highest-signal path is not generic social posting. It is:

1. Tighten the launch story around "Codex and Claude Code can share one worktree without silent
   file collisions."
2. Submit narrowly scoped PRs to high-fit awesome lists that already curate Claude Code, Codex, and
   agent-tooling resources.
3. Ask adjacent agent-tooling builders to evaluate Agentlocks as a complementary shared-worktree
   coordination layer, not as a replacement for their worktree, dashboard, session, or agent
   harness.
4. Launch on Show HN only after the README/demo/release path is fully current and the maintainer has
   time to answer objections live.

The 10,000-star-in-30-days goal still requires an outside distribution event: front-page HN,
large-account amplification, a major awesome-list inclusion, or an influential agent-tooling builder
showing a real workflow. Repo polish improves conversion; it will not create that event by itself.

This artifact identifies distribution surfaces and candidate early-user/reposter targets. Awesome
lists are passive credibility surfaces, not users. The adjacent-builder targets below are the
candidate users/reposters; none are confirmed until a real conversion signal exists, such as an
accepted PR, maintainer reply, integration issue, public mention, or tested workflow.

## Evidence Commands

These commands were run from `/Users/djsimovic/Work/agentlocks`.

```bash
gh repo view simke9445/agentlocks --json nameWithOwner,description,stargazerCount,forkCount,watchers,diskUsage,createdAt,updatedAt,pushedAt,primaryLanguage,repositoryTopics,hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,homepageUrl,url,usesCustomOpenGraphImage
gh search repos 'awesome claude code' --limit 12 --json fullName,description,stargazersCount,updatedAt,url,owner
gh search repos 'awesome codex cli' --limit 12 --json fullName,description,stargazersCount,updatedAt,url,owner
gh search repos 'topic:codex-cli' --limit 20 --json fullName,description,stargazersCount,updatedAt,url,owner,language
gh search repos 'topic:coding-agents' --limit 25 --json fullName,description,stargazersCount,updatedAt,url,owner,language
gh search repos 'topic:ai-coding-agent' --limit 25 --json fullName,description,stargazersCount,updatedAt,url,owner,language
gh repo view johannesjo/parallel-code --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view pchalasani/claude-code-tools --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view maxritter/pilot-shell --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view VoltAgent/awesome-agent-skills --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view e2b-dev/awesome-ai-agents --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view andyrewlee/awesome-agent-orchestrators --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view AutoJunjie/awesome-agent-harness --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
gh repo view Prat011/awesome-llm-skills --json nameWithOwner,description,stargazerCount,pushedAt,updatedAt,url,repositoryTopics,hasIssuesEnabled
socket --help
socket package score npm agentlocks --markdown
socket package score --help
socket scan create --help
socket scan create --read-only --markdown --repo=agentlocks --branch=main package.json bun.lock
```

Socket references used for interpretation:

- Pricing and free/open-source notes: https://socket.dev/pricing
- CLI overview: https://docs.socket.dev/docs/socket-cli
- Package scoring docs: https://docs.socket.dev/docs/socket-package
- Scan docs: https://docs.socket.dev/docs/socket-scan
- Package score model: https://docs.socket.dev/docs/package-scores

## Current Repo Baseline For Distribution

Live GitHub state on 2026-06-04:

- Repo: https://github.com/simke9445/agentlocks
- Description: `Advisory file locks so multiple AI coding agents can share one Git worktree.`
- Stars: 2
- Watchers: 0
- Discussions: disabled
- Custom Open Graph image: enabled
- Topics include `claude-code`, `codex`, `coding-agent`, `multi-agent`, `file-locking`,
  `worktree`, `cli`, and `bun`.

Live Socket state for the currently published package:

- Published package measured: `npm/agentlocks@0.8.0`
- Shallow score: overall 75, maintenance 91, quality 99, supply-chain 75, vulnerability 100,
  license 100.
- Deep score: overall 75, maintenance 89, quality 99, supply-chain 75, vulnerability 100,
  license 100.
- Deep maintenance is floored by published `commander@14.0.3`.
- Socket read-only scan finds local `package.json` and `bun.lock`, then stops before creating a
  report.

Interpretation: package score changes require a new npm publish and Socket re-check. A repo scan is
useful for policy/reporting, but it is not a local way to preview the published-package score for
unpublished code.

Internal Socket API/pricing note, verified on 2026-06-04: the official pricing page lists a Free
plan with 1,000 scans per month, 500 API quota per hour, and 1 API token, and states that Socket is
free for open-source projects. The CLI also prints per-command quota/scopes: `socket package score`
requires `packages:list` and 100 units; `socket scan create` requires `full-scans:create` and 1
unit. Verify these facts again before embedding them in public docs.

## Target Scoring Rubric

Use this 100-point rubric before spending maintainer attention on a target.

| Criterion | Points | Meaning |
| --- | ---: | --- |
| Audience fit | 30 | Does the audience use Claude Code, Codex, multi-agent CLIs, or worktree-heavy workflows? |
| Reach | 20 | Does the surface plausibly expose Agentlocks to enough relevant users? |
| Recency | 15 | Was repo content pushed in the last 30 days? Use `pushedAt`, not `updatedAt`. |
| Accepted contribution path | 15 | Is there a normal route such as PRs, issues, discussions, or launch threads? |
| Complementary angle | 10 | Can Agentlocks be framed as additive, not competitive? |
| Risk control | 10 | Low spam risk, no misleading claim needed, no suspicious target quality. |

Grades:

- A: 80-100. Prepare a tailored PR, issue, comment, or launch ask.
- B: 65-79. Use after A targets, or include only if there is a natural context.
- C: 50-64. Watchlist only.
- Reject: below 50, stale, spammy, unrelated, or no permission-respecting path.

## Awesome-List Surfaces

These are the cleanest first move because the accepted action is a normal open-source contribution,
not cold outreach. They are credibility surfaces, not early users. Each PR should be tiny,
category-matched, and use neutral copy. Recency below uses `pushedAt`, not GitHub `updatedAt`.

| Target | Evidence | Score | Action | Angle |
| --- | --- | ---: | --- | --- |
| https://github.com/hesreallyhim/awesome-claude-code | 45,667 stars; last push 2026-04-27; canonical Claude Code tools list, but just outside the 30-day recency window | 86 | PR after checking contribution rules | Claude Code shared-worktree safety tool |
| https://github.com/rohitg00/awesome-claude-code-toolkit | 1,945 stars; last push 2026-05-12; toolkit includes ecosystem entries | 86 | PR | CLI utility for shared-worktree Claude Code teams |
| https://github.com/andyrewlee/awesome-agent-orchestrators | 669 stars; last push 2026-06-04; topics include git-worktree and agent coordination | 88 | PR | Advisory lock layer for orchestrators using shared repos |
| https://github.com/jqueryscript/awesome-claude-code | 407 stars; last push 2026-05-28; Claude Code resources | 78 | PR | Shared-worktree Claude Code utility |
| https://github.com/VoltAgent/awesome-agent-skills | 24,214 stars; last push 2026-05-27; skills list, CLI category unconfirmed | 78 | Open scope-check issue before PR | Agentlocks as an agent workflow utility, not a skill bundle |
| https://github.com/ComposioHQ/awesome-codex-skills | 12,915 stars; last push 2026-05-15; Codex skills/resource list, CLI category unconfirmed | 76 | Open scope-check issue before PR | Codex multi-agent filesystem coordination |
| https://github.com/RoggeOhta/awesome-codex-cli | 257 stars; last push 2026-04-11; exact Codex CLI fit but outside 30-day recency window | 74 | PR, lower urgency | Codex CLI file-locking companion |
| https://github.com/AutoJunjie/awesome-agent-harness | 437 stars; last push 2026-04-19; agent harness list outside 30-day recency window | 72 | PR, lower urgency | Harness-level lock coordination |
| https://github.com/Prat011/awesome-llm-skills | 1,290 stars; last push 2026-04-22; skills/tools list, category unconfirmed and outside 30-day recency window | 72 | Open scope-check issue before PR | Cross-agent workflow safety |
| https://github.com/milisp/awesome-codex-cli | 74 stars; last push 2026-05-19; exact-fit Codex list, smaller reach | 70 | PR | Smaller but exact-fit Codex list |
| https://github.com/e2b-dev/awesome-ai-agents | 28,149 stars; last push 2025-02-26; broad autonomous-agent list, weak devtool fit, dormant | 52 | Watchlist only | Do not prioritize for launch |
| https://github.com/ccplugins/awesome-claude-code-plugins | 816 stars; last push 2025-10-14; plugin list, category mismatch, dormant | 46 | Skip unless category explicitly allows CLIs | Agentlocks is not a plugin |

Neutral PR listing copy:

```markdown
- [Agentlocks](https://github.com/simke9445/agentlocks) - Advisory file locks for teams running
  multiple AI coding agents, such as Claude Code and Codex, in one shared Git worktree.
```

Use a longer variant only where the list prefers descriptions:

```markdown
Agentlocks is a small CLI that lets participating agents acquire path locks before editing, report
who owns a conflicting file, and verify staged changes before commit. It is advisory rather than an
OS-enforced lock, so it is best for cooperative local multi-agent workflows.
```

## Candidate Early Users/Reposters: Adjacent Builders

These are candidate early users/reposters, not confirmed users. The right move is usually a public
issue/discussion only when it helps their users, or a human-authored launch reply that is relevant
to their existing framing. "Issues enabled" is a route, not a conversion signal. A target becomes
credible only after a maintainer reply, accepted PR, integration issue, tested workflow, or public
mention.

| Target | Evidence | Score | Conversion signal | Complementary angle |
| --- | --- | ---: | --- | --- |
| https://github.com/johannesjo/parallel-code | 701 stars; last push 2026-06-03; runs Claude Code, Codex, Gemini in separate worktrees | 91 | Issues enabled; exact contrast, no confirmed interest | Separate worktrees isolate agents; Agentlocks coordinates one shared worktree |
| https://github.com/Ataraxy-Labs/weave | 1,105 stars; last push 2026-05-31; entity-level merge driver for independent agents editing same files | 88 | Issues enabled; exact collision theme, no confirmed interest | Weave resolves merge conflicts; Agentlocks helps participating agents avoid collisions earlier |
| https://github.com/standardagents/dmux | 1,618 stars; last push 2026-05-25; dev agent multiplexer for git worktrees and coding agents | 87 | Issues enabled; high topic fit, no confirmed interest | Shared repo coordination for sessions that intentionally converge |
| https://github.com/Ataraxy-Labs/opensessions | 1,087 stars; last push 2026-05-27; tmux sidebar for Amp, Claude Code, Codex, OpenCode sessions | 86 | Issues enabled; session-tool fit, no confirmed interest | Session visibility plus filesystem/Git-index coordination |
| https://github.com/wshobson/agents | 36,347 stars; last push 2026-06-02; multi-harness plugin marketplace for Claude Code, Codex CLI, Cursor, OpenCode, Gemini | 85 | Issues enabled; very large adjacent ecosystem, no confirmed interest | Agentlocks as a reusable workflow utility for multi-harness setups |
| https://github.com/golutra/golutra | 3,644 stars; last push 2026-05-31; multi-agent orchestration platform for Codex, Claude Code, OpenClaw | 84 | Issues enabled; orchestration fit, no confirmed interest | External lock contract for local parallel execution |
| https://github.com/mksglu/context-mode | 16,419 stars; last push 2026-06-04; context-window optimization for AI coding agents | 83 | Issues enabled; strong agent-infra reach, no confirmed interest | Complements context control with file ownership control |
| https://github.com/pchalasani/claude-code-tools | 1,825 stars; last push 2026-05-22; productivity tools for Claude Code, Codex CLI, similar agents | 83 | Issues enabled; likely tools-list fit, no confirmed interest | Add Agentlocks as a practical CLI safety tool |
| https://github.com/maxritter/pilot-shell | 1,737 stars; last push 2026-06-03; production-ready Claude Code/Codex workflow | 82 | Issues enabled; workflow fit, no confirmed interest | Add lock discipline to enforced agent workflow |
| https://github.com/codeaholicguy/ai-devkit | 1,234 stars; last push 2026-06-04; repeatable engineering workflow across agents | 81 | Issues enabled; workflow fit, no confirmed interest | File locks as part of repeatable agent workflow |
| https://github.com/ComposioHQ/agent-orchestrator | 7,406 stars; last push 2026-06-01; parallel coding-agent orchestrator | 80 | Issues enabled; orchestrator fit, no confirmed interest | Orchestrators can use Agentlocks as an external coordination contract |
| https://github.com/milisp/codexia | 710 stars; last push 2026-06-01; Codex CLI and Claude Code workstation with scheduler, worktrees, remote control | 80 | Issues enabled; exact operator fit, no confirmed interest | Shared-worktree lock layer for agent workstations |
| https://github.com/ChesterRa/cccc | 883 stars; last push 2026-06-04; coordinates coding agents with read receipts and remote ops | 79 | Issues enabled; coordination fit, no confirmed interest | File-level ownership as another coordination signal |
| https://github.com/generalaction/emdash | 4,752 stars; last push 2026-06-04; open-source agentic development environment for parallel agents | 78 | Issues enabled; product fit, no confirmed interest | Repo-level coordination primitive for parallel agents |
| https://github.com/ogulcancelik/herdr | 4,263 stars; last push 2026-06-04; terminal agent multiplexer | 78 | Issues enabled; multiplexer fit, no confirmed interest | Multiplexing plus advisory path ownership |
| https://github.com/slopus/happy | 21,583 stars; last push 2026-06-01; mobile/web client for Codex and Claude Code | 78 | Issues enabled; high reach, no confirmed interest | Remote agent control plus local collision awareness |
| https://github.com/dohooo/helmor | 1,153 stars; last push 2026-06-04; local workbench for multi-agent software development | 77 | Issues enabled; exact local-workbench fit, no confirmed interest | Shared workspace safety primitive |
| https://github.com/liaohch3/claude-tap | 1,406 stars; last push 2026-06-04; local trace viewer for Claude Code, Codex CLI, Gemini CLI, Cursor CLI, OpenCode | 77 | Issues enabled; observability fit, no confirmed interest | Request/session tracing plus file ownership tracing |
| https://github.com/jazzyalex/agent-sessions | 609 stars; last push 2026-06-02; session browser for Codex, Claude Code, OpenCode, Gemini, Pi, Copilot, OpenClaw, Hermes | 76 | Issues enabled; session-management fit, no confirmed interest | Session management plus lock-state awareness |
| https://github.com/paperboytm/spool | 551 stars; last push 2026-06-02; local AI session library for Claude Code, Codex, Gemini, OpenCode | 76 | Issues enabled; local-first session fit, no confirmed interest | Session library plus collision evidence |
| https://github.com/sipyourdrink-ltd/bernstein | 543 stars; last push 2026-06-04; audit-grade multi-agent orchestration for CLI coding agents | 75 | Issues enabled; audit/workflow fit, no confirmed interest | Advisory locks as audit-friendly artifact ownership |
| https://github.com/graykode/abtop | 2,496 stars; last push 2026-05-29; monitoring for Claude Code and Codex CLI sessions | 74 | Issues enabled; monitoring fit, no confirmed interest | Monitoring sees sessions; Agentlocks coordinates their edits |
| https://github.com/microsoft/apm | 2,750 stars; last push 2026-06-04; Agent Package Manager | 73 | Issues enabled; broad ecosystem fit, no confirmed interest | Agentlocks as packageable agent workflow utility |
| https://github.com/Open-ACP/OpenACP | 409 stars; last push 2026-05-18; bridge for Claude Code, Codex, and messaging platforms via ACP | 72 | Issues enabled; protocol fit, no confirmed interest | Agentlocks as a local command contract |
| https://github.com/saltbo/agent-kanban | 326 stars; last push 2026-05-23; agent-first task board | 70 | Issues enabled; workflow fit, no confirmed interest | Locks make task ownership concrete at file level |
| https://github.com/can1357/oh-my-pi | 10,495 stars; last push 2026-06-04; AI coding agent for the terminal | 69 | Issues enabled; high reach but less direct multi-agent fit | Possible user of advisory locks, not a launch priority |

Outreach copy must not say "prevents all overwrites" or "enforces locks." The accurate phrase is:

> coordinates participating agents and detects staged-but-unlocked changes before commit.

## Launch Channels

| Channel | Priority | Required asset | Gate |
| --- | --- | --- | --- |
| Awesome-list PRs | Highest | One-line neutral listing plus README proof | Maintainer approves PR targets and wording |
| Show HN | High, gated on demo/release | `deliverables/launch/show-hn.md` and `hn-first-comment.md` | Maintainer has 2-4 hours available for replies |
| X/Twitter | High if maintainer account has reach | `deliverables/launch/x-thread.md`, demo image/GIF | Human posts from authentic account |
| Reddit | Low/medium; high spam risk | `deliverables/launch/reddit-posts.md`, tailored per subreddit | Post only where self-promotion rules allow it |
| Product Hunt | Low | Polished demo video/GIF, short tagline | Use only if visual demo is strong enough |
| Newsletters | Medium | `deliverables/launch/email-brief.md` | Human-curated list; no scraped mass email |
| GitHub Discussions | Medium | Launch feedback thread | Enable Discussions or create a launch feedback issue |
| Discord/Slack communities | Medium | Short demo-first post | Only communities where maintainer is already a member or has permission |
| LinkedIn | Low/medium | Practitioner framing | Use if maintainer has relevant network |

## Socket Workflow For Launch Readiness

Socket package scoring is useful as a public trust signal, but the current score is tied to the
published npm package. Current overall/supply-chain score is 75, which is adequate for internal
tracking but not strong enough to foreground as a public trust flex. Do not mention Socket in launch
copy unless a new npm release is published, rechecked, and materially stronger.

Use this sequence before mentioning Socket in public copy:

```bash
socket package score npm agentlocks --markdown
socket scan create --read-only --markdown --repo=agentlocks --branch=main package.json bun.lock
```

After a new npm release:

```bash
socket package score npm agentlocks@<new-version> --markdown
socket package score npm agentlocks --markdown
```

If the maintainer wants a dashboard scan:

```bash
socket scan create --repo=agentlocks --branch=main --default-branch --report --markdown package.json bun.lock
```

The dashboard scan consumes API quota and creates remote Socket state. Run it only after maintainer
approval unless explicitly requested.

## Anti-Spam Rules

- Do not cold-DM maintainers from scraped GitHub search results.
- Prefer PRs to repos that explicitly curate tools.
- For adjacent builders, engage only where Agentlocks solves a concrete user workflow.
- Do not post identical copy across communities.
- Do not ask for stars directly.
- Do not imply affiliation with Claude Code, Codex, OpenAI, Anthropic, or any target repo.
- Do not claim a 100 Socket score, OpenSSF score, or release property unless verified live.
- Do not argue with skeptics. Answer the advisory-lock limitation once, then link to the README.

## Pre-Launch Outreach Packet

Prepare these before contacting anyone:

- A one-line description.
- A 20-second demo link or README anchor.
- The honest advisory-lock caveat.
- `npm install -g agentlocks` verified against the latest release.
- Current Socket result after the release intended for launch.
- Current OpenSSF Scorecard link.
- Current CI and CodeQL links.
- A public feedback route: Discussions or a launch feedback issue.

## Decision Gates

Proceed to public launch only when:

- The next npm release is published if Socket/package optics are meant to be part of the story.
- `socket package score npm agentlocks --markdown` has been re-run and recorded.
- HN title, first comment, and README top fold all say "advisory" consistently.
- At least 3 high-fit list PRs are prepared or opened: `hesreallyhim/awesome-claude-code`,
  `rohitg00/awesome-claude-code-toolkit`, and `andyrewlee/awesome-agent-orchestrators`.
- At least 4 scope-check issues are prepared for skills/tools lists where CLI utilities may or may
  not be in scope.
- At least 20 adjacent-builder targets have tailored, non-competitive notes, with status tracked as
  `target`, `contacted`, `replied`, `tested`, `mentioned`, or `declined`.
- The maintainer approves every outbound channel and timing window.

Do not treat this artifact as launch approval. It is the target map for the human approval step.

## Claude Code Review

Claude Code reviewed the first version of this Phase 6 artifact and scored it 65/100. Blocking
corrections were:

- recency must use `pushedAt`, not `updatedAt`;
- passive awesome-list entries are distribution surfaces, not early users or reposters;
- skills-list targets need scope checks before PRs because Agentlocks is a CLI, not a skill bundle;
- launch gates must not require an unsatisfiable number of A-grade awesome-list PRs.

Those corrections are integrated above. Review artifact:
`/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase6-distribution-rubric-review-20260604T170238Z.md`.
