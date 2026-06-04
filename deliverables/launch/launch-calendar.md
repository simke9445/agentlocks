# Launch Calendar

Status: draft. Dates are relative to `T`, the public launch day. Do not set `T` until Phase 2,
Phase 3, README, and latest npm install verification are green.

## T-7 To T-5

- Freeze the launch hook and "why not worktrees" answer.
- Finish the collision GIF or asciinema.
- Verify `npm install -g agentlocks` from the latest published package on a clean machine.
- Run `bun run check`.
- Check GitHub community profile gaps and decide which trust files to add before launch.
- Shortlist 20 credible early reviewers/reposters.

## T-4 To T-3

- Merge README top-fold update with demo media.
- Confirm GitHub social preview image is uploaded in repo settings.
- Prepare Show HN title, first comment, and reply snippets.
- Prepare X thread and one or two community-specific posts.
- Verify npm README rendering.
- Re-run `gh repo view`, traffic, and npm download baseline.

## T-2

- Send private preview to 3 to 5 skeptical developers.
- Ask only:
  1. What does this do?
  2. Why would you use it instead of worktrees?
  3. What claim sounds suspicious?
- Patch README/FAQ based on repeated confusion.
- Re-run checks after patches.

## T-1

- Final dry run:

```bash
npm install -g agentlocks@latest
agentlocks --version
agentlocks init --check --json || true
agentlocks acquire README.md --reason "launch dry run" --id-only
bun run check
```

- Confirm no launch copy claims hard enforcement.
- Confirm the maintainer has several hours free for replies.

## T

Suggested order:

1. Post Show HN.
2. Immediately post the prepared first comment.
3. Post X thread with demo media.
4. Share in one highly relevant community, not everywhere at once.
5. Watch comments for correctness objections.
6. Patch README/FAQ the same day if repeated confusion appears.

## T+1 To T+7

- Record daily stars, GitHub traffic, npm downloads, referrers, issues, and repeated objections.
- Reply to serious questions with limitations first.
- Open small, visible fixes for real confusion.
- Submit awesome-list PRs only after the repo has enough signal to look useful rather than spammy.
- Re-run Socket, OpenSSF Scorecard, and community profile after trust workflows land.

## Hard No-Go Conditions

- `bun run check` is red.
- The npm package cannot be installed cleanly.
- Demo media is missing or unreadable.
- README top fold still requires long explanation.
- The advisory limitation story sounds like hard enforcement.
- The maintainer cannot be present for launch replies.
