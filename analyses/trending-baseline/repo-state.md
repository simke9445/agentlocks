# Phase 0 Trending Baseline

Captured at: 2026-06-04T15:12:33Z

## Purpose

This baseline pins the pre-launch state for the Agentlocks GitHub Trending plan. Later phases should
compare against this file instead of relying on memory or impressions.

## Local Repository State

Command evidence:

```bash
git status --short --branch --porcelain=v1
git log --oneline --decorate -n 12
git ls-files | rg '^(GITHUB_TRENDING_PLAN.md|README.md|CONTRIBUTING.md|SECURITY.md|CODE_OF_CONDUCT.md|\.github/|assets/|docs/)'
```

Current status:

```text
## main...origin/main
?? GITHUB_TRENDING_PLAN.md
```

Recent commits:

```text
b75285b (HEAD -> main, origin/main, origin/HEAD) docs
d2616dd docs: mark bundle-size reduction complete (v0.8.0 released)
2fb6917 (tag: v0.8.0) fix(release): address codex R3 findings (1 MED, 2 LOW)
d2309b8 docs(ci): fix codex R2 doc-drift findings (3 MED)
72f24d6 fix(release): address codex R1 release-readiness findings (4 MED)
071bd4a ci(release): shared reusable conformance; parallelize + fan out the gate
0fffa67 build!: ship one Node bundle, retire per-platform Bun binaries
67a8cce feat(release): package CLI as one Node bundle (drop per-platform binaries + library API)
2d9aacd feat(release): re-enable win32-x64 as a shipped target (npm unblock done)
0b94a9d poc(bundle): prove Node-bundle distribution (~157KB vs 60-112MB)
fe55aa6 docs: consolidate the release-pipeline design into docs/production_ci_design.md
73628f0 (tag: v0.7.0) fix(release): restore registry-url (required for OIDC; removing it caused ENEEDAUTH)
```

Tracked launch-relevant files:

```text
.github/workflows/ci.yml
.github/workflows/conformance.yml
.github/workflows/release.yml
.github/workflows/windows-unit.yml
CONTRIBUTING.md
README.md
assets/agentlocks-gh-og-share-image.png
assets/agentlocks-heading.png
docs/dependency-evidence.md
docs/production_ci_design.md
```

## GitHub Repository State

Command evidence:

```bash
gh repo view simke9445/agentlocks --json description,homepageUrl,repositoryTopics,stargazerCount,forkCount,watchers,licenseInfo,url,hasIssuesEnabled,hasDiscussionsEnabled,hasWikiEnabled,hasProjectsEnabled,isArchived,isPrivate,openGraphImageUrl,usesCustomOpenGraphImage,isSecurityPolicyEnabled,securityPolicyUrl,createdAt,pushedAt
gh api repos/simke9445/agentlocks
gh api repos/simke9445/agentlocks/community/profile
```

Current public state:

| Surface | Value |
| --- | --- |
| URL | `https://github.com/simke9445/agentlocks` |
| Description | `Advisory file locks so multiple AI coding agents can share one Git worktree.` |
| Created | 2026-05-09T16:54:18Z |
| Last pushed | 2026-06-03T15:11:22Z |
| Stars | 2 |
| Forks | 0 |
| Watchers | 0 |
| Open issues | 0 |
| License | MIT |
| Issues enabled | true |
| Discussions enabled | false |
| Wiki enabled | false |
| Pages enabled | false |
| Homepage URL | empty |
| Security policy enabled | false |
| Custom Open Graph image | true |
| Community profile health | 57 |

Topics:

```text
advisory-lock
agent-native
ai-agents
bun
claude-code
cli
codex
coding-agent
concurrency
file-locking
git
multi-agent
typescript
worktree
```

Community profile files:

| File | State |
| --- | --- |
| README | present |
| LICENSE | present, MIT detected |
| CONTRIBUTING | present |
| Code of conduct | missing |
| Issue template | missing |
| Pull request template | missing |
| Security policy | missing |

## npm State

Raw npm state is recorded in `npm-state.json`.

Highlights:

| Surface | Value |
| --- | --- |
| Latest package | `agentlocks@0.8.0` |
| Package created | 2026-06-01T14:19:23.473Z |
| Latest published | 2026-06-03T14:51:00.298Z |
| Last-week downloads | 661 |
| Last-month downloads | 661 |
| Provenance | present, `https://slsa.dev/provenance/v1` |
| Maintainers | 1 |
| Runtime deps declared | `commander@14.0.3` |
| Dev deps declared | `@biomejs/biome`, `@types/bun`, `typescript` |
| Engine | Node `>=22.18` |
| Bin | `agentlocks` -> `dist/agentlocks.mjs` |

## Traffic State

Raw traffic state is recorded in `traffic-state.json`.

Highlights:

| Surface | Count | Uniques |
| --- | ---: | ---: |
| GitHub views, trailing window | 107 | 6 |
| GitHub clones, trailing window | 684 | 197 |

Top referrers:

| Referrer | Count | Uniques |
| --- | ---: | ---: |
| `github.com` | 18 | 1 |
| `t.co` | 6 | 4 |

Top paths include the repo overview, Actions pages, and some traffic to the previous `lockpick`
repository.

Traffic caveat:

- GitHub clones include CI/Actions checkouts. The clone spike from 2026-06-01 through 2026-06-03
  overlaps the rapid release window and the conformance matrix, so it should not be treated as 197
  independent humans cloning the repo.
- npm downloads are also noisy at this age because the package is only days old and has been
  installed by CI, release verification, mirrors, and bots.
- The strongest human-facing signal is currently tiny: 6 unique GitHub viewers in the trailing
  traffic window. With 2 stars on such a small denominator, the repo is better described as
  awareness-constrained than proven conversion-broken.
- `lockpick` paths in the traffic report indicate some legacy/rename bleed that should not be
  credited to Agentlocks demand.

## Verification State

Command:

```bash
bun run check
```

Initial Phase 0 run result:

- Tests passed: 151 pass, 0 fail.
- Typecheck passed.
- Lint initially failed only because the newly added `npm-state.json` needed Biome formatting.
- The artifacts were then formatted.

Final Phase 0 run result after formatting:

- `bun run check` exited 0.
- Tests passed: 151 pass, 0 fail.
- Typecheck passed.
- Biome passed: 46 files checked, no fixes applied.

## Thin Competitive Baseline

Command evidence:

```bash
gh search repos '"git worktree" agent' --sort stars --limit 10
gh search repos '"claude code" "agent"' --sort stars --limit 10
gh search repos '"coding agent" CLI' --sort stars --limit 10
gh search repos 'awesome claude code' --sort stars --limit 10
gh search repos 'awesome ai agents' --sort stars --limit 10
gh search repos 'awesome codex cli' --sort stars --limit 10
```

Worktree-per-agent adjacent results:

| Repo | Stars | Positioning signal |
| --- | ---: | --- |
| `mteam88/sir` | 8 | Minimal workspace wrapper for `git worktree` plus agent CLI |
| `hanenao/git-handoff` | 0 | Git subcommand for agent-friendly worktree handoff |
| `mojomast/clanker04` | 0 | Worktree orchestrator for parallel agents and solution comparison |

High-signal adjacent agent-tooling results:

| Repo | Stars | Positioning signal |
| --- | ---: | --- |
| `earendil-works/pi` | 59683 | Broad AI coding-agent toolkit |
| `ryoppippi/ccusage` | 15544 | Narrow, measurable pain: coding-agent token usage and cost |
| `disler/claude-code-hooks-multi-agent-observability` | 1445 | Claude Code hook observability |
| `patoles/agent-flow` | 955 | Real-time visual proof for agent orchestration |
| `0xranx/OpenContext` | 583 | Persistent context for existing coding-agent CLIs |

Target list/distribution surfaces:

| Repo | Stars | Relevance |
| --- | ---: | --- |
| `hesreallyhim/awesome-claude-code` | 45657 | Claude Code tools, hooks, commands, orchestrators |
| `e2b-dev/awesome-ai-agents` | 28148 | Broad AI agent tooling list |
| `VoltAgent/awesome-claude-code-subagents` | 21183 | Claude Code subagent audience |
| `rohitg00/awesome-claude-code-toolkit` | 1945 | Claude Code ecosystem toolkit list |
| `RoggeOhta/awesome-codex-cli` | 257 | Codex CLI tools and resources |

Phase 1 implication:

- The "why not worktrees?" answer cannot be hand-waved. Worktree isolation is an obvious competing
  pattern even though the exact GitHub search results are small.
- Adjacent successful repos often win with visual or immediately legible proof. Agentlocks needs a
  collision demo, not another explanatory table.
- Distribution should be treated as the primary missing lever; current human traffic is too small to
  prove a conversion ceiling.

## Advisory Claim Anchors

The Phase 1 advisory story must stay tied to these current code/doc/test anchors:

| Claim | Current anchor |
| --- | --- |
| Advisory-only, participants opt in | `README.md:98`, `README.md:111`, `src/cli/program.ts:165` |
| PreToolUse backstop for Claude Code and Codex | `README.md:83`, `README.md:178`, `README.md:179`, `src/cli/commit-hook-script.ts:1` |
| Backstop surfaces staged-but-unlocked paths and never blocks | `README.md:182`, `README.md:265`, `src/cli/commit-hook-script.ts:4`, `src/cli/program.ts:480` |
| `git verify` detects staged-but-unlocked paths | `tests/improvements-040.test.ts:173` |
| `git verify` is read-only and always exits 0 | `tests/improvements-040.test.ts:281` |
| Codex and Claude hook generation is tested | `tests/commit-hook.test.ts` |

## Phase 0 Findings

Confirmed:

- Agentlocks has a real release pipeline, provenance, and cross-platform conformance story already.
- The repo is public, active, MIT-licensed, and has a custom Open Graph image.
- Community profile polish is incomplete: no security policy, issue template, PR template, or code of conduct.
- GitHub Discussions and Pages/homepage are not enabled.
- npm download and GitHub clone activity are nonzero but noisy because they overlap release and CI
  activity.
- Human GitHub traffic is currently very small: 6 unique viewers in the trailing traffic window.
- The current README and assets exist, but the repo still needs a first-screen collision demo to
  satisfy the plan's time-to-aha gate.

Likely:

- The current most important funnel issue is not lack of package publication; it is lack of
  qualified human awareness plus an unproven top-fold demo.
- The declared runtime dependency surface should be rechecked because the shipped bundle appears to
  inline `commander`.

Hypotheses:

- A concise "why not worktrees" answer plus a short dogfood demo will move conversion more than
  adding additional badges first.
- Launch-readiness work should prioritize positioning, correctness, demo proof, and distribution
  before trust badge completion.

## Immediate Phase 1 Inputs

The Phase 1 positioning run must answer:

1. Why use one shared worktree instead of one `git worktree` per agent?
2. What does advisory protection guarantee, and what does it explicitly not guarantee?
3. Which user segment already has this pain?
4. What 10-second demo proves the claim?
5. What top-fold README copy explains the product without a long table?
6. Which distribution surfaces are appropriate once the positioning gate passes?
