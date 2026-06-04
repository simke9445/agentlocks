# Achieving GitHub Trending Plan

This is the execution plan for making `agentlocks` as aligned as possible with a large GitHub
launch and a possible Trending run. It is intentionally operational: a fresh Codex or Claude Code
agent should be able to pick this up, run the pipeline, and produce the artifacts needed for a
serious launch.

## Objective

The stretch target is 10,000+ GitHub stars within 30 days of launch.

Treat that as a ceiling, not as the sole success criterion. A 10k-star month usually requires a
distribution event, a visceral demo, a famous channel, or a broadly universal pain. Repo polish
converts attention into stars; it does not create the attention by itself.

Primary operating target:

- Make a qualified visitor understand the product in under 10 seconds.
- Make a skeptical developer trust the product in under 60 seconds.
- Make an agent-tooling power user able to run a successful demo in under 2 minutes.
- Make the launch story compelling enough that people share it without being asked.

## Current Baseline

These facts were measured on 2026-06-04.

| Surface | Current state |
| --- | --- |
| GitHub repo | `github.com/simke9445/agentlocks` |
| Stars / forks / watchers | 2 stars, 0 forks, 0 watchers |
| GitHub topics | `advisory-lock`, `agent-native`, `ai-agents`, `claude-code`, `codex`, `coding-agent`, `concurrency`, `file-locking`, `git`, `multi-agent`, `typescript`, `worktree` |
| GitHub community profile | 57% |
| Missing community files | `SECURITY.md`, code of conduct, issue template, PR template |
| Discussions | Disabled |
| GitHub Pages / homepage | None set |
| npm package | `agentlocks@0.8.0` |
| npm downloads | 661 last week/month |
| npm provenance | Present on `agentlocks@0.8.0` |
| npm maintainers | 1 |
| Published runtime deps | `commander@14.0.3` still declared even though the CLI bundle appears to inline it |
| Existing workflows | CI, conformance, release, Windows unit |
| Missing trust workflows | CodeQL, Dependabot, OpenSSF Scorecard |
| Existing assets | `assets/agentlocks-heading.png`, `assets/agentlocks-gh-og-share-image.png` |
| README state | Technically strong, but long and missing first-screen visual proof |

The most important signal: npm/GitHub activity exists, but star conversion is low. If 661 downloads
and 197 recent unique cloners do not translate into more than 2 stars, fix the funnel before adding
more low-level badges.

## Critical Positioning Gates

Do these before trust badges and housekeeping. If any gate fails, stop and reframe.

### Gate 1: Answer "Why Not One Worktree Per Agent?"

The dominant multi-agent pattern is one `git worktree` per agent. Agentlocks is intentionally
contrarian: it coordinates agents in one shared worktree.

The launch must have a crisp answer:

> Agentlocks is for the moments when separate worktrees are too isolated: shared generated state,
> shared build artifacts, one live branch, one working tree, and fast handoffs between Codex and
> Claude Code without merging speculative branches first.

This answer must be tested against skeptical reviewers. If it sounds weak, change the product
positioning before launch.

### Gate 2: Answer "Advisory Means What Happens If An Agent Ignores It?"

The product must be honest:

- Agentlocks coordinates participating agents.
- It does not stop an editor, shell, or agent that ignores the protocol.
- `init` installs harness-specific advisory backstops for Codex and Claude Code.
- `git verify` detects staged-but-unlocked paths before commit tool calls.
- The correct use case is cooperative local multi-agent work, not hostile enforcement.

Do not oversell hard locking. The trust move is to be precise.

### Gate 3: Show, Do Not Explain

The first-screen asset must show:

1. Agent A acquires `src/auth.ts`.
2. Agent B tries to acquire the same path.
3. Agentlocks prints owner, reason, and next command.
4. No silent overwrite occurs.

This should exist as a short GIF/asciinema/video and should be visible above the fold in the README.

### Gate 4: Dogfood The Story

The launch story should be:

> Codex and Claude Code built the launch artifacts in one shared worktree, coordinated by Agentlocks.

This is stronger than a generic demo. The process becomes proof.

## Agent Model And Harness Split

Use Codex and Claude Code as different operators, not duplicate assistants.

| Lane | Harness | Strength | Owns |
| --- | --- | --- | --- |
| Correctness skeptic | Codex | Repo inspection, tests, stress cases, skeptical implementation review | Lock correctness, CI, package integrity, release gates, evidence checks |
| Narrative and DX | Claude Code | Copy, demo scripting, reader empathy, artifact orchestration | README top-fold, demo story, launch copy, friction audit, distribution assets |
| Synthesizer | Codex in this repo | Grounding, file edits, final integration | Final plan, task graph, source-backed decisions |
| Human | Maintainer | Irreversible choices and external publication | Launch approval, npm release approval, social posting, Product Hunt/HN timing |

Cross-review rule:

- Codex reviews Claude's README/demo/launch claims for technical accuracy.
- Claude reviews Codex's test/trust/correctness plan for human comprehension and launch impact.
- Disagreements are recorded with a decision owner.
- Neither model self-approves the launch gate.

## Skill Inventory And Adaptations

The loaded skill list is large. The execution pipeline should route skills by fit, not run every
skill blindly.

### Core Skills To Use

| Skill | Use | Adaptation for this repo |
| --- | --- | --- |
| `planning-workflow` | Maintain this plan, iterate rounds, convert into tasks | Replace the default GPT/Gemini/Grok loop with Codex + Claude Code unless other models are explicitly available |
| `research-software` | Study adjacent fast-growing repos and launch mechanics | Use local repo as source of truth for Agentlocks; clone competitors only to `/tmp`; prefer 2025-2026 sources |
| `gh-cli` | Query repo state, traffic, topics, issues, workflows, releases | Use `gh api`/`gh repo view`; do not mutate GitHub settings without maintainer approval |
| `ask-claude` | Direct Claude Code critique | Use `claude -p`; save artifacts under `${CODEX_HOME:-~/.codex}/artifacts/` |
| `multi-model-triangulation` | Cross-model review | Adapt from copy-paste only: Codex can run locally; Claude can be called by `claude -p`; Gemini/Grok remain optional |
| `readme-writing` | README conversion and onboarding | Do not blindly add the skill's mandatory contribution wording; preserve Agentlocks' actual `CONTRIBUTING.md` policy |
| `gh-og-share-images` | GitHub social preview | Use existing `assets/agentlocks-gh-og-share-image.png` as candidate, but run iterative visual review before upload |
| `gh-actions` | CodeQL, Dependabot, Scorecard, CI hardening | Keep existing SHA-pinned action style and minimal permissions |
| `codebase-audit` | Domain-specific pre-launch audits | Run `cli`, `copy`, `security`, and `api/DX` lenses; report with file:line evidence |
| `ux-audit` | README, CLI first-run, error path, demo comprehension | Adapt UI heuristics to CLI and README funnel |
| `security-review` | Security and supply-chain trust pass | Focus on filesystem/path handling, command spawning, update check, dependencies, provenance |
| `seo-for-saas-businesses` | Search/share/docs discoverability | Adapt from SaaS SEO to OSS docs, GitHub, npm, AI Overview, and answer-engine visibility |

### Secondary Skills To Use If The Run Expands

| Skill | Use |
| --- | --- |
| `code-review` | Review implementation PRs before commit |
| `release-preparations` | Prepare a tagged launch release after artifacts and gates are green |
| `documentation-website-for-software-project` | Build a small docs site if README alone is not enough |
| `og-share-images` | Generate web OG images if a docs site launches |
| `browser:control-in-app-browser` or `playwright-interactive` | Verify docs/demo pages and social preview rendering |
| `video-obs-youtube-music` | Produce polished demo video if an OBS recording exists |
| `de-slopify` / `ai-slop-cleaner` | Remove inflated launch language and generic AI-copy artifacts |
| `idea-wizard` | Generate launch angles and shortlist by evidence |
| `beads-workflow` / `beads-br` / `beads-bv` | Convert this plan into a dependency-aware task graph |
| `agent-mail` | Coordinate multiple independent agents if they run simultaneously |
| `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` | Deep CLI ergonomics pass |
| `world-class-doctor-mode-for-cli-tools` | Upgrade `doctor` if first-run diagnostics are a launch blocker |
| `testing-conformance-harnesses` / `testing-fuzzing` / `testing-metamorphic` | Expand lock correctness proof |
| `deadlock-finder-and-fixer` | Audit concurrency and lock lifecycle bugs |
| `rust-unsafe-code-exorcist` and Rust-specific skills | Not applicable unless implementation migrates to Rust |

### Skills To Treat As Out Of Scope

SaaS billing, Supabase, Stripe, estate planning, tax, Slack migration, spreadsheets, presentations,
and most cloud-deployment skills are not part of this launch unless the maintainer explicitly
changes scope.

## Repository Coordination Rules

All agents must follow the repository's `AGENTS.md`.

Before touching files:

```bash
bun run --silent agentlocks -- acquire <paths...> --reason "<intent>" --id-only
```

Before staging:

```bash
bun run --silent agentlocks -- refresh <lock_id>
bun run --silent agentlocks -- git begin --refresh-lock <lock_id> --reason "<commit intent>" --id-only
```

Stage only locked paths. Release after commit:

```bash
bun run --silent agentlocks -- git end <git_lock_id> --release-lock <lock_id>
```

For this launch pipeline, keep artifacts in predictable paths:

| Artifact type | Path |
| --- | --- |
| Baselines | `analyses/trending-baseline/` |
| Research notes | `analyses/trending-research/` |
| Launch copy | `deliverables/launch/` |
| Demo assets | `assets/` or `deliverables/launch/demo/` |
| Task graph | beads database if enabled, otherwise `analyses/trending-tasks.md` |

Create these paths only when the execution run reaches them, and acquire locks first.

## End-To-End Pipeline

### Phase 0: Bootstrap And Baseline

Owner: Codex.

Purpose: establish exact current truth before improving anything.

Commands:

```bash
git status --short
gh repo view simke9445/agentlocks --json description,homepageUrl,repositoryTopics,stargazerCount,forkCount,watchers,licenseInfo,url
gh api repos/simke9445/agentlocks/community/profile
gh api repos/simke9445/agentlocks/traffic/views
gh api repos/simke9445/agentlocks/traffic/clones
npm view agentlocks version dist-tags time dist dependencies devDependencies maintainers --json
curl -fsSL https://api.npmjs.org/downloads/point/last-week/agentlocks
bun run check
```

Outputs:

- `analyses/trending-baseline/repo-state.md`
- `analyses/trending-baseline/npm-state.json`
- `analyses/trending-baseline/traffic-state.json`
- first decision card: launch target, realistic KPI, and risk level.

Exit gate:

- Baseline is source-backed.
- No untracked scan artifacts are left in the repo by accident.

### Phase 1: Positioning Kill Gates

Owner: Claude drafts, Codex challenges.

Questions:

1. Why share one worktree instead of one worktree per agent?
2. What exactly does "advisory" protect, and what does it not protect?
3. Which user feels this pain today?
4. What is the one-sentence launch hook?
5. What 10-second demo proves the hook?

Artifacts:

- `deliverables/launch/positioning.md`
- `deliverables/launch/hn-first-comment.md`
- `deliverables/launch/skeptic-faq.md`

Required FAQ entries:

- Why not `git worktree` per agent?
- Why not `flock`?
- Why not a git hook?
- What if an agent ignores the protocol?
- Does it work across machines?
- Does it work on Windows?
- Does it require Bun?

Exit gate:

- Three fresh reviewers can read the top-fold copy and accurately state what Agentlocks does and
  why they might use it.
- The HN skeptic FAQ is good enough that it can be posted as the first comment.

### Phase 2: Correctness And Hostile-Demo Hardening

Owner: Codex writes/adapts tests; Claude reviews the human-facing explanation.

Goal: survive a skeptical developer trying to break the lock model.

Work items:

- Add or verify concurrent acquire/release stress tests.
- Verify stale lock classification and prune behavior.
- Verify crash/SIGKILL recovery expectations.
- Verify Git-index lock behavior under concurrent `git add` / `git commit` attempts.
- Verify Windows conformance remains real.
- Verify Node floor and no-Bun global install path.
- Audit filesystem path normalization and glob semantics.
- Audit update-check behavior for automation safety.
- Review whether published `dependencies` and `devDependencies` in the npm manifest are necessary
  for the bundled CLI.

Commands:

```bash
bun test
bun run typecheck
bun run lint
bun run check
npm pack --json --ignore-scripts
```

Exit gate:

- `bun run check` green.
- Published tarball contents are intentional.
- Known limitations are documented plainly.
- No launch claim exceeds tested behavior.

### Phase 3: Magic Demo And Visual Assets

Owner: Claude scripts narrative; Codex verifies commands.

Required demo:

- Two terminal panes, one Codex lane and one Claude lane if possible.
- Both operate in the same worktree.
- One tries to take an overlapping lock and receives a useful conflict.
- The demo includes the exact install/init/acquire/status/release sequence.
- The demo ends with a successful check or commit flow.

Assets:

- `assets/agentlocks-demo-collision.gif` or equivalent video/asciinema.
- `assets/agentlocks-social-preview.png` at 1280x640, under GitHub's upload limit.
- README first-screen image or GIF.
- Short alt text for accessibility.

Exit gate:

- Time to understand the demo: under 10 seconds.
- Time to reproduce the happy path: under 2 minutes on a clean machine with Node >= 22.18.
- Visual asset still reads at social-thumbnail size.

### Phase 4: README And npm Conversion Funnel

Owner: Claude drafts; Codex verifies.

Top-fold target:

1. Logo/social visual.
2. One-line pain statement.
3. 10-second demo GIF.
4. Copy-paste install.
5. "Why not worktrees?" link.
6. Trust badges limited to high-signal badges.

Do not make the README a badge wall.

Recommended badges:

- npm version.
- npm downloads.
- CI.
- OpenSSF Scorecard after it exists.
- license.
- provenance/trusted publishing only if the badge is reliable and not visually noisy.

README rules:

- Public install path first: `npm install -g agentlocks`.
- Do not frame source checkout as the main path.
- Do not use unsupported claims like "prevents all overwrites."
- Keep exact behavior grounded in CLI output and tests.
- Put long reference tables below quick proof.

npm page rules:

- Ensure package README renders well.
- Keep package metadata complete.
- Minimize published runtime surface.
- Preserve provenance.

Exit gate:

- Fresh reviewer understands value in 10 seconds.
- Fresh reviewer can install/run in 2 minutes.
- Codex confirms all code blocks still execute or are clearly illustrative.

### Phase 5: Trust And Repository Polish

Owner: Codex implements; Claude checks clarity.

Work items:

- Add `SECURITY.md`.
- Add issue forms for bug report, feature request, launch feedback.
- Add PR template.
- Add `CODE_OF_CONDUCT.md` if the maintainer wants contributor-community posture.
- Enable GitHub Discussions if the maintainer approves.
- Add Dependabot config for npm and GitHub Actions.
- Add CodeQL workflow if TypeScript analysis is useful for this layout.
- Add OpenSSF Scorecard workflow with published results.
- Start OpenSSF Best Practices badge process.
- Verify branch protection and release environment gates.
- Add `CODEOWNERS` only if it matches real ownership.

Exit gate:

- Community profile no longer has obvious missing basics.
- Security/disclosure route is clear.
- Trust badges point to real workflows, not aspirational placeholders.

### Phase 6: Discovery And Distribution Preparation

Owner: Claude leads list-building and copy; Codex verifies repo/links.

Channels:

- Show HN.
- X/Twitter thread.
- LinkedIn post if the maintainer uses it.
- Product Hunt only if the demo is visual enough.
- Reddit communities for Claude Code, Codex, AI agents, dev tools, and CLI tools.
- Discord/Slack communities where multi-agent operators actually work.
- Awesome-list PRs.
- Newsletter/editor outreach.

Target awesome lists:

- Use `analyses/trending-research/phase6-distribution-targets.md` as the canonical target map.
- Prioritize high-fit Claude Code, Codex, and agent-orchestrator awesome-list PRs before generic
  social channels.
- Treat adjacent builder repos as human-gated relationship targets, not places for drive-by
  promotion.

Assets:

- `deliverables/launch/show-hn.md`
- `deliverables/launch/x-thread.md`
- `deliverables/launch/reddit-posts.md`
- `deliverables/launch/awesome-list-pr.md`
- `deliverables/launch/email-brief.md`
- `deliverables/launch/launch-calendar.md`

Exit gate:

- Every channel has a tailored message.
- No post overpromises enforcement.
- HN first comment handles the obvious objections.
- At least 20 adjacent-builder targets have tailored notes before launch day.
- Awesome-list surfaces are tracked separately from candidate early users/reposters.
- Candidate users/reposters are not counted as confirmed until they show a conversion signal:
  maintainer reply, accepted PR, integration issue, tested workflow, or public mention.
- Phase 6 target map has a Claude Code rubric review with a score and integrated corrections.

### Phase 7: Launch War Room

Owner: Human posts; Codex monitors facts; Claude drafts replies.

Pre-launch checklist:

- `bun run check` green.
- Latest release install verified from npm.
- Demo asset loads on GitHub.
- README top fold merged.
- Social preview uploaded manually in GitHub Settings.
- HN title and first comment ready.
- X thread ready with demo GIF.
- GitHub Discussions or launch feedback issue ready.
- Maintainer has time blocked for replies.

Launch-day metrics:

- Stars per hour.
- GitHub views and unique visitors.
- Clones.
- npm downloads.
- HN rank/comments if posted.
- Referrers.
- Issue quality.
- Download-to-star ratio.

Response rules:

- Reply quickly to correctness questions.
- Never argue defensively about advisory limitations; clarify.
- Convert repeated objections into README/FAQ patches the same day.
- If a real bug is found, acknowledge it and patch fast.

### Phase 8: Post-Launch Compounding

Owner: Codex and Claude alternate.

Daily for 7 days:

- Triage issues and discussions.
- Patch README based on repeated questions.
- Publish one small visible improvement if there is a real need.
- Update launch posts with meaningful fixes.
- Watch npm download-to-star conversion.
- Add a case study if any real dogfood/user story emerges.

Weekly for 4 weeks:

- Re-run Socket score and package health checks.
- Re-run community profile and Scorecard.
- Refresh docs and examples.
- Add one integration guide if users ask for it.
- Audit whether the "why not worktrees" answer is resonating.

## Model Cross-Analysis Loop

Use this loop for every major artifact.

### Step 1: Codex Produces Grounded Draft

Codex reads local repo files, GitHub state, npm state, and public sources. It produces an artifact
with evidence labels:

- `confirmed`: verified locally or via current source.
- `likely`: inferred from current evidence.
- `hypothesis`: launch/marketing bet.

### Step 2: Claude Code Reviews For Narrative And DX

Run:

```bash
claude -p "$(cat deliverables/launch/<artifact>.md)

Review this for launch conversion, clarity, objections, and developer trust. Be adversarial.
Return specific edits, not generic advice."
```

Save raw output:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/artifacts"
# filename format:
# claude-agentlocks-<artifact>-review-YYYYMMDDTHHMMSSZ.md
```

### Step 3: Codex Integrates Or Rejects

Codex applies only changes that are:

- technically true,
- compatible with Agentlocks' CLI contract,
- aligned with repo policy,
- useful for launch conversion.

Rejected changes go into a short decision log.

### Step 4: Human Gate

Human approves:

- external posts,
- repo settings changes,
- release publishing,
- launch timing,
- claims that imply product strategy.

## Ready-To-Run Goal Prompt

Use this prompt to set off the full goal:

```text
Goal: Execute GITHUB_TRENDING_PLAN.md for agentlocks end to end.

Use Codex (this session) as the correctness/synthesis lane and Claude Code via local `claude -p` as the
narrative/DX critique lane. Follow repository AGENTS.md exactly: acquire Agentlocks locks before
editing, refresh before staging, use the Git-index lock before committing, stage only locked paths,
and preserve unrelated worktree changes.

Start with Phase 0 baseline. For each phase:
1. Create or update the phase artifact under the paths named in the plan.
2. Run the model cross-analysis loop.
3. Apply only grounded changes.
4. Run the relevant verification commands.
5. Stop at any human approval gate instead of posting externally or approving release deployment.

Do not chase badges before the positioning, correctness, and demo gates are green. The first kill
gate is a defensible answer to "why not one git worktree per agent?" The launch story should be that
Codex and Claude Code built the launch artifacts in one shared worktree coordinated by Agentlocks.
```

## Phase-To-Skill Routing

| Phase | Primary skills | Secondary skills |
| --- | --- | --- |
| 0 Baseline | `research-software`, `gh-cli`, `codebase-archaeology` | `codebase-report` |
| 1 Positioning | `planning-workflow`, `multi-model-triangulation`, `ask-claude`, `idea-wizard` | `de-slopify` |
| 2 Correctness | `codebase-audit`, `security-review`, `testing-conformance-harnesses`, `deadlock-finder-and-fixer` | `testing-fuzzing`, `testing-metamorphic` |
| 3 Demo/assets | `gh-og-share-images`, `browser:control-in-app-browser`, `playwright-interactive` | `video-obs-youtube-music`, `imagegen` |
| 4 README/npm | `readme-writing`, `ux-audit`, `agent-ergonomics-and-intuitiveness-maximization-for-cli-tools` | `de-slopify`, `seo-for-saas-businesses` |
| 5 Trust | `gh-actions`, `security-review`, `gh-cli` | `release-preparations` |
| 6 Distribution | `research-software`, `gh-cli`, `seo-for-saas-businesses`, `idea-wizard` | `csctf` for archiving share links |
| 7 Launch | `gh-cli`, `release-preparations`, `ask-claude` | `user-support-triage-for-saas-and-open-source-projects` |
| 8 Compounding | `user-support-triage-for-saas-and-open-source-projects`, `codebase-audit`, `readme-writing` | `changelog-md-workmanship` |

## Launch Gates Summary

Hard launch blockers:

- No crisp "why not worktrees?" answer.
- No short demo that shows a real collision.
- Known lock correctness bug.
- `bun run check` red.
- Latest npm install path unverified.
- README top fold still requires long explanation.
- External posts contain unverified claims.
- Maintainer unavailable to reply during launch window.

Non-blockers:

- Scorecard not perfect.
- Socket score not 100.
- Best Practices badge still pending.
- Docs site not finished, if README and demo are strong.

## Evidence Sources To Recheck During Execution

- GitHub repo state: `gh repo view`, `gh api repos/simke9445/agentlocks`.
- GitHub community profile: `gh api repos/simke9445/agentlocks/community/profile`.
- GitHub traffic: `gh api repos/simke9445/agentlocks/traffic/views`, `clones`, `popular/referrers`.
- npm state: `npm view agentlocks --json`.
- npm downloads: `https://api.npmjs.org/downloads/point/last-week/agentlocks`.
- Socket package score: `socket package score npm agentlocks@<version>` with API token.
- OpenSSF Scorecard: GitHub Action results after workflow exists.
- GitHub Trending page and adjacent repo searches.

## Final Notes

The order matters. Trust polish is useful, but it should not displace the launch-critical path:

1. Positioning.
2. Correctness.
3. Demo.
4. README conversion.
5. Distribution.
6. Trust polish.
7. Launch response.

If the repo becomes technically perfect but still lacks a visceral demo and a distribution plan, it
will not reach 10k stars. If the launch creates attention but correctness breaks under scrutiny, it
will create the wrong kind of attention. The winning path is to make the dogfood pipeline itself the
proof: Codex and Claude Code, one shared worktree, coordinated by Agentlocks.
