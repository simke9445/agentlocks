#!/usr/bin/env bun
export { main } from "./cli/index";
export {
  defineLockpickConfig,
  findHostRoot,
  type LockpickConfig,
  loadLockpickConfig,
  type ResolvedLockpickConfig,
  renderLockpickCommand,
  resolveLockpickConfig,
} from "./config";
export {
  CLAUDE_LOCKPICK_AGENT_HOOK_PATH,
  CODEX_COMMIT_HOOK_SCRIPT_PATH,
  type InitHarness,
  type InitResult,
  lockpickAgentsSnippet,
  renderClaudeCommitHookScript,
  renderClaudeLockpickAgentHookScript,
  renderCodexCommitHookScript,
  renderInitResult,
  resolveInitHarness,
  runInit,
} from "./init";
export { executeLockCommand, renderLockResult, verifyGitFence } from "./locks/commands";
export { runGitVerify } from "./locks/git-verify";
export { resourceCovers, resourcesConflict, resourcesCover } from "./locks/matching";
export { FileLockRegistry, gitIndexToken } from "./locks/registry";
export { normalizeLockResources } from "./locks/resources";
export {
  CLAUDE_CODE_SESSION_ENV_KEY,
  CLAUDE_PROJECTS_DIR_ENV_KEY,
  type ClaudeCodeProbeOptions,
  CODEX_OWNER_ENV_KEY,
  createClaudeCodeSessionProbe,
  createHarnessSessionProbe,
  createUnknownSessionProbe,
  DEFAULT_AGENT_ENV_KEYS,
  DEFAULT_OWNER_HARNESSES,
  detectAgentId,
  detectHarnessAgentId,
  type HarnessSessionProbeOptions,
  identifyLockOwner,
  isReliableOwnerIdentity,
  LOCKPICK_HARNESS_AGENT_ENV_KEY,
  lockOwnerAgentId,
  lockOwnerSource,
  probeClaudeCodeSessionLiveness,
  probeCodexSessionLiveness,
  type SessionLivenessProbe,
} from "./locks/session";
export type * from "./locks/types";

import { main } from "./cli/index";

if (import.meta.main) {
  await main();
}
