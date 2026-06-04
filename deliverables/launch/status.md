# Launch Work Status

Captured: 2026-06-04T17:55Z

## Current State

The launch plan has moved through the positioning, correctness, demo, README, and trust-file phases.
The public repo now has static and motion collision demo assets, explicit advisory caveat,
community files, Dependabot, CodeQL, OpenSSF Scorecard, and high-signal README badges.

Latest verified pushed baseline before this status update:

- verified pushed commit: `1bd8319 Refresh phase 7 launch status`
- CI: green on `1bd8319`
- CodeQL: green on `1bd8319`
- OpenSSF Scorecard workflow: green on `1bd8319`
- GitHub community profile: 100%
- OpenSSF Scorecard API score: 5.8
- Phase 5 Claude rubric review: 83/100 before the Private Vulnerability Reporting correction;
  correction integrated in `analyses/trending-trust/phase5-trust-audit.md`
- Phase 6 Claude rubric review: 65/100 before corrections; `updatedAt` recency and
  surfaces-vs-users blockers corrected in
  `analyses/trending-research/phase6-distribution-targets.md`
- Phase 6 contact-draft Claude rubric review: 89/100; no blockers for human-review draft inputs;
  wording, cadence, and guardrail corrections integrated in `deliverables/launch/awesome-list-pr.md`
  and `deliverables/launch/adjacent-builder-notes.md`
- Phase 7 launch-war-room Claude rubric review: 74/100 before corrections; npm release-age
  framing, Node >=22.18 runtime gating, PVR/security-reporting gating, rollback runbook, owner SLA,
  metric caveats, and resume conditions integrated in `deliverables/launch/launch-war-room.md`
- published npm package: `agentlocks@0.8.0`
- published runtime requirement: Node `>=22.18`
- current Socket score for published package: overall 75, supply-chain 75, maintenance 91 shallow /
  89 deep
- latest npm install path: clean install verified for `agentlocks@0.8.0` with Node >=22.18 and an
  empty npm user config. Users enforcing a 7-day package-age policy cannot install 0.8.0 until
  2026-06-10T14:51Z.

Local worktree note: another agent currently owns performance baseline artifacts. Do not touch
`analyses/performance-baseline/*` from the launch workstream.

## Completed Artifacts

- `GITHUB_TRENDING_PLAN.md`
- `analyses/trending-baseline/repo-state.md`
- `analyses/trending-baseline/npm-state.json`
- `analyses/trending-baseline/traffic-state.json`
- `analyses/trending-baseline/socket-score.md`
- `analyses/trending-baseline/launch-decision-card.md`
- `analyses/trending-baseline/execution-completion-audit.md`
- `deliverables/launch/positioning.md`
- `deliverables/launch/hn-first-comment.md`
- `deliverables/launch/skeptic-faq.md`
- `analyses/trending-correctness/phase2-correctness-audit.md`
- `assets/agentlocks-demo-collision.svg`
- `assets/agentlocks-demo-collision.gif`
- `deliverables/launch/demo-script.md`
- `deliverables/launch/show-hn.md`
- `deliverables/launch/x-thread.md`
- `deliverables/launch/reddit-posts.md`
- `deliverables/launch/awesome-list-pr.md`
- `deliverables/launch/adjacent-builder-notes.md`
- `deliverables/launch/email-brief.md`
- `deliverables/launch/launch-calendar.md`
- `deliverables/launch/launch-war-room.md`
- `analyses/trending-trust/phase5-trust-audit.md`
- `analyses/trending-research/phase6-distribution-targets.md`

## Verification

Current verified commands and services:

- `bun run check` passed locally after the latest launch-status corrections: 159 tests, typecheck,
  and Biome.
- `actionlint .github/workflows/*.yml` passed after adding CodeQL and Scorecard workflows.
- CI run `26969490957` passed on pushed commit `1bd8319`.
- CodeQL run `26969490941` passed on pushed commit `1bd8319`.
- OpenSSF Scorecard run `26969490971` passed on pushed commit `1bd8319`.
- `gh api repos/simke9445/agentlocks/community/profile` reports `health_percentage: 100`.
- `curl https://api.scorecard.dev/projects/github.com/simke9445/agentlocks` reports score `5.8`.
- `socket package score npm agentlocks --markdown` reports current published package score for
  `agentlocks@0.8.0`.
- `socket scan create --read-only --markdown --repo=agentlocks --branch=main package.json bun.lock`
  finds the local manifests and stops before creating a remote report.
- `socket --help` confirms local Socket CLI version `1.1.108`, package scoring, read-only scans,
  npm/npx wrapper controls, and `raw-npm` for wrapper bypasses. Do not paste Socket banners into
  public artifacts because they include local auth state.
- Clean npm install check for `agentlocks@0.8.0` passed with an empty npm user config, no host
  `before` override, and `agentlocks --version` output `0.8.0`. The earlier
  `--min-release-age=0 --ignore-scripts` host run is a registry-resolve probe, not the canonical
  pass criterion. `doctor --json` produced expected uninitialized-prefix warnings and is not the
  install pass criterion.
- Node runtime requirement is verified from `package.json`: `engines.node >=22.18`.
- Demo SVG raw GitHub URL returned HTTP 200.
- Demo GIF renders in local visual inspection; `file` reports GIF89a and `sips` reports 640 x 360.
- `gh api repos/simke9445/agentlocks/private-vulnerability-reporting` reports
  `{"enabled":false}`.
- Claude review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase5-trust-rubric-review-20260604T164538Z.md`.
- Claude Phase 6 review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase6-distribution-rubric-review-20260604T170238Z.md`.
- Claude Phase 6 contact-draft review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase6-contact-drafts-rubric-review-20260604T171846Z.md`.
- Claude Phase 7 launch-war-room review artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase7-war-room-rubric-review-20260604T173904Z.md`.
- Phase completion audit:
  `analyses/trending-baseline/execution-completion-audit.md`.
- Claude completion-audit rubric review: 77/100 before overstatement corrections; artifact:
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-completion-audit-rubric-review-20260604T175631Z.md`.
- Open user issues: none. Open PRs are Dependabot maintenance PRs `#2` through `#6`, not launch
  feedback.

## Human Gates Still Open

- Decide whether to enable branch protection / repository rules despite the trunk-based workflow.
- Enable Private Vulnerability Reporting or add a genuinely private reporting channel. With PVR
  disabled, `SECURITY.md` falls back to a public minimal issue.
- Decide whether to enable GitHub Discussions.
- Start OpenSSF Best Practices if the maintainer wants that badge.
- Approve and publish the next npm release if the dependency-minimized package should be visible to
  Socket before launch.
- Confirm the already-enabled GitHub social preview image is the intended asset.
- Approve external launch posts and launch timing.

## Next Execution Step

Proceed to human-gated launch decisions:

- keep Phase 8 post-launch compounding parked until an approved public launch creates real launch
  feedback, issues, discussions, traffic, or user questions to compound;
- do not post externally without maintainer approval.
