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
  loadLockpickConfig,
  type ResolvedLockpickConfig,
  renderLockpickCommand,
} from "./config";
import { ensureDir, pathExists, readText, writeText } from "./io";
import { formatJsonArtifact } from "./json";

export const LOCKPICK_AGENTS_START = "<!-- lockpick:start -->";
export const LOCKPICK_AGENTS_END = "<!-- lockpick:end -->";

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
  recommendedScripts: Record<string, string>;
}

// Lockpick instructions always live in AGENTS.md. Claude Code and Codex both
// read it, so there is no harness-specific instructions file; the harness only
// selects which hook scripts are installed below.
const AGENTS_INSTRUCTIONS_PATH = "AGENTS.md";

const RECOMMENDED_PACKAGE_SCRIPTS: Record<string, string> = {
  lockpick: "lockpick",
  "lockpick:status": "lockpick status",
  "lockpick:init": "lockpick init",
};

export const CLAUDE_LOCKPICK_AGENT_HOOK_PATH = ".claude/hooks/lockpick-agent-env.mjs";
const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
const CLAUDE_HOOK_SCRIPT_REFERENCE =
  "$" + "{CLAUDE_PROJECT_DIR}/.claude/hooks/lockpick-agent-env.mjs";
const CLAUDE_HOOK_COMMAND = "node";
// The default (id-injection-only) Claude hook body lives in commit-hook-script.ts
// as the single source of truth; the merged commit-hook body extends it there.
const CLAUDE_LOCKPICK_AGENT_HOOK_SCRIPT = CLAUDE_AGENT_ENV_HOOK_BODY;

export const CODEX_COMMIT_HOOK_SCRIPT_PATH = ".codex/hooks/lockpick-git-verify.mjs";
const CODEX_HOOKS_CONFIG_PATH = ".codex/hooks.json";
const CODEX_HOOK_MATCHER = "^Bash$";
const CODEX_HOOK_COMMAND =
  'node "$(git rev-parse --show-toplevel)/.codex/hooks/lockpick-git-verify.mjs"';
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
  const config = await loadLockpickConfig({ root });
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
  if (config.init.updatePackageScripts) {
    changes.push(await ensurePackageScripts(config, check));
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
    recommendedScripts: RECOMMENDED_PACKAGE_SCRIPTS,
  };
}

export function renderClaudeLockpickAgentHookScript(): string {
  return CLAUDE_LOCKPICK_AGENT_HOOK_SCRIPT;
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
    result.ok ? "lockpick init: ok" : "lockpick init: changes needed",
    `root: ${result.root}`,
  ];
  for (const change of result.changes) {
    lines.push(`${change.action}: ${change.path} - ${change.message}`);
  }
  return lines.join("\n");
}

export function lockpickAgentsSnippet(config: ResolvedLockpickConfig): string {
  const acquire = renderLockpickCommand(config, [
    "acquire",
    "<paths...>",
    "--reason",
    '"<intent>"',
  ]);
  const expand = renderLockpickCommand(config, ["expand", "--lock", "<lock_id>", "<paths...>"]);
  const refresh = renderLockpickCommand(config, ["refresh", "<lock_id>"]);
  const gitBegin = renderLockpickCommand(config, [
    "git",
    "begin",
    "--refresh-lock",
    "<lock_id>",
    "--reason",
    '"<commit intent>"',
  ]);
  const gitEnd = renderLockpickCommand(config, [
    "git",
    "end",
    "<git_lock_id>",
    "--release-lock",
    "<lock_id>",
  ]);
  return [
    LOCKPICK_AGENTS_START,
    `## ${config.agents.heading}`,
    "",
    "This repository uses Lockpick advisory locks for multi-agent editing.",
    "",
    "- Acquire exact file locks before editing, creating, deleting, renaming, formatting, or bulk-rewriting repository files.",
    `- Use \`${acquire}\` and keep requested paths narrow. Prefer exact paths over globs.`,
    `- Expand before touching newly needed files with \`${expand}\`; do not edit outside the held lock set.`,
    `- Refresh before edit batches, after long tests, and before staging with \`${refresh}\`.`,
    `- Use \`${gitBegin}\` before staging or committing because the Git index is shared.`,
    "- Stage only paths covered by your held locks and verify the staged diff before committing.",
    `- Release promptly after commit or handoff with \`${gitEnd}\` or \`lockpick release <lock_id>\`.`,
    LOCKPICK_AGENTS_END,
  ].join("\n");
}

function lockpickConfigTemplate(projectName: string): string {
  return `import type { LockpickConfig } from "lockpick";

export default {
  projectName: ${JSON.stringify(projectName)},
  lockRoot: ".lockpick/locks",
  command: {
    executable: "lockpick",
  },
  defaults: {
    ttlMs: 600_000,
    maxTtlMs: 1_800_000,
    unknownLivenessGraceMs: 90_000,
    autoReclaimOnConflict: false,
    keepAliveOnMutation: true,
  },
  owner: {
    envKeys: ["LOCKPICK_AGENT_ID"],
    harnesses: ["codex", "claude-code"],
    fallbackPrefix: "lockpick",
  },
  liveness: {
    adapter: "auto",
  },
} satisfies LockpickConfig;
`;
}

async function ensureLockDirectories(
  config: ResolvedLockpickConfig,
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
  config: ResolvedLockpickConfig,
  check: boolean,
): Promise<InitChange> {
  const relative = path.relative(config.root, config.configPath) || DEFAULT_CONFIG_FILE;
  if (await pathExists(config.configPath)) {
    return change(relative, "exists", "existing config preserved");
  }
  if (!check) await writeText(config.configPath, lockpickConfigTemplate(config.projectName));
  return change(relative, check ? "would_create" : "created", "default config is required");
}

async function ensureAgentsInstructions(
  config: ResolvedLockpickConfig,
  check: boolean,
): Promise<InitChange> {
  const agentsPath = path.join(config.root, AGENTS_INSTRUCTIONS_PATH);
  const relative = AGENTS_INSTRUCTIONS_PATH;
  const snippet = lockpickAgentsSnippet(config);
  const exists = await pathExists(agentsPath);
  const current = exists ? await readText(agentsPath) : "";
  const next = upsertMarkedBlock(current, snippet);
  if (exists && current === next) return change(relative, "unchanged", "instructions are current");
  if (!check) await writeText(agentsPath, next);
  return change(
    relative,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Lockpick instructions are required",
  );
}

async function ensureClaudeHookScript(
  config: ResolvedLockpickConfig,
  check: boolean,
  commitHook: boolean,
): Promise<InitChange> {
  const hookPath = path.join(config.root, CLAUDE_LOCKPICK_AGENT_HOOK_PATH);
  // With --commit-hook the merged body adds the gated git-commit verify branch;
  // otherwise the id-injection-only body (byte-identical to 0.3.0) is written.
  const body = commitHook ? renderClaudeCommitHookScript() : CLAUDE_LOCKPICK_AGENT_HOOK_SCRIPT;
  const exists = await pathExists(hookPath);
  const current = exists ? await readText(hookPath) : "";
  if (exists && current === body) {
    return change(CLAUDE_LOCKPICK_AGENT_HOOK_PATH, "unchanged", "Claude agent hook is current");
  }
  if (!check) {
    await ensureDir(path.dirname(hookPath));
    await writeText(hookPath, body);
  }
  return change(
    CLAUDE_LOCKPICK_AGENT_HOOK_PATH,
    check ? (exists ? "would_update" : "would_create") : exists ? "updated" : "created",
    "Claude agent hook is required",
  );
}

async function ensureCodexCommitHook(
  config: ResolvedLockpickConfig,
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
  config: ResolvedLockpickConfig,
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
  config: ResolvedLockpickConfig,
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
  config: ResolvedLockpickConfig,
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
  config: ResolvedLockpickConfig,
  check: boolean,
): Promise<InitChange> {
  const gitignorePath = path.join(config.root, ".gitignore");
  const relative = ".gitignore";
  const entry = ".lockpick/";
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

async function ensurePackageScripts(
  config: ResolvedLockpickConfig,
  check: boolean,
): Promise<InitChange> {
  const packagePath = path.join(config.root, "package.json");
  const relative = "package.json";
  if (!(await pathExists(packagePath))) {
    return change(relative, "reported", "no package.json; add the recommended scripts manually");
  }

  const parsed = JSON.parse(await readText(packagePath)) as {
    scripts?: Record<string, string>;
    [key: string]: unknown;
  };
  const scripts = parsed.scripts ?? {};
  let changed = false;
  for (const [name, command] of Object.entries(RECOMMENDED_PACKAGE_SCRIPTS)) {
    if (scripts[name]) continue;
    scripts[name] = command;
    changed = true;
  }
  if (!changed) return change(relative, "unchanged", "recommended scripts exist");

  if (!check) {
    parsed.scripts = scripts;
    await writeText(packagePath, `${formatJsonArtifact(parsed)}\n`);
  }
  return change(relative, check ? "would_update" : "updated", "recommended scripts added");
}

function upsertMarkedBlock(current: string, block: string): string {
  const normalizedBlock = `${block.trim()}\n`;
  if (!current.trim()) return `# Repository instructions for agents\n\n${normalizedBlock}`;
  const start = current.indexOf(LOCKPICK_AGENTS_START);
  const end = current.indexOf(LOCKPICK_AGENTS_END);
  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + LOCKPICK_AGENTS_END.length;
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
  if (!hookHandlers.some(isClaudeLockpickAgentHookHandler)) {
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

function isClaudeLockpickAgentHookHandler(value: unknown): boolean {
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
  if (!hookHandlers.some(isCodexLockpickHookHandler)) {
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

function isCodexLockpickHookHandler(value: unknown): boolean {
  return isRecord(value) && value.type === "command" && value.command === CODEX_HOOK_COMMAND;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
