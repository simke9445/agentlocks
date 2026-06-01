// Runtime validation for Agentlocks config objects.
//
// TypeScript only checks a config file when the author opts in (an explicit
// `satisfies AgentlocksConfig` annotation, which the generated template uses).
// A hand-written config that skips the annotation gets no checking at all, so a
// typo like `install:` (the real key is `init:`) or an invented key such as
// `includeCodexEnv` would be silently dropped during resolution. This validator
// closes that gap: it runs on every loaded config and rejects unknown or
// mistyped keys with a clear, actionable error instead of ignoring them.

export class AgentlocksConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentlocksConfigError";
  }
}

type Scalar = "string" | "number" | "boolean" | "array";

const TOP_LEVEL_KEYS = [
  "projectName",
  "lockRoot",
  "command",
  "defaults",
  "owner",
  "liveness",
  "agents",
  "init",
] as const;

const TOP_LEVEL_TYPES: Record<string, Scalar> = {
  projectName: "string",
  lockRoot: "string",
};

// Allowed keys + value types for each nested object section. Kept in sync with
// the interfaces in config.ts; the validator's own test passes a fully-populated
// valid config so this list can't silently drift from the real shape.
const SECTION_TYPES: Record<string, Record<string, Scalar>> = {
  command: {
    executable: "string",
    prefix: "array",
    packageRunner: "string",
    packageScript: "string",
  },
  defaults: {
    ttlMs: "number",
    maxTtlMs: "number",
    unknownLivenessGraceMs: "number",
    autoReclaimOnConflict: "boolean",
    keepAliveOnMutation: "boolean",
  },
  owner: { envKeys: "array", harnesses: "array", fallbackPrefix: "string" },
  liveness: { adapter: "string" },
  agents: { enabled: "boolean", heading: "string" },
  init: {
    updateAgents: "boolean",
    updateGitignore: "boolean",
    updatePackageScripts: "boolean",
  },
};

const LIVENESS_ADAPTERS = ["auto", "unknown", "codex", "claude-code"];

// A few common mistakes get a direct hint; otherwise we list the valid keys.
const KEY_ALIASES: Record<string, string> = {
  install: "init",
  initialize: "init",
  default: "defaults",
  livenessAdapter: "liveness",
  commands: "command",
};

function suggestKey(bad: string, valid: readonly string[]): string {
  const alias = KEY_ALIASES[bad];
  if (alias && valid.includes(alias)) return ` Did you mean "${alias}"?`;
  const lower = bad.toLowerCase();
  const exact = valid.find((k) => k.toLowerCase() === lower);
  if (exact) return ` Did you mean "${exact}"?`;
  return ` Valid keys: ${valid.join(", ")}.`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkScalar(value: unknown, type: Scalar): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
  }
}

/**
 * Validate the shape of an Agentlocks config object, throwing
 * `AgentlocksConfigError` on the first problem found. `source` names the origin
 * (e.g. the config file path) so the error message is actionable.
 *
 * Only the *shape* is enforced: unknown keys are rejected and present values are
 * type-checked. Missing keys are allowed — they fall back to defaults during
 * resolution. `null`/`undefined` values skip the type check so nullable command
 * fields (`packageRunner`, `packageScript`) stay valid.
 */
export function validateAgentlocksConfig(config: unknown, source = "config"): void {
  if (!isPlainObject(config)) {
    throw new AgentlocksConfigError(`${source} must export a config object.`);
  }

  for (const [key, value] of Object.entries(config)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      throw new AgentlocksConfigError(
        `Unknown ${source} key "${key}".${suggestKey(key, TOP_LEVEL_KEYS)}`,
      );
    }
    const topType = TOP_LEVEL_TYPES[key];
    if (topType && value !== undefined && value !== null && !checkScalar(value, topType)) {
      throw new AgentlocksConfigError(`${source} "${key}" must be a ${topType}.`);
    }
  }

  for (const [section, types] of Object.entries(SECTION_TYPES)) {
    const value = config[section];
    if (value === undefined || value === null) continue;
    if (!isPlainObject(value)) {
      throw new AgentlocksConfigError(`${source} "${section}" must be an object.`);
    }
    const allowed = Object.keys(types);
    for (const [key, entry] of Object.entries(value)) {
      if (!allowed.includes(key)) {
        throw new AgentlocksConfigError(
          `Unknown ${source} key "${section}.${key}".${suggestKey(key, allowed)}`,
        );
      }
      if (entry === undefined || entry === null) continue;
      const expected = types[key];
      if (expected && !checkScalar(entry, expected)) {
        throw new AgentlocksConfigError(`${source} "${section}.${key}" must be a ${expected}.`);
      }
      if (
        section === "liveness" &&
        key === "adapter" &&
        !LIVENESS_ADAPTERS.includes(entry as string)
      ) {
        throw new AgentlocksConfigError(
          `${source} "liveness.adapter" must be one of: ${LIVENESS_ADAPTERS.join(", ")}.`,
        );
      }
    }
  }
}
