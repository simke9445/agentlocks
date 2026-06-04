# Launch Work Status

Captured: 2026-06-04T17:02Z

## Current State

The launch plan has moved through the positioning, correctness, demo, README, and trust-file phases.
The public repo now has a first-screen collision demo, explicit advisory caveat, community files,
Dependabot, CodeQL, OpenSSF Scorecard, and high-signal README badges.

Current pushed trust baseline:

- pushed commit: `0620423 Record phase 5 trust audit`
- CI: green on `0620423`
- CodeQL: green on `0620423`
- OpenSSF Scorecard workflow: green on `0620423`
- GitHub community profile: 100%
- OpenSSF Scorecard API score: 5.8
- Phase 5 Claude rubric review: 83/100 before the Private Vulnerability Reporting correction;
  correction integrated in `analyses/trending-trust/phase5-trust-audit.md`
- Phase 6 Claude rubric review: 65/100 before corrections; `updatedAt` recency and
  surfaces-vs-users blockers corrected in
  `analyses/trending-research/phase6-distribution-targets.md`
- published npm package: `agentlocks@0.8.0`
- current Socket score for published package: overall 75, supply-chain 75, maintenance 91 shallow /
  89 deep

Local worktree note: another agent currently owns a separate CLI contract edit set. Do not touch
those locked files from the launch-distribution workstream.

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
- `analyses/trending-research/phase6-distribution-targets.md`

## Verification

Current verified commands and services:

- `bun run check` passed locally after the trust-file work: 156 tests, typecheck, and Biome.
- `actionlint .github/workflows/*.yml` passed after adding CodeQL and Scorecard workflows.
- CI run `26966385489` passed on pushed commit `0620423`.
- CodeQL run `26966386314` passed on pushed commit `0620423`.
- OpenSSF Scorecard run `26966387553` passed on pushed commit `0620423`.
- `gh api repos/simke9445/agentlocks/community/profile` reports `health_percentage: 100`.
- `curl https://api.scorecard.dev/projects/github.com/simke9445/agentlocks` reports score `5.8`.
- `socket package score npm agentlocks --markdown` reports current published package score for
  `agentlocks@0.8.0`.
- `socket scan create --read-only --markdown --repo=agentlocks --branch=main package.json bun.lock`
  finds the local manifests and stops before creating a remote report.
- `gh api repos/simke9445/agentlocks/private-vulnerability-reporting` reports
  `{"enabled":false}`.
- Claude review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase5-trust-rubric-review-20260604T164538Z.md`.
- Claude Phase 6 review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase6-distribution-rubric-review-20260604T170238Z.md`.

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

Proceed to Phase 6 launch-contact preparation:

- verify each launch copy artifact is channel-specific and does not overpromise enforcement;
- prepare the three high-fit awesome-list PR variants and four scope-check issue drafts;
- prepare non-competitive notes for at least 20 adjacent-builder targets;
- do not post externally without maintainer approval.
