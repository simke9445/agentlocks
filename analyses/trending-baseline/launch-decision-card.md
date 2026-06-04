# Phase 0 Launch Decision Card

Captured at: 2026-06-04T15:12:33Z

## Decision

Proceed to Phase 1 positioning before adding trust badges or repository hygiene.

## Rationale

Confirmed evidence shows Agentlocks already has a working npm release, provenance, CI, conformance
workflows, and nonzero package/repo activity. The biggest current gap is qualified human awareness
plus a crisp first-screen story. The raw clone and npm download counts are noisy because they
overlap a rapid release window, CI checkouts, release verification, mirrors, and bots. The more
actionable human signal is tiny: 6 unique GitHub viewers in the trailing traffic window.

Trust polish is still necessary, but it should not displace the first launch gates:

1. A defensible answer to "why not one `git worktree` per agent?"
2. A precise advisory-locking limitation story.
3. A short visual collision demo.
4. A top-fold README that converts a qualified visitor quickly.
5. A distribution plan that can create enough qualified visits for conversion to matter.

## Evidence Labels

Confirmed:

- GitHub stars/forks/watchers are 2/0/0.
- GitHub community profile health is 57.
- GitHub Discussions, Pages/homepage, and security policy are absent.
- npm latest is `agentlocks@0.8.0`.
- npm provenance is present.
- npm last-week and last-month downloads are both 661.
- GitHub trailing traffic shows 107 views / 6 unique viewers and 684 clones / 197 unique cloners.
- The clone/download numbers are noisy and should not be used as the primary conversion denominator.
- `bun run check` is green after formatting the new baseline artifacts: 151 tests passed, typecheck
  passed, and Biome checked 46 files with no fixes applied.

Likely:

- The low star count is primarily awareness-constrained at current sample size; positioning still
  matters because the next awareness spike should not be wasted.
- The first-screen README needs a visual proof asset more than another explanatory section.

Hypothesis:

- A dogfood demo where Codex and Claude Code use Agentlocks in one shared worktree will be more
  persuasive than a generic CLI demo.

## Expected Impact

Phase 1 should produce launch copy that can survive skeptical feedback and reduce drop-off from
qualified visitors. If it fails to produce a crisp "why not worktrees" answer, the launch should
pause or reposition.

## Tracking Plan

Track before and after each major phase:

- GitHub stars.
- GitHub views and unique viewers.
- GitHub clones and unique cloners.
- npm downloads.
- Referrer-attributed unique visits.
- View-to-star ratio when the viewer denominator is large enough to mean anything.
- Download-to-star ratio only as a noisy supporting signal, not a primary KPI.
- README top-fold comprehension test results.
- HN/X/Reddit feedback themes after launch.

## Rollback / Stop Conditions

Stop or reframe before launch if:

- The "why not worktrees" answer remains weak.
- The advisory limitation story sounds like hard enforcement.
- The demo requires too much explanation.
- A correctness issue appears in the lock lifecycle.
- `bun run check` fails.

## Owner

- Codex: grounded evidence, correctness, final synthesis.
- Claude Code: narrative/DX critique through `claude -p`.
- Human maintainer: external publication and launch approval.

## Next Phase

Phase 1: create `deliverables/launch/positioning.md`, `deliverables/launch/hn-first-comment.md`,
and `deliverables/launch/skeptic-faq.md`.
