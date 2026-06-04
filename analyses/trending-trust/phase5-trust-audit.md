# Phase 5 Trust And Repository Polish Audit

Captured: 2026-06-04T16:44Z

This audit records the Phase 5 trust layer for the Agentlocks launch plan. It separates confirmed
repo state from human-controlled settings so future launch agents do not confuse "we can write a
file" with "the maintainer approved a repository policy."

## Evidence Commands

All commands below were run from `/Users/djsimovic/Work/agentlocks` on 2026-06-04.

```bash
gh repo view simke9445/agentlocks --json description,homepageUrl,repositoryTopics,stargazerCount,forkCount,watchers,licenseInfo,url,defaultBranchRef,isPrivate
gh api repos/simke9445/agentlocks/community/profile
gh run list --commit 9d95d4c017455e2e24e5153a5232198047e39ca7 --limit 10 --json databaseId,name,status,conclusion,url,createdAt,headSha
curl -fsSL https://api.scorecard.dev/projects/github.com/simke9445/agentlocks | jq '{score, date, checks: [.checks[] | {name, score, reason}]}'
npm view agentlocks version dist-tags time dist dependencies devDependencies maintainers --json
socket package score npm agentlocks --markdown
gh api repos/simke9445/agentlocks/branches/main/protection
gh api repos/simke9445/agentlocks/environments/release
gh repo view simke9445/agentlocks --json hasDiscussionsEnabled,hasIssuesEnabled,hasWikiEnabled,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge
```

## Confirmed Trust Surface

| Area | Current evidence | Status |
| --- | --- | --- |
| Community profile | GitHub community profile reports `health_percentage: 100`. It sees code of conduct, contributing guide, PR template, license, and README. | Green |
| Security policy | `SECURITY.md` exists and states advisory-scope boundaries, including: "does not claim to prevent writes from a process that ignores the advisory protocol." It routes disclosure to GitHub private advisories when available, with a public-issue fallback. OpenSSF `Security-Policy` score is now `10`. GitHub Private Vulnerability Reporting is currently disabled, so the primary advisory link is a human settings gate and reporters hit the fallback. | Green via fallback; primary channel pending human enable |
| Issue intake | `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` exist. Bug reports request version, install path, command/output, expected/actual behavior, environment, and repro. | Green |
| PR template | `.github/pull_request_template.md` exists and asks for summary, verification, AGENTS scope, tests/docs, and `bun run check` or narrower proof. | Green |
| Dependabot | `.github/dependabot.yml` monitors `bun` and `github-actions`, and both dynamic Dependabot jobs passed after the first push. | Green |
| CodeQL | `.github/workflows/codeql.yml` is SHA-pinned and passed on pushed commit `9d95d4c`. | Green |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` is SHA-pinned, publishes results, uploads SARIF, and passed on pushed commit `9d95d4c`. Current API score: `5.8`. | Green, not perfect |
| CI | CI passed on pushed commit `9d95d4c`: Linux test/typecheck/lint, packed tarball, Windows unit suite, and OS/Node conformance. | Green |
| Release environment | `release` environment exists and has required reviewer `simke9445`. | Green |
| npm provenance | npm metadata for `agentlocks@0.8.0` includes SLSA provenance attestations. | Green for current release |
| Socket package score | Current published package `agentlocks@0.8.0`: shallow overall `75`, supply-chain `75`, maintenance `91`; deep maintenance `89`, floored by published `commander@14.0.3`. | Not a Phase 5 blocker |

## OpenSSF Scorecard Snapshot

Current score: `5.8` at `2026-06-04T16:38:49Z`.

High-signal green checks:

- `Dependency-Update-Tool`: 10
- `Dangerous-Workflow`: 10
- `Binary-Artifacts`: 10
- `Security-Policy`: 10
- `SAST`: 10
- `License`: 10
- `Vulnerabilities`: 10
- `Packaging`: 10
- `Token-Permissions`: 9

Remaining non-green checks and interpretation:

- `Branch-Protection`: 0. The `main` branch is not protected. This is a human policy gate because
  Agentlocks' current repository instructions prefer trunk-based direct commits to `main`.
- `Code-Review`: 0. Scorecard found no approved changesets. This is tied to branch/review policy
  and should not be faked by performative PRs.
- `CI-Tests`: -1. Scorecard reports no pull request found. Push CI is real and green, but Scorecard
  wants PR evidence.
- `CII-Best-Practices`: 0. The OpenSSF Best Practices badge process has not been started.
- `Signed-Releases`: 0. Four GitHub Releases exist (`v0.8.0` latest), and `v0.8.0` has a `main.tgz`
  asset with a GitHub-reported digest, but no attached signed artifacts/provenance that Scorecard
  recognizes. npm provenance is separate. Improve this only as a release-gate action.
- `Fuzzing`: 0. No fuzzing integration exists. Do not add superficial fuzzing unless the project is
  ready to maintain it.
- `Contributors`: 0. One-person project; cannot be fixed truthfully by repo files.
- `Maintained`: 0. Scorecard flags the project as created within the last 90 days; this ages out.
- `Pinned-Dependencies`: 6. Most actions are SHA-pinned, but Scorecard still detects some non-hash
  dependency surface. Investigate only if we want a score-focused pass.

## Human Gates

Do not mutate these without maintainer approval:

- Enable or configure branch protection / repository rules.
- Change allowed merge strategies.
- Enable GitHub Discussions.
- Enable Private Vulnerability Reporting so the `SECURITY.md` private-advisory link is live for
  external reporters.
- Start the OpenSSF Best Practices badge application if it requires maintainer account choices.
- Approve the `release` environment deployment.
- Publish a new npm version.
- Upload the social preview in GitHub Settings.

Current settings:

- `main` branch protection: absent (`gh api .../branches/main/protection` returned HTTP 404).
- Private vulnerability reporting: disabled (`gh api .../private-vulnerability-reporting` returned
  `{"enabled":false}`).
- Discussions: disabled.
- Issues: enabled.
- Wiki: disabled.
- Merge, squash, and rebase merges: all allowed.
- Delete branch on merge: disabled.

## Socket Interpretation

Socket is measuring the published npm artifact, not the local repo. The current published package is
`agentlocks@0.8.0`, and Socket still sees one direct/transitive dependency: `commander@14.0.3`.

Confirmed current score:

- Shallow overall: 75
- Shallow supply-chain: 75
- Shallow maintenance: 91
- Shallow quality: 99
- Shallow vulnerability: 100
- Shallow license: 100
- Deep maintenance: 89

Expected improvement path:

1. Publish the next release from the current dependency-minimized local package.
2. Re-run `socket package score npm agentlocks@<new-version> --markdown`.
3. Record the result in `analyses/trending-baseline/socket-score.md`.

Do not claim a Socket score improvement before the new npm version is published and Socket reports
it.

## Phase 5 Exit Gate

Phase 5 file-level trust polish is complete:

- community profile is at 100;
- security/disclosure route is explicit, with a working fallback and a human gate for enabling the
  primary private-advisory channel;
- trust workflows exist and are green;
- README badges point to real public services;
- the remaining trust deficits are explicit human/release gates, not missing repo files.

Phase 5 does **not** prove launch readiness by itself. Launch remains gated on:

- maintainer decision about branch protection / repository rules;
- maintainer decision about Private Vulnerability Reporting;
- npm release approval if the Socket/runtime-dependency cleanup should be visible before launch;
- social preview upload in GitHub Settings;
- external posting approval and launch timing.

## Codex Recommendation

Claude Code reviewed this artifact and `deliverables/launch/status.md` with a rubric on
2026-06-04. It scored the Phase 5 audit `83/100` with high confidence before the Private
Vulnerability Reporting correction above; the raw review is saved at:

`/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase5-trust-rubric-review-20260604T164538Z.md`

Proceed to Phase 6 distribution preparation, but keep the release/policy gates explicit:

- Use the current README/demo/trust layer as the public repo baseline.
- Do not chase a perfect Scorecard before launch; the biggest zeroes are policy, age, and community
  reality.
- If the maintainer wants maximum trust optics before launch, the highest-leverage human action is
  enabling Private Vulnerability Reporting and repository rules/branch protection that still allow
  the desired trunk workflow.
- If the maintainer wants maximum Socket optics before launch, the highest-leverage release action is
  publishing the dependency-minimized next version and rechecking Socket.
