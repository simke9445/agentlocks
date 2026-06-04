# Package Metadata Injection Optimization

## Change

The CLI no longer imports `package.json` from production code. `scripts/build-bundle.mjs` reads the
manifest at build time and injects `AGENTLOCKS_PACKAGE_NAME` and `AGENTLOCKS_PACKAGE_VERSION` into
the Bun bundle. Source-mode execution still uses a checked fallback in `src/package-info.ts`.

## Size Result

Measured on 2026-06-04 after `bun run build`.

| Metric | Phase 0 baseline | After | Delta |
| --- | ---: | ---: | ---: |
| `dist/agentlocks.mjs` raw bytes | 170145 | 168868 | -1277 |
| `gzip -9 dist/agentlocks.mjs` bytes | 46358 | 45801 | -557 |
| `npm pack --dry-run --json --ignore-scripts` bytes | 64443 | 63876 | -567 |

## Behavior Proof

- `bun test tests/performance-contract.test.ts tests/update-notice.test.ts tests/cli.test.ts`
  passed with 52 tests.
- Production contract goldens still match source output for help, version, capabilities, JSON
  errors, lock acquire/conflict/release/status, and Git begin/end.
- Packed shim still runs through Node with Bun absent from `PATH`.
- Structural tests assert the bundle shebang, executable mode, package contents, emitted version,
  capabilities version, and absence of full manifest-only fields such as `devDependencies` and
  `packageManager`.
- Source fallback constants are tested against `package.json`, so a future version bump must update
  source fallback metadata or fail the contract suite.

## Risk And Rollback

Risk is low because command behavior, JSON contracts, generated instruction text, and package
contents are covered by the performance contract tests. If this chunk needs to be reverted after it
lands, use `git revert <package-metadata-injection-commit>`.
