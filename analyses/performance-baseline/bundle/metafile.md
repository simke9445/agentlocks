# Bundle Analysis Report

This report helps identify bundle size issues, dependency bloat, and optimization opportunities.

## Table of Contents

- [Quick Summary](#quick-summary)
- [Largest Modules by Output Contribution](#largest-modules-by-output-contribution)
- [Entry Point Analysis](#entry-point-analysis)
- [Dependency Chains](#dependency-chains)
- [Full Module Graph](#full-module-graph)
- [Raw Data for Searching](#raw-data-for-searching)

---

## Quick Summary

| Metric | Value |
|--------|-------|
| Total output size | 170.14 KB |
| Input modules | 32 |
| Entry points | 1 |
| node_modules contribution | 8 files (41.1 KB) |
| ESM modules | 24 |
| CommonJS modules | 7 |
| External imports | 30 |

## Largest Modules by Output Contribution

Modules sorted by bytes contributed to the output bundle. Large modules may indicate bloat.

| Output Bytes | % of Total | Module | Format |
|--------------|------------|--------|--------|
| 27.86 KB | 16.4% | `node_modules/commander/lib/command.js` | cjs |
| 25.93 KB | 15.2% | `src/cli/commit-hook-script.ts` | esm |
| 18.97 KB | 11.2% | `src/cli/capabilities.ts` | esm |
| 15.13 KB | 8.9% | `src/locks/registry.ts` | esm |
| 12.63 KB | 7.4% | `src/locks/commands.ts` | esm |
| 11.34 KB | 6.7% | `src/cli/program.ts` | esm |
| 9.78 KB | 5.7% | `src/init.ts` | esm |
| 6.90 KB | 4.1% | `node_modules/commander/lib/help.js` | cjs |
| 5.15 KB | 3.0% | `src/locks/session.ts` | esm |
| 3.91 KB | 2.3% | `src/cli/doctor.ts` | esm |
| 3.74 KB | 2.2% | `src/cli/index.ts` | esm |
| 3.45 KB | 2.0% | `src/locks/git-verify.ts` | esm |
| 3.20 KB | 1.9% | `node_modules/commander/lib/option.js` | cjs |
| 2.88 KB | 1.7% | `src/config.ts` | esm |
| 2.80 KB | 1.6% | `src/cli/update-notice.ts` | esm |
| 2.36 KB | 1.4% | `src/cli/commands/wrapped.ts` | esm |
| 2.1 KB | 1.2% | `src/config-validate.ts` | esm |
| 2.0 KB | 1.2% | `src/cli/robot-docs.ts` | esm |
| 1.49 KB | 0.9% | `src/locks/resources.ts` | esm |
| 1.49 KB | 0.9% | `src/locks/matching.ts` | esm |

*...and 12 more modules with output contribution*

## Entry Point Analysis

Each entry point and the total code it loads (including shared chunks).

### Entry: `bin/agentlocks.ts`

**Output file**: `./agentlocks-attribution.mjs`
**Bundle size**: 170.14 KB

**Bundled modules** (sorted by contribution):

| Bytes | Module |
|-------|--------|
| 27.86 KB | `node_modules/commander/lib/command.js` |
| 25.93 KB | `src/cli/commit-hook-script.ts` |
| 18.97 KB | `src/cli/capabilities.ts` |
| 15.13 KB | `src/locks/registry.ts` |
| 12.63 KB | `src/locks/commands.ts` |
| 11.34 KB | `src/cli/program.ts` |
| 9.78 KB | `src/init.ts` |
| 6.90 KB | `node_modules/commander/lib/help.js` |
| 5.15 KB | `src/locks/session.ts` |
| 3.91 KB | `src/cli/doctor.ts` |
| 3.74 KB | `src/cli/index.ts` |
| 3.45 KB | `src/locks/git-verify.ts` |
| 3.20 KB | `node_modules/commander/lib/option.js` |
| 2.88 KB | `src/config.ts` |
| 2.80 KB | `src/cli/update-notice.ts` |

*...and 17 more modules*

## Dependency Chains

For each module, shows what files import it. Use this to understand why a module is included.

### Most Commonly Imported Modules

Modules imported by many files. Extracting these to shared chunks may help.

| Import Count | Module | Imported By |
|--------------|--------|-------------|
| 3 | `package.json` | `src/cli/program.ts`, `src/cli/update-notice.ts`, `src/cli/capabilities.ts` |
| 2 | `src/cli/commit-hook-script.ts` | `src/init.ts`, `src/init.ts` |

## Full Module Graph

Complete dependency information for each module.

### `bin/agentlocks.ts`

- **Output contribution**: 11 bytes
- **Format**: esm
- **Imported by**: (entry point or orphan)
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/src/cli/index.ts` (import-statement, specifier: `../src/cli/index`)

### `node_modules/commander/esm.mjs`

- **Output contribution**: 206 bytes
- **Format**: esm
- **Imported by** (1 files): `src/cli/program.ts`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/index.js` (import-statement, specifier: `./index.js`)

### `node_modules/commander/index.js`

- **Output contribution**: 395 bytes
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/esm.mjs`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/argument.js` (require-call, specifier: `./lib/argument.js`)
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/command.js` (require-call, specifier: `./lib/command.js`)
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/error.js` (require-call, specifier: `./lib/error.js`)
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/help.js` (require-call, specifier: `./lib/help.js`)
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/option.js` (require-call, specifier: `./lib/option.js`)

### `node_modules/commander/lib/argument.js`

- **Output contribution**: 1.16 KB
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/index.js`
- **Imports**:
  - `./error.js` (require-call)

### `node_modules/commander/lib/command.js`

- **Output contribution**: 27.86 KB
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/index.js`
- **Imports**:
  - `node:events` (require-call, **external**)
  - `node:child_process` (require-call, **external**)
  - `node:path` (require-call, **external**)
  - `node:fs` (require-call, **external**)
  - `node:process` (require-call, **external**)
  - `./argument.js` (require-call)
  - `./error.js` (require-call)
  - `./help.js` (require-call)
  - `./option.js` (require-call)
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/lib/suggestSimilar.js` (require-call, specifier: `./suggestSimilar`)

### `node_modules/commander/lib/error.js`

- **Output contribution**: 403 bytes
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/index.js`

### `node_modules/commander/lib/help.js`

- **Output contribution**: 6.90 KB
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/index.js`
- **Imports**:
  - `./argument.js` (require-call)

### `node_modules/commander/lib/option.js`

- **Output contribution**: 3.20 KB
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/index.js`
- **Imports**:
  - `./error.js` (require-call)

### `node_modules/commander/lib/suggestSimilar.js`

- **Output contribution**: 0.96 KB
- **Format**: cjs
- **Imported by** (1 files): `node_modules/commander/lib/command.js`

### `package.json`

- **Output contribution**: 1.26 KB
- **Imported by** (3 files): `src/cli/program.ts` `src/cli/update-notice.ts` `src/cli/capabilities.ts`

### `src/cli/capabilities.ts`

- **Output contribution**: 18.97 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `../../package.json` (import-statement)
  - `../config` (import-statement)
  - `../locks/session` (import-statement)
  - `../locks/types` (import-statement)

### `src/cli/commands/init.ts`

- **Output contribution**: 0.57 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/src/init.ts` (import-statement, specifier: `../../init`)

### `src/cli/commands/lock.ts`

- **Output contribution**: 288 bytes
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/src/locks/commands.ts` (import-statement, specifier: `../../locks/commands`)
  - `/Users/djsimovic/Work/agentlocks/src/locks/types.ts` (import-statement, specifier: `../../locks/types`)

### `src/cli/commands/wrapped.ts`

- **Output contribution**: 2.36 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `node:child_process` (import-statement, **external**)
  - `../../locks/commands` (import-statement)

### `src/cli/commit-hook-script.ts`

- **Output contribution**: 25.93 KB
- **Format**: esm
- **Imported by** (2 files): `src/init.ts` `src/init.ts`

### `src/cli/doctor.ts`

- **Output contribution**: 3.91 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `/Users/djsimovic/Work/agentlocks/src/config.ts` (import-statement, specifier: `../config`)
  - `../init` (import-statement)
  - `/Users/djsimovic/Work/agentlocks/src/io.ts` (import-statement, specifier: `../io`)
  - `/Users/djsimovic/Work/agentlocks/src/locks/session.ts` (import-statement, specifier: `../locks/session`)
  - `../locks/types` (import-statement)

### `src/cli/index.ts`

- **Output contribution**: 3.74 KB
- **Format**: esm
- **Imported by** (1 files): `bin/agentlocks.ts`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/src/cli/capabilities.ts` (import-statement, specifier: `./capabilities`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/commands/init.ts` (import-statement, specifier: `./commands/init`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/commands/lock.ts` (import-statement, specifier: `./commands/lock`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/commands/wrapped.ts` (import-statement, specifier: `./commands/wrapped`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/doctor.ts` (import-statement, specifier: `./doctor`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/program.ts` (import-statement, specifier: `./program`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/robot-docs.ts` (import-statement, specifier: `./robot-docs`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/update-notice.ts` (import-statement, specifier: `./update-notice`)

### `src/cli/program.ts`

- **Output contribution**: 11.34 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `/Users/djsimovic/Work/agentlocks/node_modules/commander/esm.mjs` (import-statement, specifier: `commander`)
  - `../../package.json` (import-statement)
  - `../locks/types` (import-statement)

### `src/cli/robot-docs.ts`

- **Output contribution**: 2.0 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`

### `src/cli/update-notice.ts`

- **Output contribution**: 2.80 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/index.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:os` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `/Users/djsimovic/Work/agentlocks/package.json` (import-statement, specifier: `../../package.json`)

### `src/config-validate.ts`

- **Output contribution**: 2.1 KB
- **Format**: esm
- **Imported by** (1 files): `src/config.ts`

### `src/config.ts`

- **Output contribution**: 2.88 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/doctor.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `node:url` (import-statement, **external**)
  - `/Users/djsimovic/Work/agentlocks/src/config-validate.ts` (import-statement, specifier: `./config-validate`)
  - `./io` (import-statement)
  - `./locks/session` (import-statement)
  - `./locks/types` (import-statement)

### `src/init.ts`

- **Output contribution**: 9.78 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/commands/init.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `/Users/djsimovic/Work/agentlocks/src/cli/commit-hook-script.ts` (import-statement, specifier: `./cli/commit-hook-script`)
  - `/Users/djsimovic/Work/agentlocks/src/cli/commit-hook-script.ts` (import-statement, specifier: `./cli/commit-hook-script`)
  - `./config` (import-statement)
  - `./io` (import-statement)
  - `/Users/djsimovic/Work/agentlocks/src/json.ts` (import-statement, specifier: `./json`)

### `src/io.ts`

- **Output contribution**: 0.85 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/doctor.ts`
- **Imports**:
  - `node:crypto` (import-statement, **external**)
  - `node:fs` (import-statement, **external**)
  - `node:path` (import-statement, **external**)

### `src/json.ts`

- **Output contribution**: 47 bytes
- **Format**: esm
- **Imported by** (1 files): `src/init.ts`

### `src/locks/commands.ts`

- **Output contribution**: 12.63 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/commands/lock.ts`
- **Imports**:
  - `../config` (import-statement)
  - `/Users/djsimovic/Work/agentlocks/src/locks/git-verify.ts` (import-statement, specifier: `./git-verify`)
  - `/Users/djsimovic/Work/agentlocks/src/locks/registry.ts` (import-statement, specifier: `./registry`)
  - `./session` (import-statement)
  - `./types` (import-statement)

### `src/locks/git-verify.ts`

- **Output contribution**: 3.45 KB
- **Format**: esm
- **Imported by** (1 files): `src/locks/commands.ts`
- **Imports**:
  - `node:child_process` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `../io` (import-statement)
  - `/Users/djsimovic/Work/agentlocks/src/locks/matching.ts` (import-statement, specifier: `./matching`)
  - `./session` (import-statement)

### `src/locks/matching.ts`

- **Output contribution**: 1.49 KB
- **Format**: esm
- **Imported by** (1 files): `src/locks/git-verify.ts`
- **Imports**:
  - `./types` (import-statement)

### `src/locks/registry.ts`

- **Output contribution**: 15.13 KB
- **Format**: esm
- **Imported by** (1 files): `src/locks/commands.ts`
- **Imports**:
  - `node:crypto` (import-statement, **external**)
  - `node:fs` (import-statement, **external**)
  - `node:os` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `../io` (import-statement)
  - `../json` (import-statement)
  - `./matching` (import-statement)
  - `/Users/djsimovic/Work/agentlocks/src/locks/resources.ts` (import-statement, specifier: `./resources`)
  - `./session` (import-statement)
  - `./types` (import-statement)

### `src/locks/resources.ts`

- **Output contribution**: 1.49 KB
- **Format**: esm
- **Imported by** (1 files): `src/locks/registry.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `./types` (import-statement)

### `src/locks/session.ts`

- **Output contribution**: 5.15 KB
- **Format**: esm
- **Imported by** (1 files): `src/cli/doctor.ts`
- **Imports**:
  - `node:fs` (import-statement, **external**)
  - `node:os` (import-statement, **external**)
  - `node:path` (import-statement, **external**)
  - `../io` (import-statement)
  - `./types` (import-statement)

### `src/locks/types.ts`

- **Output contribution**: 282 bytes
- **Format**: esm
- **Imported by** (1 files): `src/cli/commands/lock.ts`

## Raw Data for Searching

This section contains raw, grep-friendly data. Use these patterns:
- `[MODULE:` - Find all modules
- `[OUTPUT_BYTES:` - Find output contribution for each module
- `[IMPORT:` - Find all import relationships
- `[IMPORTED_BY:` - Find reverse dependencies
- `[ENTRY:` - Find entry points
- `[EXTERNAL:` - Find external imports
- `[NODE_MODULES:` - Find node_modules files

### All Modules

```
[MODULE: node_modules/commander/lib/command.js]
[OUTPUT_BYTES: node_modules/commander/lib/command.js = 27855 bytes]
[FORMAT: node_modules/commander/lib/command.js = cjs]
[NODE_MODULES: node_modules/commander/lib/command.js]
[MODULE: src/cli/commit-hook-script.ts]
[OUTPUT_BYTES: src/cli/commit-hook-script.ts = 25926 bytes]
[FORMAT: src/cli/commit-hook-script.ts = esm]
[MODULE: src/cli/capabilities.ts]
[OUTPUT_BYTES: src/cli/capabilities.ts = 18972 bytes]
[FORMAT: src/cli/capabilities.ts = esm]
[MODULE: src/locks/registry.ts]
[OUTPUT_BYTES: src/locks/registry.ts = 15127 bytes]
[FORMAT: src/locks/registry.ts = esm]
[MODULE: src/locks/commands.ts]
[OUTPUT_BYTES: src/locks/commands.ts = 12628 bytes]
[FORMAT: src/locks/commands.ts = esm]
[MODULE: src/cli/program.ts]
[OUTPUT_BYTES: src/cli/program.ts = 11344 bytes]
[FORMAT: src/cli/program.ts = esm]
[MODULE: src/init.ts]
[OUTPUT_BYTES: src/init.ts = 9782 bytes]
[FORMAT: src/init.ts = esm]
[MODULE: node_modules/commander/lib/help.js]
[OUTPUT_BYTES: node_modules/commander/lib/help.js = 6899 bytes]
[FORMAT: node_modules/commander/lib/help.js = cjs]
[NODE_MODULES: node_modules/commander/lib/help.js]
[MODULE: src/locks/session.ts]
[OUTPUT_BYTES: src/locks/session.ts = 5154 bytes]
[FORMAT: src/locks/session.ts = esm]
[MODULE: src/cli/doctor.ts]
[OUTPUT_BYTES: src/cli/doctor.ts = 3907 bytes]
[FORMAT: src/cli/doctor.ts = esm]
[MODULE: src/cli/index.ts]
[OUTPUT_BYTES: src/cli/index.ts = 3737 bytes]
[FORMAT: src/cli/index.ts = esm]
[MODULE: src/locks/git-verify.ts]
[OUTPUT_BYTES: src/locks/git-verify.ts = 3454 bytes]
[FORMAT: src/locks/git-verify.ts = esm]
[MODULE: node_modules/commander/lib/option.js]
[OUTPUT_BYTES: node_modules/commander/lib/option.js = 3197 bytes]
[FORMAT: node_modules/commander/lib/option.js = cjs]
[NODE_MODULES: node_modules/commander/lib/option.js]
[MODULE: src/config.ts]
[OUTPUT_BYTES: src/config.ts = 2875 bytes]
[FORMAT: src/config.ts = esm]
[MODULE: src/cli/update-notice.ts]
[OUTPUT_BYTES: src/cli/update-notice.ts = 2799 bytes]
[FORMAT: src/cli/update-notice.ts = esm]
[MODULE: src/cli/commands/wrapped.ts]
[OUTPUT_BYTES: src/cli/commands/wrapped.ts = 2361 bytes]
[FORMAT: src/cli/commands/wrapped.ts = esm]
[MODULE: src/config-validate.ts]
[OUTPUT_BYTES: src/config-validate.ts = 2052 bytes]
[FORMAT: src/config-validate.ts = esm]
[MODULE: src/cli/robot-docs.ts]
[OUTPUT_BYTES: src/cli/robot-docs.ts = 2026 bytes]
[FORMAT: src/cli/robot-docs.ts = esm]
[MODULE: src/locks/resources.ts]
[OUTPUT_BYTES: src/locks/resources.ts = 1491 bytes]
[FORMAT: src/locks/resources.ts = esm]
[MODULE: src/locks/matching.ts]
[OUTPUT_BYTES: src/locks/matching.ts = 1486 bytes]
[FORMAT: src/locks/matching.ts = esm]
[MODULE: package.json]
[OUTPUT_BYTES: package.json = 1257 bytes]
[MODULE: node_modules/commander/lib/argument.js]
[OUTPUT_BYTES: node_modules/commander/lib/argument.js = 1159 bytes]
[FORMAT: node_modules/commander/lib/argument.js = cjs]
[NODE_MODULES: node_modules/commander/lib/argument.js]
[MODULE: node_modules/commander/lib/suggestSimilar.js]
[OUTPUT_BYTES: node_modules/commander/lib/suggestSimilar.js = 956 bytes]
[FORMAT: node_modules/commander/lib/suggestSimilar.js = cjs]
[NODE_MODULES: node_modules/commander/lib/suggestSimilar.js]
[MODULE: src/io.ts]
[OUTPUT_BYTES: src/io.ts = 848 bytes]
[FORMAT: src/io.ts = esm]
[MODULE: src/cli/commands/init.ts]
[OUTPUT_BYTES: src/cli/commands/init.ts = 571 bytes]
[FORMAT: src/cli/commands/init.ts = esm]
[MODULE: node_modules/commander/lib/error.js]
[OUTPUT_BYTES: node_modules/commander/lib/error.js = 403 bytes]
[FORMAT: node_modules/commander/lib/error.js = cjs]
[NODE_MODULES: node_modules/commander/lib/error.js]
[MODULE: node_modules/commander/index.js]
[OUTPUT_BYTES: node_modules/commander/index.js = 395 bytes]
[FORMAT: node_modules/commander/index.js = cjs]
[NODE_MODULES: node_modules/commander/index.js]
[MODULE: src/cli/commands/lock.ts]
[OUTPUT_BYTES: src/cli/commands/lock.ts = 288 bytes]
[FORMAT: src/cli/commands/lock.ts = esm]
[MODULE: src/locks/types.ts]
[OUTPUT_BYTES: src/locks/types.ts = 282 bytes]
[FORMAT: src/locks/types.ts = esm]
[MODULE: node_modules/commander/esm.mjs]
[OUTPUT_BYTES: node_modules/commander/esm.mjs = 206 bytes]
[FORMAT: node_modules/commander/esm.mjs = esm]
[NODE_MODULES: node_modules/commander/esm.mjs]
[MODULE: src/json.ts]
[OUTPUT_BYTES: src/json.ts = 47 bytes]
[FORMAT: src/json.ts = esm]
[MODULE: bin/agentlocks.ts]
[OUTPUT_BYTES: bin/agentlocks.ts = 11 bytes]
[FORMAT: bin/agentlocks.ts = esm]
```

### All Imports

```
[IMPORT: bin/agentlocks.ts -> /Users/djsimovic/Work/agentlocks/src/cli/index.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/capabilities.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/commands/init.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/commands/lock.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/commands/wrapped.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/doctor.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/program.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/robot-docs.ts]
[IMPORT: src/cli/index.ts -> /Users/djsimovic/Work/agentlocks/src/cli/update-notice.ts]
[IMPORT: src/cli/program.ts -> /Users/djsimovic/Work/agentlocks/node_modules/commander/esm.mjs]
[IMPORT: src/cli/program.ts -> ../../package.json]
[IMPORT: src/cli/program.ts -> ../locks/types]
[EXTERNAL: src/cli/update-notice.ts imports node:fs]
[EXTERNAL: src/cli/update-notice.ts imports node:os]
[EXTERNAL: src/cli/update-notice.ts imports node:path]
[IMPORT: src/cli/update-notice.ts -> /Users/djsimovic/Work/agentlocks/package.json]
[IMPORT: src/cli/commands/lock.ts -> /Users/djsimovic/Work/agentlocks/src/locks/commands.ts]
[IMPORT: src/cli/commands/lock.ts -> /Users/djsimovic/Work/agentlocks/src/locks/types.ts]
[IMPORT: src/cli/commands/init.ts -> /Users/djsimovic/Work/agentlocks/src/init.ts]
[EXTERNAL: src/cli/commands/wrapped.ts imports node:child_process]
[IMPORT: src/cli/commands/wrapped.ts -> ../../locks/commands]
[IMPORT: src/cli/capabilities.ts -> ../../package.json]
[IMPORT: src/cli/capabilities.ts -> ../config]
[IMPORT: src/cli/capabilities.ts -> ../locks/session]
[IMPORT: src/cli/capabilities.ts -> ../locks/types]
[EXTERNAL: src/cli/doctor.ts imports node:fs]
[EXTERNAL: src/cli/doctor.ts imports node:path]
[IMPORT: src/cli/doctor.ts -> /Users/djsimovic/Work/agentlocks/src/config.ts]
[IMPORT: src/cli/doctor.ts -> ../init]
[IMPORT: src/cli/doctor.ts -> /Users/djsimovic/Work/agentlocks/src/io.ts]
[IMPORT: src/cli/doctor.ts -> /Users/djsimovic/Work/agentlocks/src/locks/session.ts]
[IMPORT: src/cli/doctor.ts -> ../locks/types]
[IMPORT: src/locks/commands.ts -> ../config]
[IMPORT: src/locks/commands.ts -> /Users/djsimovic/Work/agentlocks/src/locks/git-verify.ts]
[IMPORT: src/locks/commands.ts -> /Users/djsimovic/Work/agentlocks/src/locks/registry.ts]
[IMPORT: src/locks/commands.ts -> ./session]
[IMPORT: src/locks/commands.ts -> ./types]
[EXTERNAL: src/init.ts imports node:fs]
[EXTERNAL: src/init.ts imports node:path]
[IMPORT: src/init.ts -> /Users/djsimovic/Work/agentlocks/src/cli/commit-hook-script.ts]
[IMPORT: src/init.ts -> /Users/djsimovic/Work/agentlocks/src/cli/commit-hook-script.ts]
[IMPORT: src/init.ts -> ./config]
[IMPORT: src/init.ts -> ./io]
[IMPORT: src/init.ts -> /Users/djsimovic/Work/agentlocks/src/json.ts]
[EXTERNAL: src/locks/session.ts imports node:fs]
[EXTERNAL: src/locks/session.ts imports node:os]
[EXTERNAL: src/locks/session.ts imports node:path]
[IMPORT: src/locks/session.ts -> ../io]
[IMPORT: src/locks/session.ts -> ./types]
[EXTERNAL: src/config.ts imports node:fs]
[EXTERNAL: src/config.ts imports node:path]
[EXTERNAL: src/config.ts imports node:url]
[IMPORT: src/config.ts -> /Users/djsimovic/Work/agentlocks/src/config-validate.ts]
[IMPORT: src/config.ts -> ./io]
[IMPORT: src/config.ts -> ./locks/session]
[IMPORT: src/config.ts -> ./locks/types]
[EXTERNAL: src/io.ts imports node:crypto]
[EXTERNAL: src/io.ts imports node:fs]
[EXTERNAL: src/io.ts imports node:path]
[IMPORT: node_modules/commander/esm.mjs -> /Users/djsimovic/Work/agentlocks/node_modules/commander/index.js]
[EXTERNAL: src/locks/registry.ts imports node:crypto]
[EXTERNAL: src/locks/registry.ts imports node:fs]
[EXTERNAL: src/locks/registry.ts imports node:os]
[EXTERNAL: src/locks/registry.ts imports node:path]
[IMPORT: src/locks/registry.ts -> ../io]
[IMPORT: src/locks/registry.ts -> ../json]
[IMPORT: src/locks/registry.ts -> ./matching]
[IMPORT: src/locks/registry.ts -> /Users/djsimovic/Work/agentlocks/src/locks/resources.ts]
[IMPORT: src/locks/registry.ts -> ./session]
[IMPORT: src/locks/registry.ts -> ./types]
[EXTERNAL: src/locks/git-verify.ts imports node:child_process]
[EXTERNAL: src/locks/git-verify.ts imports node:path]
[IMPORT: src/locks/git-verify.ts -> ../io]
[IMPORT: src/locks/git-verify.ts -> /Users/djsimovic/Work/agentlocks/src/locks/matching.ts]
[IMPORT: src/locks/git-verify.ts -> ./session]
[IMPORT: node_modules/commander/index.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/argument.js]
[IMPORT: node_modules/commander/index.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/command.js]
[IMPORT: node_modules/commander/index.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/error.js]
[IMPORT: node_modules/commander/index.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/help.js]
[IMPORT: node_modules/commander/index.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/option.js]
[EXTERNAL: node_modules/commander/lib/command.js imports node:events]
[EXTERNAL: node_modules/commander/lib/command.js imports node:child_process]
[EXTERNAL: node_modules/commander/lib/command.js imports node:path]
[EXTERNAL: node_modules/commander/lib/command.js imports node:fs]
[EXTERNAL: node_modules/commander/lib/command.js imports node:process]
[IMPORT: node_modules/commander/lib/command.js -> ./argument.js]
[IMPORT: node_modules/commander/lib/command.js -> ./error.js]
[IMPORT: node_modules/commander/lib/command.js -> ./help.js]
[IMPORT: node_modules/commander/lib/command.js -> ./option.js]
[IMPORT: node_modules/commander/lib/command.js -> /Users/djsimovic/Work/agentlocks/node_modules/commander/lib/suggestSimilar.js]
[IMPORT: node_modules/commander/lib/option.js -> ./error.js]
[IMPORT: node_modules/commander/lib/argument.js -> ./error.js]
[IMPORT: node_modules/commander/lib/help.js -> ./argument.js]
[IMPORT: src/locks/matching.ts -> ./types]
[EXTERNAL: src/locks/resources.ts imports node:fs]
[EXTERNAL: src/locks/resources.ts imports node:path]
[IMPORT: src/locks/resources.ts -> ./types]
```

### Reverse Dependencies (Imported By)

```
[IMPORTED_BY: src/locks/commands.ts <- src/cli/commands/lock.ts]
[IMPORTED_BY: src/io.ts <- src/cli/doctor.ts]
[IMPORTED_BY: node_modules/commander/lib/help.js <- node_modules/commander/index.js]
[IMPORTED_BY: src/locks/registry.ts <- src/locks/commands.ts]
[IMPORTED_BY: src/cli/commands/init.ts <- src/cli/index.ts]
[IMPORTED_BY: node_modules/commander/esm.mjs <- src/cli/program.ts]
[IMPORTED_BY: src/cli/commit-hook-script.ts <- src/init.ts]
[IMPORTED_BY: src/cli/commit-hook-script.ts <- src/init.ts]
[IMPORTED_BY: node_modules/commander/lib/argument.js <- node_modules/commander/index.js]
[IMPORTED_BY: src/cli/commands/lock.ts <- src/cli/index.ts]
[IMPORTED_BY: src/cli/program.ts <- src/cli/index.ts]
[IMPORTED_BY: src/locks/git-verify.ts <- src/locks/commands.ts]
[IMPORTED_BY: node_modules/commander/index.js <- node_modules/commander/esm.mjs]
[IMPORTED_BY: src/locks/resources.ts <- src/locks/registry.ts]
[IMPORTED_BY: src/locks/session.ts <- src/cli/doctor.ts]
[IMPORTED_BY: src/json.ts <- src/init.ts]
[IMPORTED_BY: node_modules/commander/lib/option.js <- node_modules/commander/index.js]
[IMPORTED_BY: node_modules/commander/lib/suggestSimilar.js <- node_modules/commander/lib/command.js]
[IMPORTED_BY: src/locks/matching.ts <- src/locks/git-verify.ts]
[IMPORTED_BY: src/init.ts <- src/cli/commands/init.ts]
[IMPORTED_BY: src/cli/commands/wrapped.ts <- src/cli/index.ts]
[IMPORTED_BY: src/locks/types.ts <- src/cli/commands/lock.ts]
[IMPORTED_BY: node_modules/commander/lib/error.js <- node_modules/commander/index.js]
[IMPORTED_BY: src/cli/update-notice.ts <- src/cli/index.ts]
[IMPORTED_BY: src/cli/robot-docs.ts <- src/cli/index.ts]
[IMPORTED_BY: src/cli/index.ts <- bin/agentlocks.ts]
[IMPORTED_BY: src/config-validate.ts <- src/config.ts]
[IMPORTED_BY: src/config.ts <- src/cli/doctor.ts]
[IMPORTED_BY: src/cli/doctor.ts <- src/cli/index.ts]
[IMPORTED_BY: node_modules/commander/lib/command.js <- node_modules/commander/index.js]
[IMPORTED_BY: src/cli/capabilities.ts <- src/cli/index.ts]
[IMPORTED_BY: package.json <- src/cli/program.ts]
[IMPORTED_BY: package.json <- src/cli/update-notice.ts]
[IMPORTED_BY: package.json <- src/cli/capabilities.ts]
```

### Entry Points

```
[ENTRY: bin/agentlocks.ts -> ./agentlocks-attribution.mjs (170144 bytes)]
```

### node_modules Summary

```
[NODE_MODULES: node_modules/commander/lib/command.js (contributes 27855 bytes)]
[NODE_MODULES: node_modules/commander/lib/help.js (contributes 6899 bytes)]
[NODE_MODULES: node_modules/commander/lib/option.js (contributes 3197 bytes)]
[NODE_MODULES: node_modules/commander/lib/argument.js (contributes 1159 bytes)]
[NODE_MODULES: node_modules/commander/lib/suggestSimilar.js (contributes 956 bytes)]
[NODE_MODULES: node_modules/commander/lib/error.js (contributes 403 bytes)]
[NODE_MODULES: node_modules/commander/index.js (contributes 395 bytes)]
[NODE_MODULES: node_modules/commander/esm.mjs (contributes 206 bytes)]
```
