# Repository instructions for agents

Agentlocks is a standalone Bun/TypeScript advisory locking CLI and library. Keep defaults generic:
do not add prompt-optimization behavior, command aliases, or repository-specific defaults.

## Product maturity policy

Agentlocks is not live yet. Do not add compatibility layers, migration paths, deprecated aliases, or
fallback behavior for previous internal layouts, schemas, CLI flags, actor outputs, or report
formats. When a contract changes, update the implementation, tests, docs, skill instructions, and
wiki in place to the new contract.

## Commit policy

Make a commit every time a chunk of logic is implemented and unit tested. Do this whether you are
working on a branch or inside a worktree: each passing unit-tested chunk gets its own commit before
moving on to the next.

## Branch and merge policy

Prefer trunk-based development: commit straight to `main`. agentlocks exists so multiple agents can
share one worktree without clobbering, so branching for isolation is usually unnecessary. Coordinate
with file locks, run `bun run check` before each commit, and push small green commits to `main` (see
Commit policy). No branch means no merge, so no history is ever collapsed or lost.

Branch only when a change must be gated before it reaches `main` (risky or large work needing CI or
review first), is a throwaway experiment, or comes from an outside contributor.

When you do merge a branch, preserve every commit. Never squash.

- `git merge --no-ff <branch>` keeps every commit and the branch topology. Simplest, always safe.
- Or rebase the branch onto `main` and fast-forward for a linear history that still keeps every
  commit; use this only when each branch commit is green.
- Keep `main` bisect-safe: every commit, branch or not, must build and pass on its own (the Commit
  policy guarantees this, which is what makes preserving all commits safe).
- Durable narrative (decisions, rejected approaches, lessons) lives in `CHANGELOG.md` and the task
  ledger, not commit history.
- Delete the branch after merge; its commits already live on `main`.

## Dependency policy

When adding or recommending third-party packages, use `bun` for dependency resolution and package
inspection (`bun add`, `bun pm view`, `bun outdated`). Do not add a package version published less
than seven days ago. Record package age evidence (publish timestamp from `bun pm view <pkg>` or the
registry) before adopting a new dependency, and prefer mature, widely used packages over new or
obscure packages to reduce Shai-Hulud-style supply-chain risk.

## File locking policy

This repository uses Agentlocks advisory locks for multi-agent editing. Before modifying tracked or
untracked repository files, acquire a current lock for the exact repo-relative paths or narrowest
globs you expect to mutate.

```bash
bun run --silent agentlocks -- acquire <paths...> --reason "<intent>" --id-only
```

If new files become necessary, expand the existing lock before touching them:

```bash
bun run --silent agentlocks -- expand --lock <lock_id> <paths...>
```

Refresh held locks before edit batches, after long-running commands, and before staging:

```bash
bun run --silent agentlocks -- refresh <lock_id>
```

Before staging or committing, refresh held file locks and acquire the synthetic Git-index lock:

```bash
bun run --silent agentlocks -- git begin --refresh-lock <lock_id> --reason "<commit intent>" --id-only
```

Stage only paths covered by held locks. Do not use broad staging commands unless every staged path
is covered. Release locks promptly after the commit or when abandoning work:

```bash
bun run --silent agentlocks -- git end <git_lock_id> --release-lock <lock_id>
```

## Development

- Use `bun install` for dependencies.
- Run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run check` before handoff when
  behavior changes.
- Keep tests focused on file-backed lock semantics, CLI parsing/rendering, config loading, install
  idempotency, and generated instruction text.
- Keep docs aligned with the public CLI surface (agentlocks is a CLI, not a library — no exported API).

## Releasing

To cut or tag a release, follow `RELEASING.md`. Default to a PATCH bump; choose a minor only if the
changes since the last tag include new features or contract changes, and state which you picked and
why. After pushing the tag, stop at the `release` environment gate. Never approve the deployment
yourself: that approval is the maintainer's irreversible publish step.
