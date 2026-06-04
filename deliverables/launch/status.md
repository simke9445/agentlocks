# Launch Work Status

Captured: 2026-06-04T15:46Z

## Completed In This Run

- Created `GITHUB_TRENDING_PLAN.md`, the end-to-end GitHub Trending alignment pipeline.
- Captured Phase 0 baseline artifacts under `analyses/trending-baseline/`.
- Created Phase 1 positioning artifacts:
  - `deliverables/launch/positioning.md`
  - `deliverables/launch/hn-first-comment.md`
  - `deliverables/launch/skeptic-faq.md`
- Created draft launch-package artifacts:
  - `deliverables/launch/demo-script.md`
  - `deliverables/launch/show-hn.md`
  - `deliverables/launch/x-thread.md`
  - `deliverables/launch/reddit-posts.md`
  - `deliverables/launch/awesome-list-pr.md`
  - `deliverables/launch/email-brief.md`
  - `deliverables/launch/launch-calendar.md`
- Created Phase 2 read-only correctness audit:
  - `analyses/trending-correctness/phase2-correctness-audit.md`

## Current Gate

Phase 2 local correctness and the launch-plan artifacts are green on pushed `main`.

The earlier parallel source/test refactor landed as:

- `94cd3f7 Unify resource lock arguments`

The launch-plan artifact commit landed as:

- `b9d1b2d docs: add GitHub trending launch plan`

Current public-launch gates:

- Phase 3 static collision demo files still need to be committed and pushed;
- pushed CI has not yet proven the Phase 3 demo SHA;
- static collision demo asset is embedded in the local README;
- local SVG render verification passed; GitHub README render verification remains pending;
- animated GIF/video remains optional;
- dependency cleanup files are under a separate lock and are not part of the Phase 3 demo commit.

## Verification

Green before the parallel source/test refactor:

- Phase 0 `bun run check`: 151 tests passed, typecheck passed, Biome passed.

Current verification:

- `bun run --silent biome check analyses/trending-baseline/npm-state.json analyses/trending-baseline/traffic-state.json`
  passed.
- `bun run check` passed on current `HEAD`: 151 tests passed, 0 failed, 624 assertions, typecheck
  passed, and Biome checked 46 files with no fixes applied.
- `npm pack --dry-run --json --ignore-scripts` reported a 5-file tarball surface:
  `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/agentlocks.mjs`, and `package.json`.
- `npm view agentlocks@latest version time dist.unpackedSize dependencies bin engines --json`
  confirmed latest `0.8.0`, Node `>=22.18`, bin `agentlocks`, and runtime dependency
  `commander@14.0.3`.
- `docs/dependency-evidence.md` was updated to the current single-package dependency reality and now
  records the current `commander` decision.
- Claude rubric review completed in
  `/Users/djsimovic/.codex/artifacts/claude-agentlocks-phase2-rubric-review-20260604T154121Z.md`
  with score 74/100 and recommendation "proceed only after conditions."
- Phase 3 static demo transcript was verified locally and converted into
  `assets/agentlocks-demo-collision.svg`.
- Local `sips` render verification produced a 1280x720 PNG from the SVG, and the rendered terminal
  panes were legible.

## Next Steps

1. Decide whether a literal crash/SIGKILL CLI test is worth adding before launch, or explicitly keep
   it as a fast-follow because the current launch copy does not claim literal crash recovery.
2. Keep the dependency cleanup lock separate from Phase 3 demo staging.
3. Stage only:
   - `README.md`
   - `assets/agentlocks-demo-collision.svg`
   - `deliverables/launch/demo-script.md`
   - `deliverables/launch/status.md`
4. Commit the Phase 3 demo artifacts.
5. Push and confirm CI on the pushed SHA.
6. Render-check the README image on GitHub.
7. Optionally record an animated GIF/video if a suitable terminal renderer is installed.
