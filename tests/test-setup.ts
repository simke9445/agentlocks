// Test preload (wired via bunfig.toml `[test].preload`). Scrubs ambient
// harness/agent identity env vars from the test process so the suite is hermetic.
//
// Without this, running `bun test` inside a real coding harness (Claude Code,
// Codex) leaks CLAUDE_CODE_SESSION_ID / CODEX_THREAD_ID into the tests. Harness
// detection takes precedence over an explicit agentId (see identifyLockOwner in
// src/locks/session.ts), so two "different" agents collapse to one id and the
// resolved harness flips, turning green tests red only inside a harness.
//
// Tests that exercise harness detection set these keys explicitly (via a registry
// `env` option or the runCli `env` arg); that still works because this only
// clears the AMBIENT values inherited from the developer's shell.
import {
  AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
  CLAUDE_CODE_SESSION_ENV_KEY,
  CLAUDE_PROJECTS_DIR_ENV_KEY,
  CODEX_OWNER_ENV_KEY,
  DEFAULT_AGENT_ENV_KEYS,
} from "../src/locks/session";

const AMBIENT_HARNESS_ENV_KEYS: string[] = [
  ...DEFAULT_AGENT_ENV_KEYS,
  AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
  CODEX_OWNER_ENV_KEY,
  CLAUDE_CODE_SESSION_ENV_KEY,
  CLAUDE_PROJECTS_DIR_ENV_KEY,
  // Probe-home overrides read inline in session.ts (codexHome / claudeProjectsHome).
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  // doctor's harnessChecks reads CODEX_CI to infer a likely-Codex env; scrub it too so the
  // doctor diagnostics are hermetic when the suite runs inside a Codex CI environment.
  "CODEX_CI",
];

for (const key of AMBIENT_HARNESS_ENV_KEYS) {
  delete process.env[key];
}
