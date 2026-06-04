# Adjacent Builder Notes

Status: draft. These notes are not outreach approval. Use them only after the maintainer approves
the target, channel, timing, and exact wording.

The goal is to invite specific critique from adjacent builders, not to promote in their issue
trackers. Prefer a public discussion/issue only when Agentlocks can improve a concrete workflow for
that project. Otherwise keep the target as `target` and wait for a natural launch thread.

Status values:

- `target`: identified, no contact.
- `contacted`: maintainer-approved contact sent.
- `replied`: maintainer replied.
- `tested`: target or maintainer tested a workflow.
- `mentioned`: target publicly mentioned Agentlocks.
- `declined`: not interested or out of scope.

## Opening

Rewrite this per recipient. Do not send it verbatim.

```text
I build agent tooling and wanted sharp feedback from someone working the same space.
Agentlocks is a local advisory locking CLI for cooperative agents sharing one Git worktree:
https://github.com/simke9445/agentlocks

The narrow claim: participating agents can acquire path locks, see who owns a conflict, and
coordinate staging/commit with an `@git/index` lock. It does not hard-block editors, shells, or Git.
Feedback on where that boundary breaks would be most useful.
```

## Target Notes

| Status | Target | Draft note |
| --- | --- | --- |
| target | `johannesjo/parallel-code` | Your project is the strongest "one worktree per agent" comparison point. I would value criticism of Agentlocks' opposite mode: when agents intentionally share one worktree because generated state, one live branch, or fast handoff matters more than isolation. |
| target | `wshobson/agents` | Agentlocks may fit as a cross-harness workflow utility rather than a plugin marketplace item. The useful question is whether a local path-lock command contract is worth listing for Claude Code/Codex/Cursor/OpenCode users. |
| target | `mksglu/context-mode` | Context-mode reduces tool-output/context pressure. Agentlocks targets a different failure mode: filesystem ownership and commit handoff between cooperating agents. I would value feedback on whether those two controls belong in the same operator workflow. |
| target | `standardagents/dmux` | dmux handles agent multiplexing around worktrees. Agentlocks is only for the cases where sessions intentionally converge on one worktree. The useful critique is whether that mode is common enough to warrant a coordination primitive. |
| target | `Ataraxy-Labs/weave` | Weave resolves merge conflicts after independent agents edit the same files. Agentlocks helps participating agents avoid colliding earlier. I would value a correction if that framing misrepresents the boundary. |
| target | `Ataraxy-Labs/opensessions` | opensessions gives live session visibility. Agentlocks could add file/Git-index ownership state to that mental model. The question is whether lock state is useful enough to surface in session tooling. |
| target | `pchalasani/claude-code-tools` | This looks like the right audience for practical Claude Code/Codex CLI workflow tools. Agentlocks is a small advisory file-lock CLI; feedback on install friction and category fit would be useful. |
| target | `maxritter/pilot-shell` | pilot-shell emphasizes production-ready agent workflow. Agentlocks adds one discipline: agents claim files and the Git index before edits/commits. I would value a critique of whether that belongs in enforced TDD/quality workflows. |
| target | `golutra/golutra` | Golutra orchestrates multiple CLI agents. Agentlocks could be a simple external coordination contract for local parallel execution. I am looking for whether the CLI surface is too low-level for orchestrators. |
| target | `generalaction/emdash` | Emdash is a broader agentic development environment. Agentlocks is narrower: path ownership and commit handoff in one shared worktree. Feedback on whether this should be a primitive or just internal state would be valuable. |
| target | `ogulcancelik/herdr` | herdr multiplexes terminal agents. Agentlocks may complement that with path-level ownership before edits. I would value feedback on whether this should be surfaced as user-visible state. |
| target | `ComposioHQ/agent-orchestrator` | Agentlocks could be one small external coordination primitive for orchestrators that spawn local coding agents. The important boundary: it is advisory and local, not a replacement for orchestration. |
| target | `slopus/happy` | Happy controls Codex and Claude Code from mobile/web. Agentlocks may be relevant only if remote sessions share one local repo. I would value feedback on whether lock conflicts should be visible to remote-control clients. |
| target | `liaohch3/claude-tap` | Claude Tap inspects agent API traffic. Agentlocks adds an observable filesystem contract outside the API stream. The question is whether path locks belong in traces or dashboards for agent debugging. |
| target | `codeaholicguy/ai-devkit` | ai-devkit is about repeatable engineering workflows across agents. Agentlocks is a repeatable file/Git-index coordination step. I would value criticism of whether the workflow burden is worth it. |
| target | `dohooo/helmor` | Helmor is a local multi-agent workbench. Agentlocks could be useful if multiple agents operate in one worktree. Feedback on whether this should be integrated, documented, or ignored would be useful. |
| target | `milisp/codexia` | Codexia already spans Codex CLI, Claude Code, worktrees, scheduler, and remote control. Agentlocks is relevant only for the shared-worktree mode. I would value feedback on that boundary. |
| target | `jazzyalex/agent-sessions` | agent-sessions tracks sessions across Codex, Claude Code, and other agents. Agentlocks could provide lock-state context for "what is this session touching?" I would value UI/workflow feedback, not promotion. |
| target | `paperboytm/spool` | spool is a local AI session library. Agentlocks can produce collision evidence and lock ownership history. I would value feedback on whether that is useful session metadata. |
| target | `sipyourdrink-ltd/bernstein` | Bernstein is audit-grade multi-agent orchestration. Agentlocks is much smaller, but its lock records may be audit-friendly ownership artifacts. I would value critique of whether the records are sufficient or too informal. |
| target | `ChesterRa/cccc` | cccc coordinates coding agents with read receipts, delivery tracking, and remote ops. Agentlocks may complement that with path-level ownership and Git-index handoff for agents working in one checkout. |

## Send Rules

- Tailor each note to the project and remove anything that sounds like a template.
- Do not contact all targets at once.
- Send at most 2-3 notes per day; vary sentence structure so two maintainers who follow each other
  never see near-identical phrasing.
- Stop-loss: if the first 5 contacted targets go silent or decline, pause outreach and revisit
  positioning before sending more.
- Do not mention 10,000 stars.
- Do not ask for public amplification unless they independently like the project.
- If feedback identifies a repeated objection, update README/FAQ before broader launch.
