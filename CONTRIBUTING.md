# Contributing

Agentlocks is pre-release. Keep changes small, generic, and backed by tests or command output.

## Before You Open a Change

- Read `AGENTS.md`.
- Do not add prompt-optimization behavior, command aliases, repository-specific defaults,
  compatibility layers, migration paths, or deprecated names.
- Do not add dependencies unless the supply-chain checks in `AGENTS.md` are satisfied.
- Keep public docs aligned with the CLI contract, config contract, generated instruction text, and
  tests (agentlocks is a CLI, not a library — there is no exported API).

## Local Checks

```bash
bun install --frozen-lockfile
bun test
bun run typecheck
bun run lint
bun run check
```

## File Locks

This repository uses Agentlocks for advisory file locks. Before editing files, acquire the narrowest
lock that covers the quoted resources you will modify:

```bash
bun run --silent agentlocks -- acquire '<resource>' --reason "<intent>" --id-only
```

Expand and refresh the lock as needed, and use `git begin` / `git end` around staging and commits as
documented in `AGENTS.md`.

## Pull Requests

- Explain the user-visible behavior change.
- List tests and commands run.
- Include docs updates when command output, config fields, or install behavior change.
- Keep unrelated refactors out of the patch.
