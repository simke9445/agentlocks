# Launch War Room

Status: draft. This is an internal launch-day operating sheet. It does not approve posting,
opening issues, changing repository settings, publishing npm, or approving a GitHub release
environment.

Captured: 2026-06-04T17:49Z

## Current Verified State

Repository:

- GitHub repo: `https://github.com/simke9445/agentlocks`
- Latest verified pushed commit before this document correction: `e0dc1ff Add phase 7 launch war room`
- CI: green on `e0dc1ff`
- CodeQL: green on `e0dc1ff`
- OpenSSF Scorecard workflow: green on `e0dc1ff`
- OpenSSF Scorecard API: `5.8` on commit `e0dc1ff`
- OpenSSF Scorecard is not a public flex yet; treat it as an internal improvement tracker until the
  score is materially stronger.
- Stars / forks / watchers: `2 / 0 / 0`
- GitHub Discussions: disabled
- Security policy: enabled at `https://github.com/simke9445/agentlocks/security/policy`
- Custom Open Graph image: enabled
- Demo SVG raw asset: HTTP 200 from
  `https://raw.githubusercontent.com/simke9445/agentlocks/main/assets/agentlocks-demo-collision.svg`

npm:

- Published latest: `agentlocks@0.8.0`
- Runtime requirement: `agentlocks@0.8.0` declares `engines.node >=22.18`; every clean-install
  smoke test and support reply should check Node before debugging CLI behavior.
- npm downloads, last week: `661` from 2026-05-27 through 2026-06-02
- Caveat: the trailing-week window starts before the package's first publish on 2026-06-01, and
  downloads this early can be dominated by registry mirrors, automation, and CI. Use deltas after
  known human posts, not absolute counts, as the launch signal.
- npm package still declares runtime dependency `commander@14.0.3`
- npm provenance is present for `agentlocks@0.8.0`
- Local npm install verification passed with this machine's release-age override. The latest
  recheck used a temporary prefix at `/tmp/agentlocks-npm-install-check.88HRS9` and printed
  `0.8.0`:

```bash
tmp="$(mktemp -d /tmp/agentlocks-npm-install-check.XXXXXX)"
npm install --min-release-age=0 --prefix "$tmp" agentlocks@latest --ignore-scripts --no-audit --no-fund
"$tmp/node_modules/.bin/agentlocks" --version
"$tmp/node_modules/.bin/agentlocks" --help
```

Why the override is needed here: this machine has npm `before` configured to 2026-05-28, while
`agentlocks@0.8.0` was published on 2026-06-03T14:51:00Z. Without `--min-release-age=0`, npm
filters out the published latest version locally and reports `ENOVERSIONS` / `ETARGET`.
`--min-release-age=0` proves the registry artifact resolves; it does not prove a user enforcing a
7-day release-age policy can install the latest package before 2026-06-10T14:51:00Z.

Do not use `doctor --json` as the clean-install pass criterion: in an uninitialized temporary
prefix, the published CLI correctly warns that config/init files are missing and exits nonzero.
Use `doctor --json` only as a diagnostic after deciding whether the temp install should be
initialized.

Socket:

- Local Socket CLI is installed at version `1.1.108`, authenticated, and configured for the
  `agentlocks` Socket organization. Do not paste Socket CLI banners into public artifacts because
  they include local auth state.
- Current published package score is still tied to `agentlocks@0.8.0`.
- Current score remains overall `75`, supply-chain `75`, maintenance `91` shallow / `89` deep.
- `socket package score npm agentlocks --markdown` is the published package score command.
- `socket scan create --read-only --markdown --repo=agentlocks --branch=main package.json bun.lock`
  is the non-mutating local manifest scan command.
- If the Socket npm wrapper is enabled and interferes with registry smoke checks, use
  `socket raw-npm install ...` with the same install flags to bypass Socket gating for that
  verification run.
- Do not use Socket as a public trust flex until a newer npm package is published and rechecked.

Traffic baseline:

- GitHub views: `107` total, `6` unique over the GitHub traffic window.
- GitHub clones: `684` total, `197` unique over the GitHub traffic window.
- Referrers: `github.com` (`18` views, `1` unique), `t.co` (`6` views, `4` unique).
- Caveat: the clone-to-view ratio is likely inflated by automation. Treat human comments, stars from
  known posts, and issue quality as stronger evidence than raw clone count.

## Launch Blockers

These require a maintainer decision before public launch.

- External posting approval: all HN, X, Reddit, Product Hunt, newsletter, Discord/Slack, PR, issue,
  and discussion activity is human-gated.
- GitHub Discussions is disabled. Either enable it or create a launch feedback issue before posting.
- Private Vulnerability Reporting is disabled while `SECURITY.md` points reporters at GitHub
  Security Advisories. Enable PVR before broader security scrutiny, or replace the template with a
  working private intake path before launch.
- Next npm release is not published. If Socket/package optics matter for launch, publish a new
  dependency-minimized release and re-run Socket first.
- Social preview image is already enabled, but settings upload remains a maintainer-controlled
  surface.
- Reply window: maintainer is sole owner of replies, metric snapshots, and triage. Block a response
  SLA of 30 minutes or less during the first 3 hours, especially on HN, and 2 hours or less for the
  next 24 hours. If that window is not available, do not post.

## Pre-Launch Checklist

Run these immediately before any public post.

```bash
git status --short --branch --untracked-files=all
bun run check
gh run list --branch main --limit 6 --json name,headSha,status,conclusion,url
gh repo view simke9445/agentlocks --json stargazerCount,forkCount,watchers,hasDiscussionsEnabled,usesCustomOpenGraphImage,securityPolicyUrl
npm view agentlocks version dist-tags dist dependencies --json
npm config get before
node --version # must be >=22.18 for agentlocks@0.8.0
socket package score npm agentlocks --markdown
curl -fsSL https://api.npmjs.org/downloads/point/last-week/agentlocks
curl -I -L -s https://raw.githubusercontent.com/simke9445/agentlocks/main/assets/agentlocks-demo-collision.svg | sed -n '1,12p'
```

Latest npm install check:

```bash
tmp="$(mktemp -d /tmp/agentlocks-npm-install-check.XXXXXX)"
node --version # must be >=22.18
npm install --min-release-age=0 --prefix "$tmp" agentlocks@latest --ignore-scripts --no-audit --no-fund
"$tmp/node_modules/.bin/agentlocks" --version
"$tmp/node_modules/.bin/agentlocks" --help
```

Use `--min-release-age=0` only to bypass this machine's local npm age policy. Do not put that flag
in public install instructions.

Clean-room check to run on a machine/container without this workstation's npm `before` override and
with Node >=22.18:

```bash
npm install -g agentlocks@0.8.0
agentlocks --version
agentlocks --help
```

## Metric Watch Commands

Run before posting, then at 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours, and 24 hours.

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
gh repo view simke9445/agentlocks --json stargazerCount,forkCount,watchers
gh api repos/simke9445/agentlocks/traffic/views
gh api repos/simke9445/agentlocks/traffic/clones
gh api repos/simke9445/agentlocks/traffic/popular/referrers
curl -fsSL https://api.npmjs.org/downloads/point/last-day/agentlocks
curl -fsSL https://api.npmjs.org/downloads/point/last-week/agentlocks
gh issue list --repo simke9445/agentlocks --state open --limit 50
gh pr list --repo simke9445/agentlocks --state open --limit 50
```

Record snapshots in a private operator note first. Only summarize publicly when the numbers are
meaningful and not vanity-only.

## Response Rules

- Be precise about advisory semantics: participating agents coordinate; non-participating tools can
  still edit files.
- Do not argue with worktree skeptics. Use the split once: worktrees are best for independent
  branches; Agentlocks is for intentionally shared state, one live branch, generated outputs, and
  fast Codex/Claude Code handoff.
- Convert repeated objections into README or FAQ patches the same day.
- If a real bug appears, acknowledge it, reproduce it, patch it, and link the fix.
- Do not ask for stars.
- Do not imply affiliation with OpenAI, Anthropic, Claude Code, Codex, or adjacent projects.
- Do not mention a target score, Socket improvement, or security setting unless verified live.
- Do not include `AGENTLOCKS_AGENT_ID=...` prefixes in public examples; Codex and Claude Code
  identities are auto-assigned in this setup.

## Launch-Day Triage Labels

Use existing labels if they exist; otherwise keep triage in comments until the maintainer approves
label creation.

- `bug`: reproducible defect.
- `docs`: confusion that can be fixed with README/FAQ text.
- `question`: legitimate usage question.
- `launch-feedback`: non-blocking launch feedback.
- `security`: public security-related report; route to `SECURITY.md` and avoid detailed public
  exploit discussion.
- `good-first-issue`: only for small, well-scoped fixes after maintainer approval.

## Reply Templates

Advisory-lock limitation:

```text
Yes, the locks are advisory. Agentlocks coordinates participating agents and adds Git-index
verification before commit, but it does not hard-block editors, shells, or Git. That boundary is
intentional: the target use case is cooperative local multi-agent work, not hostile enforcement.
```

Why not one worktree per agent:

```text
Separate worktrees are the right default when agents can work independently. Agentlocks is for the
coupled cases: one live branch, shared generated state, shared build outputs, or fast Codex/Claude
Code handoffs where merging separate worktrees first is the friction.
```

Bug acknowledgement:

```text
Thanks, that sounds reproducible enough to investigate. I am going to try it against the latest npm
package and current `main`, then I will either file a minimal repro or patch it directly.
```

Out-of-scope integration request:

```text
That integration might make sense later, but the current launch scope is the local CLI contract:
path locks, conflict output, and Git-index verification. I am tracking integration requests
separately so the core contract stays small.
```

Node version mismatch:

```text
Agentlocks currently requires Node >=22.18 because the CLI loads TypeScript config files through
the native runtime path. Please check `node --version` first; if it is older, upgrade Node and retry
the same command before debugging Agentlocks itself.
```

## Stop Conditions

Pause launch amplification if any of these happen:

- `bun run check` or main CI goes red.
- A credible lock correctness bug is reported.
- A credible security report arrives while Private Vulnerability Reporting is disabled or the
  private reporting path is unclear.
- npm latest install fails on a clean machine for any reason other than the user's own release-age
  policy on a release that is at least 7 days old. Until 2026-06-10T14:51:00Z, `agentlocks@0.8.0`
  is under 7 days old, so security-conscious age-policy users can fail to install; do not push
  install-heavy channels before then unless the maintainer accepts that tradeoff.
- Repeated comments show the README top fold is overselling hard enforcement.
- Maintainer cannot reply for the next few hours.
- The first five adjacent-builder contacts are silent or decline; revisit positioning before more
  outreach.

Resume launch amplification only after the stop condition is cleared, CI is green again if code
changed, any security-reporting gap is resolved, the npm install check has been re-run on Node
>=22.18, and the response owner has a fresh reply window blocked.

## Incident & Rollback Runbook

If a credible lock-correctness bug ships in the published package:

1. Reproduce against npm latest and current `main`; capture the exact repro.
2. Pause launch amplification and route public replies to the issue or advisory.
3. Deprecate the bad version without unpublishing:
   `npm deprecate agentlocks@<bad> "Lock-correctness bug <link>; upgrade to <good> or pin <prev>."`
4. If a prior good version exists, point users there and move `latest` only after the maintainer
   approves: `npm dist-tag add agentlocks@<good> latest`.
5. Open a GitHub Security Advisory if the bug can cause silent data loss across agents.
6. Public comms stay short and factual: link the issue, the affected version, and the remediation.
7. Resume only after the fix is released, CI is green, and one clean npm install re-verify passes.

## Next Human Decisions

1. Enable GitHub Discussions or choose a launch feedback issue.
2. Enable Private Vulnerability Reporting or keep the `SECURITY.md` fallback only.
3. Decide whether to publish the next npm release before launch.
4. Approve exact launch channel order and timing.
5. Approve which awesome-list PRs, scope-check issues, and adjacent-builder notes may be used.
