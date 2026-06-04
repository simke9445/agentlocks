# Dependency Evidence

Last verified: 2026-06-04.

This note records the package age evidence required before adopting direct dependencies. Evidence
was collected with `bun pm view <pkg>@<version> time --json`. A package version must be at least
seven days old before adoption.

| Package | Version | Role | Publish timestamp | Age on 2026-06-04 |
| --- | --- | --- | --- | --- |
| `commander` | `14.0.3` | dev | `2026-01-31T01:47:17.592Z` | 123 days |
| `@biomejs/biome` | `2.4.15` | dev | `2026-05-09T17:08:10.962Z` | 25 days |
| `@types/bun` | `1.3.13` | dev | `2026-04-22T15:55:43.685Z` | 42 days |
| `typescript` | `6.0.3` | dev | `2026-04-16T23:38:27.905Z` | 48 days |

## Resolution Notes

- `commander` is a build-time source dependency. The published CLI ships one bundled
  `dist/agentlocks.mjs`, so the manifest keeps `commander` in `devDependencies` and installs no
  runtime dependency tree for package consumers.
- `@types/bun` is pinned to `1.3.13` to match the repository package manager version,
  `bun@1.3.13`.
- `@biomejs/biome` and `typescript` use exact dev-dependency pins in the single-package manifest.
- `package.json` is the source of truth for current dependency pins; this repository no longer uses
  workspace catalog dependency references.
