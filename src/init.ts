import path from "node:path";
import {
  CLAUDE_AGENT_ENV_HOOK_BODY,
  renderClaudeCommitHookScript,
  renderCodexCommitHookScript,
} from "./cli/commit-hook-script";

export {
  renderClaudeCommitHookScript,
  renderCodexCommitHookScript,
} from "./cli/commit-hook-script";

import {
  DEFAULT_CONFIG_FILE,
  findHostRoot,
  loadAgentlocksConfig,
  type ResolvedAgentlocksConfig,
  renderAgentlocksCommand,
} from "./config";
import { ensureDir, pathExists, readText, writeText } from "./io";
import { formatJsonArtifact } from "./json";

export const AGENTLOCKS_AGENTS_START = "<!-- agentlocks:start -->";
export const AGENTLOCKS_AGENTS_END = "<!-- agentlocks:end -->";

export interface InitOptions {
  root?: string;
  cwd?: string;
  check?: boolean;
  harness?: InitHarness;
  commitHook?: boolean;
}

export type InitHarness = "auto" | "codex" | "claude-code";

export type InitAction =
  | "created"
  | "updated"
  | "unchanged"
  | "exists"
  | "would_create"
  | "would_update"
  | "reported";

export interface InitChange {
  path: string;
  action: InitAction;
  message: string;
}

export interface InitResult {
  ok: boolean;
  exitCode: number;
  root: string;
  harness: InitHarness;
  resolvedHarness: Exclude<InitHarness, "auto">;
  instructionsPath: string;
  changes: InitChange[];
}

// Agentlocks instructions always live in AGENTS.md. Claude Code and Codex both
// read it, so there is no harness-specific instructions file; the harness only
// selects which hook scripts are installed below.
const AGENTS_INSTRUCTIONS_PATH = "AGENTS.md";

export const CLAUDE_AGENTLOCKS_AGENT_HOOK_PATH = ".claude/hooks/agentlocks-agent-env.mjs";
const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
const CLAUDE_HOOK_SCRIPT_REFERENCE =
  "$" + "{CLAUDE_PROJECT_DIR}/.claude/hooks/agentlocks-agent-env.mjs";
const CLAUDE_HOOK_COMMAND = "node";
// The default (id-injection-only) Claude hook body lives in commit-hook-script.ts
// as the single source of truth; the merged commit-hook body extends it there.
const CLAUDE_AGENTLOCKS_AGENT_HOOK_SCRIPT = CLAUDE_AGENT_ENV_HOOK_BODY;

export const CODEX_COMMIT_HOOK_SCRIPT_PATH = ".codex/hooks/agentlocks-git-verify.mjs";
const CODEX_HOOKS_CONFIG_PATH = ".codex/hooks.json";
const CODEX_HOOK_MATCHER = "^Bash$";
const CODEX_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.codex/hooks/agentlocks-git-verify.mjs"';
const CODEX_HOOK_TIMEOUT = 30;
const CODEX_TRUST_NOTE =
  "Codex project-local hooks are inert until you trust this project (Codex prints a startup " +
  "warning; confirm via /hooks). The verify backstop will not run until trusted.";

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const root = path.resolve(options.root ?? (await findHostRoot(options.cwd ?? process.cwd())));
  const check = Boolean(options.check);
  const harness = options.harness ?? "auto";
  const resolvedHarness = resolveInitHarness(harness, process.env);
  const commitHook = Boolean(options.commitHook);
  const config = await loadAgentlocksConfig({ root });
  const changes: InitChange[] = [];

  changes.push(await ensureLockDirectories(config, check));
  changes.push(await ensureConfigFile(config, check));

  if (config.init.updateAgents) {
    changes.push(await ensureAgentsInstructions(config, check));
  }
  if (resolvedHarness === "claude-code") {
    changes.push(await ensureClaudeHookScript(config, check, commitHook));
    changes.push(await ensureClaudeSettings(config, check));
  }
  if (commitHook && resolvedHarness === "codex") {
    changes.push(...(await ensureCodexCommitHook(config, check)));
  }
  if (config.init.updateGitignore) {
    changes.push(await ensureGitignore(config, check));
  }

  const checkFailed =
    check &&
    changes.some((change) => ["would_create", "would_update", "reported"].includes(change.action));
  return {
    ok: !checkFailed,
    exitCode: checkFailed ? 1 : 0,
    root,
    harness,
    resolvedHarness,
    instructionsPath: AGENTS_INSTRUCTIONS_PATH,
    changes,
  };
}

export function renderClaudeAgentlocksAgentHookScript(): string {
  return CLAUDE_AGENTLOCKS_AGENT_HOOK_SCRIPT;
}

export function resolveInitHarness(
  harness: InitHarness,
  env: NodeJS.ProcessEnv = process.env,
): Exclude<InitHarness, "auto"> {
  if (harness !== "auto") return harness;
  const claudeSession = env.CLAUDE_CODE_SESSION_ID?.trim();
  const codexThread = env.CODEX_THREAD_ID?.trim();
  if (claudeSession && !codexThread) return "claude-code";
  return "codex";
}

export function renderInitResult(result: InitResult): string {
  const lines = [
    result.ok ? "agentlocks init: ok" : "agentlocks init: changes needed",
    `root: ${result.root}`,
  ];
  for (const change of result.changes) {
    lines.push(`${change.action}: ${change.path} - ${change.message}`);
  }
  return lines.join("\n");
}

export function agentlocksAgentsSnippet(config: ResolvedAgentlocksConfig): string {
  const acquire = renderAgentlocksCommand(config, [
    "acquire",
    "<paths...>",
    "--reason",
    "<intent>",
  ]);
  const expand = renderAgentlocksCommand(config, ["expand", "--lock", "<lock_id>", "<paths...>"]);
  const refresh = renderAgentlocksCommand(config, ["refresh", "<lock_id>"]);
  const commit = renderAgentlocksCommand(config, [
    "commit",
    "<paths...>",
    "--reason",
    "<commit intent>",
    "-m",
    "<message>",
  ]);
  const gitBegin = renderAgentlocksCommand(config, [
    "git",
    "begin",
    "--refresh-lock",
    "<lock_id>",
    "--reason",
    "<commit intent>",
  ]);
  const gitEnd = renderAgentlocksCommand(config, [
    "git",
    "end",
    "<git_lock_id>",
    "--git-token",
    "<git_token>",
    "--release-lock",
    "<lock_id>",
  ]);
  return [
    AGENTLOCKS_AGENTS_START,
    `## ${config.agents.heading}`,
    "",
    "This repository uses Agentlocks advisory locks for multi-agent editing.",
    "",
    "- Acquire exact file locks before editing, creating, deleting, renaming, formatting, or bulk-rewriting repository files.",
    `- Use \`${acquire}\` and keep requested paths narrow. Prefer exact paths over globs.`,
    `- Expand before touching newly needed files with \`${expand}\`; do not edit outside the held lock set.`,
    `- Refresh before edit batches and after long tests with \`${refresh}\`.`,
    "- **To commit, prefer the one-command path:**",
    `  \`${commit}\`. It locks the paths and the shared Git index, stages and commits only those paths`,
    "  (pathspec-scoped), fences the index against a reclaimed lease, and releases, with no lock ids to thread.",
    "  Add `--keep` to retain the file lock for follow-up edits.",
    `- Only if you must drive \`git\` yourself: \`${gitBegin}\` (it prints the git lock id then a fence token),`,
    "  stage only paths covered by your held locks, `git commit`, then",
    `  \`${gitEnd}\`. The \`--git-token\` aborts the release if the index lease was reclaimed mid-commit.`,
    "- Release promptly after commit or handoff with `agentlocks release <lock_id>` (or `agentlocks release --mine`).",
    AGENTLOCKS_AGENTS_END,
  ].join("\n");
}

function agentlocksConfigTemplate(projectName: string): string {
  return `// Agentlocks configuration. Every key is optional; omitted keys use the defaults shown, and the
// values are validated on load with an actionable error on a bad key or wrong type. For editor
// autocomplete, add agentlocks as a dev dependency and append "satisfies AgentlocksConfig".

export default {
  // Display name used in the generated AGENTS.md instructions. Defaults to the repo directory name.
  projectName: ${JSON.stringify(projectName)},

  // Local lock-state root: active records under active/, events in events.jsonl, mutex as a .mutex dir.
  lockRoot: ".agentlocks/locks",

  command: {
    // Command rendered into the generated AGENTS.md instructions.
    executable: "agentlocks",
  },

  defaults: {
    // Default lease length (ms) for new locks and refreshes.
    ttlMs: 600_000,

    // Upper bound (ms) accepted by --ttl-ms.
    maxTtlMs: 1_800_000,

    // Grace (ms) after expiry when liveness can't be proven. Short, so a dead, un-probeable lock
    // reclaims soon after its lease lapses. May be 0.
    unknownLivenessGraceMs: 90_000,

    // When true, acquire takes over a conflict whose overlapping locks are all reclaimable, in one
    // command (the acquire --reclaim flag always does this).
    autoReclaimOnConflict: false,

    // When true, an agent's own acquire/expand/refresh extends its other held leases.
    keepAliveOnMutation: true,
  },

  owner: {
    // Fallback id lookup for unsupported harnesses. Codex and Claude Code are detected automatically.
    envKeys: ["AGENTLOCKS_AGENT_ID"],

    // Runtime harnesses checked first.
    harnesses: ["codex", "claude-code"],

    // Generic fallback prefix when no harness, explicit id, or env id is available.
    fallbackPrefix: "agentlocks",
  },

  liveness: {
    // "auto" probes by the owner's harness (Codex session index / Claude Code transcript), falling
    // back to the grace window. "unknown" disables probing; "codex"/"claude-code" force one adapter.
    adapter: "auto",
  },
};
`;
}

async function ensureLockDirectories(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const activeDir = path.join(config.lockRoot, "active");
  if (await pathExists(activeDir)) {
    return change(config.lockRootRelative, "unchanged", "lock directory exists");
  }
  if (!check) await ensureDir(activeDir);
  return change(
    config.lockRootRelative,
    check ? "would_create" : "created",
    "lock directory is required",
  );
}

async function ensureConfigFile(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const relative = path.relative(config.root, config.configPath) || DEFAULT_CONFIG_FILE;
  if (await pathExists(config.configPath)) {
    return change(relative, "exists", "existing config preserved");
  }
  if (!check) await writeText(config.configPath, agentlocksConfigTemplate(config.projectName));
  return change(relative, check ? "would_create" : "created", "default config is required");
}

async function ensureAgentsInstructions(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const agentsPath = path.join(config.root, AGENTS_INSTRUCTIONS_PATH);
  const relative = AGENTS_INSTRUCTIONS_PATH;
  const snippet = agentlocksAgentsSnippet(config);
  const exists = await pathExists(agentsPath);
  const current = exists ? await readText(agentsPath) : "";
  const next = upsertMarkedBlock(current, snippet);
  if (exists && current === next) return change(relative, "unchanged", "instructions are current");
  if (!check) await writeText(agentsPath, next);
  return change(
    relative,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Agentlocks instructions are required",
  );
}

async function ensureClaudeHookScript(
  config: ResolvedAgentlocksConfig,
  check: boolean,
  commitHook: boolean,
): Promise<InitChange> {
  const hookPath = path.join(config.root, CLAUDE_AGENTLOCKS_AGENT_HOOK_PATH);
  // With --commit-hook the merged body adds the gated git-commit verify branch;
  // otherwise the id-injection-only body (byte-identical to 0.3.0) is written.
  const body = commitHook ? renderClaudeCommitHookScript() : CLAUDE_AGENTLOCKS_AGENT_HOOK_SCRIPT;
  const exists = await pathExists(hookPath);
  const current = exists ? await readText(hookPath) : "";
  if (exists && current === body) {
    return change(CLAUDE_AGENTLOCKS_AGENT_HOOK_PATH, "unchanged", "Claude agent hook is current");
  }
  if (!check) {
    await ensureDir(path.dirname(hookPath));
    await writeText(hookPath, body);
  }
  return change(
    CLAUDE_AGENTLOCKS_AGENT_HOOK_PATH,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Claude agent hook is required",
  );
}

async function ensureCodexCommitHook(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange[]> {
  const changes: InitChange[] = [];
  changes.push(await ensureCodexHookScript(config, check));
  changes.push(await ensureCodexHooksConfig(config, check));
  // The trust note is advisory, not drift: only surface it on an actual install
  // so `init --check` stays a clean no-op when the .codex files are current.
  if (!check) {
    changes.push(change(CODEX_HOOKS_CONFIG_PATH, "reported", CODEX_TRUST_NOTE));
  }
  return changes;
}

async function ensureCodexHookScript(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const scriptPath = path.join(config.root, CODEX_COMMIT_HOOK_SCRIPT_PATH);
  const body = renderCodexCommitHookScript();
  const exists = await pathExists(scriptPath);
  const current = exists ? await readText(scriptPath) : "";
  if (exists && current === body) {
    return change(CODEX_COMMIT_HOOK_SCRIPT_PATH, "unchanged", "Codex git-verify hook is current");
  }
  if (!check) {
    await ensureDir(path.dirname(scriptPath));
    await writeText(scriptPath, body);
  }
  return change(
    CODEX_COMMIT_HOOK_SCRIPT_PATH,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Codex git-verify hook is required",
  );
}

async function ensureCodexHooksConfig(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const configPath = path.join(config.root, CODEX_HOOKS_CONFIG_PATH);
  const exists = await pathExists(configPath);
  const current = exists ? await readText(configPath) : "";
  const parsed = current.trim() ? JSON.parse(current) : {};
  if (!isRecord(parsed)) throw new Error(`${CODEX_HOOKS_CONFIG_PATH} must contain a JSON object.`);
  const next = `${formatJsonArtifact(upsertCodexHookConfig(parsed))}\n`;
  if (exists && current === next) {
    return change(CODEX_HOOKS_CONFIG_PATH, "unchanged", "Codex hook config is current");
  }
  if (!check) {
    await ensureDir(path.dirname(configPath));
    await writeText(configPath, next);
  }
  return change(
    CODEX_HOOKS_CONFIG_PATH,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Codex hook config is required",
  );
}

async function ensureClaudeSettings(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const settingsPath = path.join(config.root, CLAUDE_SETTINGS_PATH);
  const exists = await pathExists(settingsPath);
  const current = exists ? await readText(settingsPath) : "";
  const parsed = current.trim() ? JSON.parse(current) : {};
  if (!isRecord(parsed)) throw new Error(`${CLAUDE_SETTINGS_PATH} must contain a JSON object.`);
  const next = `${formatJsonArtifact(upsertClaudeHookSettings(parsed))}\n`;
  if (exists && current === next) {
    return change(CLAUDE_SETTINGS_PATH, "unchanged", "Claude hook settings are current");
  }
  if (!check) {
    await ensureDir(path.dirname(settingsPath));
    await writeText(settingsPath, next);
  }
  return change(
    CLAUDE_SETTINGS_PATH,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Claude hook settings are required",
  );
}

async function ensureGitignore(
  config: ResolvedAgentlocksConfig,
  check: boolean,
): Promise<InitChange> {
  const gitignorePath = path.join(config.root, ".gitignore");
  const relative = ".gitignore";
  const entry = ".agentlocks/";
  const exists = await pathExists(gitignorePath);
  const current = exists ? await readText(gitignorePath) : "";
  if (hasGitignoreEntry(current, entry)) return change(relative, "unchanged", "entry exists");

  const next = appendLine(current, entry);
  if (!check) await writeText(gitignorePath, next);
  return change(
    relative,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "ignore local lock state",
  );
}

function upsertMarkedBlock(current: string, block: string): string {
  const normalizedBlock = `${block.trim()}\n`;
  if (!current.trim()) return `# Repository instructions for agents\n\n${normalizedBlock}`;
  const start = current.indexOf(AGENTLOCKS_AGENTS_START);
  const end = current.indexOf(AGENTLOCKS_AGENTS_END);
  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + AGENTLOCKS_AGENTS_END.length;
    const prefix = current.slice(0, start);
    const suffix = current.slice(afterEnd).replace(/^\n*/, "");
    return suffix ? `${prefix}${normalizedBlock}\n${suffix}` : `${prefix}${normalizedBlock}`;
  }
  return `${current.replace(/\s*$/, "\n\n")}${normalizedBlock}`;
}

function hasGitignoreEntry(current: string, entry: string): boolean {
  return current
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === entry || line === entry.replace(/\/$/, ""));
}

function appendLine(current: string, line: string): string {
  if (!current.trim()) return `${line}\n`;
  return `${current.replace(/\s*$/, "\n")}${line}\n`;
}

function change(pathLabel: string, action: InitAction, message: string): InitChange {
  return { path: pathLabel, action, message };
}

function upsertClaudeHookSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = isRecord(settings.hooks) ? { ...settings.hooks } : {};
  const preToolUse = Array.isArray(hooks.PreToolUse) ? [...hooks.PreToolUse] : [];
  const bashGroupIndex = preToolUse.findIndex(
    (group) => isRecord(group) && group.matcher === "Bash",
  );
  const existingGroup: Record<string, unknown> = isRecord(preToolUse[bashGroupIndex])
    ? { ...(preToolUse[bashGroupIndex] as Record<string, unknown>) }
    : { matcher: "Bash" };
  const hookHandlers = Array.isArray(existingGroup.hooks) ? [...existingGroup.hooks] : [];
  if (!hookHandlers.some(isClaudeAgentlocksAgentHookHandler)) {
    hookHandlers.push({
      type: "command",
      command: CLAUDE_HOOK_COMMAND,
      args: [CLAUDE_HOOK_SCRIPT_REFERENCE],
    });
  }
  existingGroup.matcher = "Bash";
  existingGroup.hooks = hookHandlers;
  if (bashGroupIndex === -1) {
    preToolUse.push(existingGroup);
  } else {
    preToolUse[bashGroupIndex] = existingGroup;
  }
  hooks.PreToolUse = preToolUse;
  return { ...settings, hooks };
}

function isClaudeAgentlocksAgentHookHandler(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === "command" &&
    value.command === CLAUDE_HOOK_COMMAND &&
    Array.isArray(value.args) &&
    value.args.length === 1 &&
    value.args[0] === CLAUDE_HOOK_SCRIPT_REFERENCE
  );
}

function upsertCodexHookConfig(config: Record<string, unknown>): Record<string, unknown> {
  const hooks = isRecord(config.hooks) ? { ...config.hooks } : {};
  const preToolUse = Array.isArray(hooks.PreToolUse) ? [...hooks.PreToolUse] : [];
  const bashGroupIndex = preToolUse.findIndex(
    (group) => isRecord(group) && group.matcher === CODEX_HOOK_MATCHER,
  );
  const existingGroup: Record<string, unknown> = isRecord(preToolUse[bashGroupIndex])
    ? { ...(preToolUse[bashGroupIndex] as Record<string, unknown>) }
    : { matcher: CODEX_HOOK_MATCHER };
  const hookHandlers = Array.isArray(existingGroup.hooks) ? [...existingGroup.hooks] : [];
  if (!hookHandlers.some(isCodexAgentlocksHookHandler)) {
    hookHandlers.push({
      type: "command",
      command: CODEX_HOOK_COMMAND,
      timeout: CODEX_HOOK_TIMEOUT,
    });
  }
  existingGroup.matcher = CODEX_HOOK_MATCHER;
  existingGroup.hooks = hookHandlers;
  if (bashGroupIndex === -1) {
    preToolUse.push(existingGroup);
  } else {
    preToolUse[bashGroupIndex] = existingGroup;
  }
  hooks.PreToolUse = preToolUse;
  return { ...config, hooks };
}

function isCodexAgentlocksHookHandler(value: unknown): boolean {
  return isRecord(value) && value.type === "command" && value.command === CODEX_HOOK_COMMAND;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
