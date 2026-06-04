# Launch Work Status

Captured: 2026-06-04T16:44Z

## Current State

The launch plan has moved through the positioning, correctness, demo, README, and trust-file phases.
The public repo now has a first-screen collision demo, explicit advisory caveat, community files,
Dependabot, CodeQL, OpenSSF Scorecard, and high-signal README badges.

Current pushed trust baseline:

- pushed commit: `9d95d4c Add trust badges and security links`
- CI: green on `9d95d4c`
- CodeQL: green on `9d95d4c`
- OpenSSF Scorecard workflow: green on `9d95d4c`
- GitHub community profile: 100%
- OpenSSF Scorecard API score: 5.8
- Phase 5 Claude rubric review: 83/100 before the Private Vulnerability Reporting correction;
  correction integrated in `analyses/trending-trust/phase5-trust-audit.md`
- published npm package: `agentlocks@0.8.0`
- current Socket score for published package: overall 75, supply-chain 75, maintenance 91 shallow /
  89 deep

Local worktree note: `main` is currently ahead of `origin/main` by another agent's local commit,
`6a3658d Add agent CLI contract matrix`. Do not conflate that local commit with the pushed public
baseline until it is pushed and CI is checked.

## Completed Artifacts

- `GITHUB_TRENDING_PLAN.md`
- `analyses/trending-baseline/repo-state.md`
- `analyses/trending-baseline/npm-state.json`
- `analyses/trending-baseline/traffic-state.json`
- `analyses/trending-baseline/socket-score.md`
- `analyses/trending-baseline/launch-decision-card.md`
- `deliverables/launch/positioning.md`
- `deliverables/launch/hn-first-comment.md`
- `deliverables/launch/skeptic-faq.md`
- `analyses/trending-correctness/phase2-correctness-audit.md`
- `assets/agentlocks-demo-collision.svg`
- `deliverables/launch/demo-script.md`
- `deliverables/launch/show-hn.md`
- `deliverables/launch/x-thread.md`
- `deliverables/launch/reddit-posts.md`
- `deliverables/launch/awesome-list-pr.md`
- `deliverables/launch/email-brief.md`
- `deliverables/launch/launch-calendar.md`
- `analyses/trending-trust/phase5-trust-audit.md`

## Verification

Current verified commands and services:

- `bun run check` passed locally after the trust-file work: 156 tests, typecheck, and Biome.
- `actionlint .github/workflows/*.yml` passed after adding CodeQL and Scorecard workflows.
- CI run `26965671310` passed on pushed commit `9d95d4c`.
- CodeQL run `26965669346` passed on pushed commit `9d95d4c`.
- OpenSSF Scorecard run `26965668626` passed on pushed commit `9d95d4c`.
- `gh api repos/simke9445/agentlocks/community/profile` reports `health_percentage: 100`.
- `curl https://api.scorecard.dev/projects/github.com/simke9445/agentlocks` reports score `5.8`.
- `socket package score npm agentlocks --markdown` reports current published package score for
  `agentlocks@0.8.0`.
- `gh api repos/simke9445/agentlocks/private-vulnerability-reporting` reports
  `{"enabled":false}`.
- Claude review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase5-trust-rubric-review-20260604T164538Z.md`.

## Human Gates Still Open

- Decide whether to enable branch protection / repository rules despite the trunk-based workflow.
- Enable Private Vulnerability Reporting if the private advisory link in `SECURITY.md` should be
  live before launch.
- Decide whether to enable GitHub Discussions.
- Start OpenSSF Best Practices if the maintainer wants that badge.
- Approve and publish the next npm release if the dependency-minimized package should be visible to
  Socket before launch.
- Upload the GitHub social preview image in repository settings.
- Approve external launch posts and launch timing.

## Next Execution Step

Proceed to Phase 6 distribution preparation:

- verify each launch copy artifact is channel-specific and does not overpromise enforcement;
- identify at least 20 credible early users/reposters before launch day;
- do not post externally without maintainer approval.
