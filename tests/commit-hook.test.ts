import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  CLAUDE_AGENT_ENV_HOOK_BODY,
  CLAUDE_COMMIT_HOOK_BODY,
  CODEX_COMMIT_HOOK_BODY,
  renderClaudeCommitHookScript,
  renderCodexCommitHookScript,
} from "../src/cli/commit-hook-script";
import { CODEX_COMMIT_HOOK_SCRIPT_PATH, runInit } from "../src/index";

// ---------------------------------------------------------------------------
// F5 commit-hook GENERATOR unit tests (GIT_HOOK_SPEC §8 items 15-21 + 14a/16a/20a).
//
// These exercise the generated hook-script *source text* and the `runInit`
// dispatch directly. They do NOT spin up a live git repo or spawn the hooks —
// the shared commit-detection / form-parsing JS is extracted out of the emitted
// script body and evaluated in-process so the *shipped* logic is what runs.
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);

type CommitForm = {
  includeUnstaged: boolean;
  pathspecMode: "only" | "include" | null;
  pathspecs: string[];
  effectiveCwd: string;
  note: string | null;
};

type SharedVerifyLogic = {
  lockpickIsGitCommit: (command: unknown) => boolean;
  lockpickParseCommitForm: (command: string, toolCwd: string) => CommitForm | null;
};

// The detector / form-parser live as emitted JS inside SHARED_VERIFY_LOGIC, not
// as exported TS. Slice that block out of the generated Claude body (the single
// source of truth) and eval it so the assertions run against the actual shipped
// source, byte-for-byte. `require` is injected because the emitted script wires
// its own `createRequire` and lockpickParseCommitForm calls `require("node:path")`.
function loadSharedVerifyLogic(): SharedVerifyLogic {
  const marker = "function lockpickTokenizeSegments(command) {";
  const index = CLAUDE_COMMIT_HOOK_BODY.indexOf(marker);
  if (index === -1) {
    throw new Error("SHARED_VERIFY_LOGIC marker not found in CLAUDE_COMMIT_HOOK_BODY");
  }
  const source = CLAUDE_COMMIT_HOOK_BODY.slice(index);
  const factory = new Function(
    "require",
    `${source}\nreturn { lockpickIsGitCommit, lockpickParseCommitForm };`,
  );
  return factory(require) as SharedVerifyLogic;
}

const { lockpickIsGitCommit, lockpickParseCommitForm } = loadSharedVerifyLogic();

describe("merged Claude commit-hook body", () => {
  test("renderClaudeCommitHookScript returns the merged (verify-enabled) body", () => {
    expect(renderClaudeCommitHookScript()).toBe(CLAUDE_COMMIT_HOOK_BODY);
  });

  test("merged body carries the git-commit detection + verify branch", () => {
    const body = renderClaudeCommitHookScript();
    // Commit detection + the verify branch (with the §3.5a effective-set wiring).
    expect(body).toContain("lockpickIsGitCommit");
    expect(body).toContain("lockpickParseCommitForm");
    expect(body).toContain("lockpickRunVerify");
    expect(body).toContain("lockpickBuildAdvice");
    // The verify spawn emits the argv `["git", "verify", "--json"]` (the binary
    // is `lockpick`, the subcommand args are separate tokens — not a literal
    // "git verify" string).
    expect(body).toContain('"git", "verify", "--json"');
    expect(body).toContain('spawnSync("lockpick"');
    // The verify spawn carries the scoped owner id (GIT_HOOK_SPEC §4.2 / finding #3).
    expect(body).toContain("LOCKPICK_HARNESS_AGENT_ID");
    // Advisory only: allows, never denies (GIT_HOOK_SPEC §4.1 step 6).
    expect(body).toContain('"allow"');
    expect(body).not.toContain('"deny"');
    // Still injects the scoped agent id for lockpick commands.
    expect(body).toContain("invokesLockpick");
  });

  test("merged body detects git commit BEFORE the invokesLockpick early-exit (finding #4)", () => {
    const body = renderClaudeCommitHookScript();
    const verifyBranch = body.indexOf("if (lockpickIsGitCommit(command))");
    const injectionGate = body.indexOf("if (!invokesLockpick(command)) process.exit(0)");
    expect(verifyBranch).toBeGreaterThan(-1);
    expect(injectionGate).toBeGreaterThan(-1);
    // The verify branch must run first so a raw `git commit` is not fast-exited.
    expect(verifyBranch).toBeLessThan(injectionGate);
  });

  test("WITHOUT --commit-hook the body is the id-injection-only form (verify branch absent)", () => {
    // The id-injection-only body is byte-stable and carries no verify logic.
    expect(CLAUDE_AGENT_ENV_HOOK_BODY).not.toContain("lockpickIsGitCommit");
    expect(CLAUDE_AGENT_ENV_HOOK_BODY).not.toContain("git verify");
    expect(CLAUDE_AGENT_ENV_HOOK_BODY).not.toContain("lockpickParseCommitForm");
    // It still injects the scoped agent id.
    expect(CLAUDE_AGENT_ENV_HOOK_BODY).toContain("invokesLockpick");
    expect(CLAUDE_AGENT_ENV_HOOK_BODY).toContain("LOCKPICK_HARNESS_AGENT_ID");
    // The merged body strictly extends it (it is genuinely different text).
    expect(renderClaudeCommitHookScript()).not.toBe(CLAUDE_AGENT_ENV_HOOK_BODY);
  });
});

describe("Codex commit-hook body", () => {
  test("renderCodexCommitHookScript returns the verify-only twin", () => {
    expect(renderCodexCommitHookScript()).toBe(CODEX_COMMIT_HOOK_BODY);
  });

  test("Codex twin carries detection + verify and stays advisory-only", () => {
    const body = renderCodexCommitHookScript();
    expect(body).toContain("lockpickIsGitCommit");
    expect(body).toContain("lockpickParseCommitForm");
    expect(body).toContain("lockpickRunVerify");
    expect(body).toContain('"git", "verify", "--json"');
    expect(body).toContain('"allow"');
    expect(body).not.toContain('"deny"');
    // Codex reads its own command/cwd shape and resolves identity from the
    // inherited ambient CODEX_THREAD_ID, so it computes NO scoped owner id and
    // runs verify with an empty harness id (the shared `lockpickRunVerify` helper
    // still references the env key, but Codex never passes a value into it —
    // contrast the Claude body, which passes the computed `ownerId`).
    expect(body).toContain("lockpickExtractCommand");
    expect(body).toContain("lockpickExtractCwd");
    expect(body).toContain('lockpickRunVerify(form, "")');
    expect(body).not.toContain("ownerId");
    // The Claude merged body, by contrast, threads the scoped owner id in.
    expect(CLAUDE_COMMIT_HOOK_BODY).toContain("lockpickRunVerify(form, ownerId)");
  });
});

describe("commit-detection (GIT_HOOK_SPEC §8 item 16)", () => {
  test("matches git commit and tolerated prefixes", () => {
    expect(lockpickIsGitCommit("git commit")).toBe(true);
    expect(lockpickIsGitCommit("git commit -m 'wip'")).toBe(true);
    // Top-level -c / -C / --git-dir flags between `git` and `commit`.
    expect(lockpickIsGitCommit("git -c user.name=x commit -m y")).toBe(true);
    expect(lockpickIsGitCommit("git -C packages/app commit -- a.ts")).toBe(true);
    // env-var prefix.
    expect(lockpickIsGitCommit("env FOO=1 git commit")).toBe(true);
    expect(lockpickIsGitCommit("GIT_AUTHOR_NAME=x git commit -m y")).toBe(true);
    // Chained with && / ; / |.
    expect(lockpickIsGitCommit("cd sub && git commit")).toBe(true);
    expect(lockpickIsGitCommit("git add . && git commit -m y")).toBe(true);
    expect(lockpickIsGitCommit("true; git commit")).toBe(true);
  });

  test("does NOT match lockpick commit, near-misses, or quoted occurrences", () => {
    // Different binary (§5) — must fast-exit so there is no double-fire.
    expect(lockpickIsGitCommit("lockpick commit")).toBe(false);
    expect(lockpickIsGitCommit("lockpick commit --reason wip")).toBe(false);
    // Near-miss subcommand token.
    expect(lockpickIsGitCommit("git committer-noop")).toBe(false);
    // `git commit` only inside a quoted string is not a real invocation.
    expect(lockpickIsGitCommit("echo 'git commit'")).toBe(false);
    expect(lockpickIsGitCommit('echo "git commit"')).toBe(false);
    // No commit at all.
    expect(lockpickIsGitCommit("git status")).toBe(false);
    expect(lockpickIsGitCommit("ls -la")).toBe(false);
    // Non-string / no "commit" substring fast path.
    expect(lockpickIsGitCommit(undefined)).toBe(false);
    expect(lockpickIsGitCommit(123)).toBe(false);
  });
});

describe("commit-form parsing (GIT_HOOK_SPEC §3.5a, §8 item 14a/16a)", () => {
  test("plain commit → index only (no include-unstaged, no pathspec)", () => {
    const form = lockpickParseCommitForm("git commit -m wip", "/repo");
    expect(form).not.toBeNull();
    expect(form?.includeUnstaged).toBe(false);
    expect(form?.pathspecMode).toBeNull();
    expect(form?.pathspecs).toEqual([]);
    expect(form?.effectiveCwd).toBe("/repo");
    expect(form?.note).toBeNull();
  });

  test("commit -a / -am / --all → --include-unstaged", () => {
    for (const command of [
      "git commit -a -m wip",
      "git commit -am wip",
      "git commit --all -m wip",
    ]) {
      const form = lockpickParseCommitForm(command, "/repo");
      expect(form?.includeUnstaged).toBe(true);
      expect(form?.pathspecMode).toBeNull();
    }
  });

  test("bare pathspec / --only → --pathspec-mode only", () => {
    const bare = lockpickParseCommitForm("git commit -- a.ts b.ts", "/repo");
    expect(bare?.pathspecMode).toBe("only");
    expect(bare?.pathspecs).toEqual(["a.ts", "b.ts"]);

    const only = lockpickParseCommitForm("git commit --only a.ts", "/repo");
    expect(only?.pathspecMode).toBe("only");
    expect(only?.pathspecs).toEqual(["a.ts"]);
  });

  test("--include → --pathspec-mode include (index ∪ pathspec, finding #1)", () => {
    const form = lockpickParseCommitForm("git commit --include a.ts", "/repo");
    expect(form?.pathspecMode).toBe("include");
    expect(form?.pathspecs).toEqual(["a.ts"]);
  });

  test("effective cwd: cd <dir> && git commit --include <p> resolves under <dir> (item 16a)", () => {
    const form = lockpickParseCommitForm("cd packages/app && git commit --include a.ts", "/repo");
    expect(form?.pathspecMode).toBe("include");
    expect(form?.pathspecs).toEqual(["a.ts"]);
    // pathspec `a.ts` resolves to packages/app/a.ts, not root a.ts.
    expect(form?.effectiveCwd).toBe(path.resolve("/repo", "packages/app"));
    expect(form?.note).toBeNull();
  });

  test("effective cwd: git -C <dir> commit -- <p> resolves under <dir> (item 16a)", () => {
    const form = lockpickParseCommitForm("git -C packages/app commit -- a.ts", "/repo");
    expect(form?.pathspecMode).toBe("only");
    expect(form?.pathspecs).toEqual(["a.ts"]);
    expect(form?.effectiveCwd).toBe(path.resolve("/repo", "packages/app"));
  });

  test('unparseable cwd (cd "$VAR") → best-effort note, drops the pathspec claim (item 16a)', () => {
    const form = lockpickParseCommitForm('cd "$VAR" && git commit a.ts', "/repo");
    expect(form).not.toBeNull();
    // No false coverage claim: the pathspec mode is dropped and cwd falls back.
    expect(form?.pathspecMode).toBeNull();
    expect(form?.pathspecs).toEqual([]);
    expect(form?.effectiveCwd).toBe("/repo");
    expect(form?.note).toBeTruthy();
    expect(form?.note).toContain("a.ts");
  });

  test("a non-commit command parses to null", () => {
    expect(lockpickParseCommitForm("git status", "/repo")).toBeNull();
    expect(lockpickParseCommitForm("lockpick commit", "/repo")).toBeNull();
  });
});

describe("runInit --commit-hook dispatch (GIT_HOOK_SPEC §8 item 20 / 20a)", () => {
  test("claude-code upserts the merged script under the single existing Bash handler (no second handler)", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      const result = await runInit({ root: workspace, harness: "claude-code", commitHook: true });
      expect(result.resolvedHarness).toBe("claude-code");

      const settings = JSON.parse(
        await readFile(path.join(workspace, ".claude/settings.json"), "utf8"),
      ) as { hooks?: { PreToolUse?: Array<{ matcher?: unknown; hooks?: unknown[] }> } };
      const preToolUse = settings.hooks?.PreToolUse ?? [];
      // Exactly one PreToolUse group, exactly one Bash handler — NOT a second one.
      expect(preToolUse.length).toBe(1);
      expect(preToolUse[0]?.matcher).toBe("Bash");
      expect(preToolUse[0]?.hooks?.length).toBe(1);
      expect(preToolUse[0]?.hooks).toEqual([
        {
          type: "command",
          command: "node",
          args: ["$" + "{CLAUDE_PROJECT_DIR}/.claude/hooks/lockpick-agent-env.mjs"],
        },
      ]);

      // The single script body is the merged (verify-enabled) body.
      const hookBody = await readFile(
        path.join(workspace, ".claude/hooks/lockpick-agent-env.mjs"),
        "utf8",
      );
      expect(hookBody).toBe(renderClaudeCommitHookScript());
      expect(hookBody).toContain("lockpickIsGitCommit");
    });
  });

  test("claude-code WITHOUT --commit-hook writes the id-injection-only body", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      await runInit({ root: workspace, harness: "claude-code" });

      const hookBody = await readFile(
        path.join(workspace, ".claude/hooks/lockpick-agent-env.mjs"),
        "utf8",
      );
      expect(hookBody).toBe(CLAUDE_AGENT_ENV_HOOK_BODY);
      expect(hookBody).not.toContain("lockpickIsGitCommit");
    });
  });

  test("--harness codex writes the .codex/ PreToolUse entry, twin script, and trust note", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      const result = await runInit({ root: workspace, harness: "codex", commitHook: true });
      expect(result.resolvedHarness).toBe("codex");

      // .codex/hooks.json — PreToolUse matcher "^Bash$" with a git-root-stable command.
      const hooks = JSON.parse(
        await readFile(path.join(workspace, ".codex/hooks.json"), "utf8"),
      ) as {
        hooks?: {
          PreToolUse?: Array<{
            matcher?: unknown;
            hooks?: Array<{ type?: unknown; command?: unknown; timeout?: unknown }>;
          }>;
        };
      };
      const group = hooks.hooks?.PreToolUse?.[0];
      expect(group?.matcher).toBe("^Bash$");
      const handler = group?.hooks?.[0];
      expect(handler?.type).toBe("command");
      expect(handler?.timeout).toBe(30);
      // Command resolves the script via `git rev-parse --show-toplevel` (item 20a).
      expect(handler?.command).toContain("git rev-parse --show-toplevel");
      expect(handler?.command).toContain(".codex/hooks/lockpick-git-verify.mjs");

      // The twin verify script is written and matches the generator.
      const scriptBody = await readFile(
        path.join(workspace, CODEX_COMMIT_HOOK_SCRIPT_PATH),
        "utf8",
      );
      expect(scriptBody).toBe(renderCodexCommitHookScript());

      // The Codex project-trust note is surfaced as a `reported` change on install.
      const reported = result.changes.find(
        (change) => change.path === ".codex/hooks.json" && change.action === "reported",
      );
      expect(reported).toBeDefined();
      expect(reported?.message.toLowerCase()).toContain("trust");

      // No Claude artifacts on the codex path.
      await expect(
        readFile(path.join(workspace, ".claude/hooks/lockpick-agent-env.mjs"), "utf8"),
      ).rejects.toThrow();
    });
  });

  test("codex --commit-hook is idempotent (byte-match no-op on re-run)", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      await runInit({ root: workspace, harness: "codex", commitHook: true });
      const rerun = await runInit({ root: workspace, harness: "codex", commitHook: true });

      const codexChanges = rerun.changes.filter((change) => change.path.startsWith(".codex"));
      // Both .codex files are unchanged; only the advisory trust note remains.
      const actions = codexChanges.filter((change) => change.action !== "reported");
      expect(actions.length).toBe(2);
      expect(actions.every((change) => change.action === "unchanged")).toBe(true);
    });
  });

  test("codex init --check reports drift and writes nothing", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      const result = await runInit({
        root: workspace,
        harness: "codex",
        commitHook: true,
        check: true,
      });
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);

      const codexChanges = result.changes.filter((change) => change.path.startsWith(".codex"));
      expect(codexChanges.length).toBeGreaterThan(0);
      expect(codexChanges.every((change) => change.action === "would_create")).toBe(true);
      // --check is a pure no-op: the trust note (a `reported` write-time change) is
      // suppressed, and nothing is written to disk.
      expect(codexChanges.some((change) => change.action === "reported")).toBe(false);
      await expect(
        readFile(path.join(workspace, CODEX_COMMIT_HOOK_SCRIPT_PATH), "utf8"),
      ).rejects.toThrow();
      await expect(readFile(path.join(workspace, ".codex/hooks.json"), "utf8")).rejects.toThrow();
    });
  });

  test("codex init --check is a clean no-op once the .codex files are current", async () => {
    await withWorkspace(async (workspace) => {
      await writeFile(path.join(workspace, "package.json"), '{"scripts":{}}\n', "utf8");

      await runInit({ root: workspace, harness: "codex", commitHook: true });
      const check = await runInit({
        root: workspace,
        harness: "codex",
        commitHook: true,
        check: true,
      });

      const codexChanges = check.changes.filter((change) => change.path.startsWith(".codex"));
      // No drift surfaced for the .codex files (the trust note is install-only).
      expect(codexChanges.every((change) => change.action === "unchanged")).toBe(true);
    });
  });
});

async function withWorkspace(fn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "lockpick-commit-hook-"));
  try {
    await fn(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
