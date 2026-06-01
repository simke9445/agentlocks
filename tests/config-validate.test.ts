import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAgentlocksConfig, resolveAgentlocksConfig } from "../src/config";
import { AgentlocksConfigError, validateAgentlocksConfig } from "../src/config-validate";

// A fully-populated, valid config touching every known key in every section.
// If the validator's allowed-key lists ever drift from the config interfaces,
// this fixture starts failing, which is the signal we want.
const FULL_VALID = {
  projectName: "example",
  lockRoot: ".agentlocks/locks",
  command: {
    executable: "agentlocks",
    prefix: ["env", "X=1"],
    packageRunner: "bun",
    packageScript: "agentlocks",
  },
  defaults: {
    ttlMs: 600_000,
    maxTtlMs: 1_800_000,
    unknownLivenessGraceMs: 90_000,
    autoReclaimOnConflict: false,
    keepAliveOnMutation: true,
  },
  owner: {
    envKeys: ["AGENTLOCKS_AGENT_ID"],
    harnesses: ["codex", "claude-code"],
    fallbackPrefix: "agentlocks",
  },
  liveness: { adapter: "auto" },
  agents: { enabled: true, heading: "Agentlocks coordination" },
  init: { updateAgents: true, updateGitignore: true },
};

test("accepts a fully-populated valid config", () => {
  expect(() => validateAgentlocksConfig(FULL_VALID, "agentlocks.config.ts")).not.toThrow();
});

test("accepts empty and partial configs (missing keys fall back to defaults)", () => {
  expect(() => validateAgentlocksConfig({})).not.toThrow();
  expect(() => validateAgentlocksConfig({ projectName: "x" })).not.toThrow();
  expect(() => validateAgentlocksConfig({ defaults: { ttlMs: 1000 } })).not.toThrow();
});

test("accepts null for nullable command fields", () => {
  expect(() =>
    validateAgentlocksConfig({ command: { executable: "agentlocks", packageRunner: null } }),
  ).not.toThrow();
});

test("rejects an unknown top-level key and points at the right one", () => {
  // The exact earlier version's mistake: `install` instead of `init`.
  expect(() => validateAgentlocksConfig({ install: { updateAgents: false } })).toThrow(
    AgentlocksConfigError,
  );
  expect(() => validateAgentlocksConfig({ install: {} })).toThrow(/init/);
});

test("rejects an unknown nested key", () => {
  // The other earlier version's mistake: `includeCodexEnv` is not a real owner key.
  expect(() => validateAgentlocksConfig({ owner: { includeCodexEnv: true } })).toThrow(
    /owner\.includeCodexEnv/,
  );
});

test("rejects a wrong scalar type", () => {
  expect(() => validateAgentlocksConfig({ defaults: { ttlMs: "600000" } })).toThrow(
    /defaults\.ttlMs.*number/,
  );
  expect(() => validateAgentlocksConfig({ projectName: 5 })).toThrow(/projectName.*string/);
});

test("rejects an out-of-range liveness adapter", () => {
  expect(() => validateAgentlocksConfig({ liveness: { adapter: "bogus" } })).toThrow(
    /liveness\.adapter/,
  );
  expect(() => validateAgentlocksConfig({ liveness: { adapter: "auto" } })).not.toThrow();
});

test("rejects a non-object config", () => {
  expect(() => validateAgentlocksConfig(null)).toThrow(AgentlocksConfigError);
  expect(() => validateAgentlocksConfig([])).toThrow(/object/);
  expect(() => validateAgentlocksConfig("nope")).toThrow(/object/);
});

test("resolveAgentlocksConfig rejects a config with a bad key (programmatic path)", () => {
  // resolveAgentlocksConfig is the universal chokepoint every load funnels through.
  expect(() =>
    resolveAgentlocksConfig({ install: { updateAgents: false } } as never, {
      root: "/tmp/agentlocks-x",
    }),
  ).toThrow(AgentlocksConfigError);
  expect(() => resolveAgentlocksConfig({}, { root: "/tmp/agentlocks-x" })).not.toThrow();
});

test("loadAgentlocksConfig rejects a config FILE with a bad key", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agentlocks-cfg-"));
  try {
    await writeFile(
      path.join(dir, "agentlocks.config.ts"),
      "export default { install: { updateAgents: false } };\n",
      "utf8",
    );
    // loadAgentlocksConfig is async, so the validation error surfaces as a rejection.
    await expect(loadAgentlocksConfig({ root: dir })).rejects.toThrow(/init/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
