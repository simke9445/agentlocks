# Agentlocks Demo Script

Status: Phase 3 static visual complete; animated GIF/video remains optional.

Current asset:

- `assets/agentlocks-demo-collision.svg`
- grounded in a real 2026-06-04 command transcript from a temp Git repo, with the public command
  text normalized to rely on automatic Codex and Claude Code identity
- embedded near the README top fold

Do not publish an animated recording until the final commands have been re-run against the current
release.

## Demo Goal

Show the whole idea in under 10 seconds:

1. Codex holds a lease on a file in one shared worktree.
2. Claude Code tries to acquire the same file.
3. Agentlocks reports the blocking owner, reason, and next command instead of letting the overlap
   stay silent.

The demo proves coordination between cooperating agents. It must not imply hard enforcement against
tools that ignore Agentlocks.

## Current Demo Transcript

Codex and Claude Code assign lock identity automatically. The public demo therefore omits explicit
`AGENTLOCKS_AGENT_ID=...` prefixes.

```text
$ agentlocks acquire src/auth.ts --reason "Codex refactors login flow" --id-only
lock_20260604T155313Z_139a36cf

$ agentlocks acquire src/auth.ts --reason "Claude reviews same login file"
lock conflict: src/auth.ts
held by: codex:<session>
reason: Codex refactors login flow
status: held, expires 2026-06-04T16:03:13Z
next: work on unrelated unlocked files, then retry

$ agentlocks release lock_20260604T155313Z_139a36cf --id-only
lock_20260604T155313Z_139a36cf
```

The SVG normalizes the automatically assigned owner to `codex:<session>` and omits the exact expiry
timestamp to keep the asset timeless.

## Recording Setup

- Terminal layout: two equal panes.
- Left pane label: `Codex`.
- Right pane label: `Claude Code`.
- Working directory: the same clone of `simke9445/agentlocks`.
- Shell font large enough to read in a GitHub README image.
- Hide unrelated prompt decorations and tokens.
- Keep the final clip between 8 and 15 seconds.

## Clean-Room Preconditions

Run this only after the repo is in a clean launch-ready state:

```bash
git status --short
node --version
agentlocks --version
agentlocks init --check --harness codex --json || true
agentlocks init --check --harness claude-code --json || true
```

Expected constraints:

- Node is `>=22.18`.
- `agentlocks` comes from the packed/global install path, not an unbuilt checkout.
- Any init drift is intentional and has been committed before recording.

## Shot List

### Shot 1: Install Proof

Use a short terminal segment or static caption:

```bash
npm install -g agentlocks
agentlocks --help
```

Do not dwell on install. The collision is the demo.

### Shot 2: Codex Acquires

Left pane:

```bash
lock=$(agentlocks acquire src/auth.ts --reason "Codex refactors login flow" --id-only)
printf '%s\n' "$lock"
```

If `src/auth.ts` does not exist in the final repo, create a disposable demo repo outside this
checkout or use a real small file that is safe to lock. Do not edit source just for the recording.

### Shot 3: Claude Code Collides

Right pane:

```bash
agentlocks acquire src/auth.ts --reason "Claude reviews same login file"
```

Expected visual point:

- output starts with `lock conflict: src/auth.ts`;
- output names the holder and reason;
- output includes a `next:` command.

### Shot 4: Release And Proceed

Left pane:

```bash
agentlocks release "$lock" --id-only
```

Right pane:

```bash
agentlocks acquire src/auth.ts --reason "Claude continues after release" --id-only
```

The viewer should understand that the second agent did not lose work; it received coordination.

## Optional Commit-Handoff Shot

Use only if it stays visually simple:

```bash
file_lock=$(agentlocks acquire README.md --reason "demo commit handoff" --id-only)
{ read git_lock; read git_token; } < <(agentlocks git begin --refresh-lock "$file_lock" --reason "demo staging" --id-only)
agentlocks git end "$git_lock" --git-token "$git_token" --release-lock "$file_lock" --id-only
```

If this takes more than 5 seconds to explain, leave it out of the GIF and keep it in the README
reference section.

## README Embed Copy

Short caption:

> Two agents, one worktree. The second overlapping `acquire` gets the blocking owner, reason, and
> next command instead of silently clobbering the first.

Alt text:

> Terminal demo showing Codex acquiring a file lock and Claude Code receiving an Agentlocks conflict
> message for the same file in one shared Git worktree.

## Verification Checklist

- `bun run check` is green after any demo-related repo changes.
- The recorded command transcript matches the current README.
- The demo never says Agentlocks blocks non-participating tools.
- The conflict output is readable at 1280px width.
- The clip still makes sense with audio muted.
