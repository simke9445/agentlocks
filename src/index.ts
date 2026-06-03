export { main } from "./cli/index";
export {
  type AgentlocksConfig,
  defineAgentlocksConfig,
  findHostRoot,
  loadAgentlocksConfig,
  type ResolvedAgentlocksConfig,
  renderAgentlocksCommand,
  resolveAgentlocksConfig,
} from "./config";
export { AgentlocksConfigError, validateAgentlocksConfig } from "./config-validate";
export {
  agentlocksAgentsSnippet,
  CLAUDE_AGENTLOCKS_AGENT_HOOK_PATH,
  CODEX_COMMIT_HOOK_SCRIPT_PATH,
  type InitHarness,
  type InitResult,
  renderClaudeAgentlocksAgentHookScript,
  renderClaudeCommitHookScript,
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
  AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
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
  lockOwnerAgentId,
  lockOwnerSource,
  probeClaudeCodeSessionLiveness,
  probeCodexSessionLiveness,
  type SessionLivenessProbe,
} from "./locks/session";
export type * from "./locks/types";
