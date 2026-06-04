# Bundle Size Attribution

Generated at `d67bec2` after Phase 1 contract capture.

## Build Command

```bash
bun build bin/agentlocks.ts --target=node --minify --outfile=/tmp/agentlocks-attribution.mjs \
  --metafile=analyses/performance-baseline/bundle/metafile.json \
  --metafile-md=analyses/performance-baseline/bundle/metafile.md
wc -c /tmp/agentlocks-attribution.mjs
```

Measured output: `170144` raw bytes for the Bun attribution build. The Phase 0 production bundle
artifact is `170145` raw bytes after the build script rewrites the shebang.

## Largest Shipped Contributors

Use Bun's output-contribution table as pre-minify attribution, then confirm candidates with
build-and-measure deltas before implementation.

| Rank | Module | Output contribution | Notes |
| ---: | --- | ---: | --- |
| 1 | `node_modules/commander/lib/command.js` | 27.86 KB | High cross-axis candidate but parser replacement is broad and gated by goldens. |
| 2 | `src/cli/commit-hook-script.ts` | 25.93 KB | Large generated hook payload; reduction must preserve generated instructions/hooks. |
| 3 | `src/cli/capabilities.ts` | 18.97 KB | Machine-readable contract surface; shrink only with golden/conformance proof. |
| 4 | `src/locks/registry.ts` | 15.13 KB | Correctness-critical lock core; any write/mutex change needs contention proof. |
| 5 | `src/locks/commands.ts` | 12.63 KB | Rendering and JSON contract surface. |
| 6 | `src/cli/program.ts` | 11.34 KB | Commander command graph construction. |
| 7 | `src/init.ts` | 9.78 KB | Generated instructions/hooks path. |
| 8 | `node_modules/commander/lib/help.js` | 6.90 KB | Help formatting, high contract risk if replaced. |

`package.json` contributes 1.26 KB and is imported by `src/cli/program.ts`,
`src/cli/update-notice.ts`, and `src/cli/capabilities.ts`.

## Confirmed Delta Experiments

| Candidate | Throwaway measurement | Result |
| --- | --- | ---: |
| Replace `package.json` imports with package name/version constants | Detached worktree at `d67bec2`; direct constants substituted in the three import sites; `bun run build` before/after | 1,137 raw bytes smaller |

This delta confirms the package-metadata candidate moves shipped bytes even though it is not a top
module by itself. The actual implementation must be release-safe: build-time injection or a
build/prepack assertion, not a hand-synced stale constant.
