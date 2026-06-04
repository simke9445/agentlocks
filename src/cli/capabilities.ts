import packageJson from "../../package.json";
import { DEFAULT_CONFIG_FILE, DEFAULT_LOCK_ROOT } from "../config";
import {
  AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
  CLAUDE_CODE_SESSION_ENV_KEY,
  CODEX_OWNER_ENV_KEY,
  DEFAULT_AGENT_ENV_KEYS,
} from "../locks/session";
import {
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_UNKNOWN_LIVENESS_GRACE_MS,
  GIT_INDEX_RESOURCE,
  MAX_LOCK_TTL_MS,
} from "../locks/types";

export interface CapabilitiesCommandOptions {
  json: boolean;
}

interface CommandCapability {
  name: string;
  usage: string;
  summary: string;
  category: "lock" | "git" | "init" | "meta";
  mutates: boolean;
  json: boolean;
  id_only: boolean;
  verbose: boolean;
  positionals: CommandPositional[];
  flags: string[];
  required: string[];
  json_kind: string | null;
  json_schema_ref: string | null;
  json_alternate_schema_refs?: string[];
  json_example: Record<string, unknown> | null;
  json_unsupported_reason?: string;
  id_only_lines?: string[];
  compact_vs_verbose?: string;
  exit_codes: number[];
  next: string[];
  dry_run?: string;
}

interface CommandPositional {
  name: string;
  value: string;
  required: boolean;
  repeatable: boolean;
  description: string;
}

interface JsonSchemaCapability {
  type: "object";
  required: string[];
  optional: string[];
  properties: Record<string, string>;
}

interface ExitCodeCapability {
  code: number;
  name: string;
  meaning: string;
}

interface EnvCapability {
  name: string;
  purpose: string;
}

interface OwnerDetectionCapability {
  order: string[];
  harnesses: Array<{
    name: "codex" | "claude-code";
    primary_env: string;
    scope: "agent" | "session";
  }>;
}

export interface AgentlocksCapabilities {
  kind: "capabilities";
  schema_version: 2;
  name: "agentlocks";
  version: string;
  contract: "agentlocks.capabilities.v2";
  commands: CommandCapability[];
  json_schemas: Record<string, JsonSchemaCapability>;
  exit_codes: ExitCodeCapability[];
  env: EnvCapability[];
  owner_detection: OwnerDetectionCapability;
  defaults: {
    config_file: string;
    lock_root: string;
    ttl_ms: number;
    max_ttl_ms: number;
    unknown_liveness_grace_ms: number;
    git_index_resource: string;
  };
}

const LOCK_OUTPUT_FLAGS = ["--json", "--id-only", "--verbose"];
const AGENT_FLAGS = ["--agent-id"];
const TTL_FLAGS = ["--ttl-ms"];
const COMPACT_VERBOSE_LOCK_NOTE =
  "Compact JSON exposes the agent-facing summary; --verbose includes the full internal lock result.";
const RESOURCE_SPECS_REQUIRED: CommandPositional[] = [
  {
    name: "resources",
    value: "resource_spec",
    required: true,
    repeatable: true,
    description: "Quoted repo-relative path or glob-like resource specs.",
  },
];
const RESOURCE_SPECS_OPTIONAL: CommandPositional[] = [
  {
    name: "resources",
    value: "resource_spec",
    required: false,
    repeatable: true,
    description: "Optional quoted repo-relative path or glob-like resource filters.",
  },
];
const LOCK_IDS_OPTIONAL: CommandPositional[] = [
  {
    name: "lock_ids",
    value: "lock_id",
    required: false,
    repeatable: true,
    description: "Lock ids. For refresh/release, --mine can be used instead of ids.",
  },
];
const GIT_LOCK_IDS_REQUIRED: CommandPositional[] = [
  {
    name: "git_lock_ids",
    value: "lock_id",
    required: true,
    repeatable: true,
    description: `Synthetic ${GIT_INDEX_RESOURCE} lock ids from agentlocks git begin.`,
  },
];
const WRAPPED_CHILD_COMMAND: CommandPositional = {
  name: "child_command",
  value: "argv_after_double_dash",
  required: true,
  repeatable: true,
  description: "Command argv after --; stdout and stderr belong to the child process.",
};
const NO_POSITIONALS: CommandPositional[] = [];

const JSON_SCHEMAS: Record<string, JsonSchemaCapability> = {
  "lock.acquired.compact": {
    type: "object",
    required: ["kind", "exit_code", "lock_id"],
    optional: ["reclaimed_lock_ids"],
    properties: {
      kind: "literal acquired",
      exit_code: "number exit status",
      lock_id: "new or idempotently reused file lock id",
      reclaimed_lock_ids: "lock ids reclaimed before acquisition when --reclaim succeeds",
    },
  },
  "lock.updated.compact": {
    type: "object",
    required: ["kind", "exit_code", "lock_id"],
    optional: ["lock_count", "lock_ids"],
    properties: {
      kind: "literal expanded, refreshed, or released",
      exit_code: "number exit status",
      lock_id: "single affected lock id",
      lock_count: "number of affected locks when multiple ids or --mine are used",
      lock_ids: "affected lock ids when multiple ids or --mine are used",
    },
  },
  "lock.status.compact": {
    type: "object",
    required: ["kind", "exit_code", "lock_count", "lock_ids", "locks"],
    optional: [],
    properties: {
      kind: "literal status",
      exit_code: "number exit status",
      lock_count: "number of matching active locks",
      lock_ids: "matching lock ids",
      locks:
        "compact lock summaries with lock_id, status, normalized resources, owner, reason, reclaimable, and next",
    },
  },
  "lock.board.compact": {
    type: "object",
    required: ["kind", "exit_code", "agent_count", "lock_count", "agents"],
    optional: [],
    properties: {
      kind: "literal board",
      exit_code: "number exit status",
      agent_count: "number of agents with matching active locks",
      lock_count: "total matching active locks",
      agents:
        "agent_id groups whose locks use the same compact lock summary shape as status --json",
    },
  },
  "lock.conflict.compact": {
    type: "object",
    required: ["kind", "exit_code", "suggested_action", "next", "ahead_of", "conflicts"],
    optional: ["retry_after_ms"],
    properties: {
      kind: "literal conflict",
      exit_code: "literal 3",
      suggested_action: "retry_later or prune_then_retry",
      next: "machine-readable next action",
      ahead_of: "number of incumbent locks ahead of this request",
      retry_after_ms: "honest wait floor when known",
      conflicts:
        "blocking lock summaries with lock_id, owner, reason, status, normalized resources, reclaimable, and next",
    },
  },
  "lock.prune.compact": {
    type: "object",
    required: ["kind", "exit_code", "dry_run", "pruned_count", "pruned_lock_ids"],
    optional: [],
    properties: {
      kind: "literal pruned",
      exit_code: "number exit status",
      dry_run: "true when locks were only reported",
      pruned_count: "number of reclaimable locks",
      pruned_lock_ids: "reclaimable or removed lock ids",
    },
  },
  "lock.identified.compact": {
    type: "object",
    required: ["kind", "exit_code", "agent_id", "source", "harness", "harness_scope"],
    optional: [],
    properties: {
      kind: "literal identified",
      exit_code: "number exit status",
      agent_id: "detected lock owner id or null",
      source: "identity source label or null",
      harness: "detected harness name or null",
      harness_scope: "agent, session, or null",
    },
  },
  "git.begin.compact": {
    type: "object",
    required: ["kind", "exit_code", "lock_id", "git_token", "refreshed_lock_ids"],
    optional: [],
    properties: {
      kind: "literal git-begin",
      exit_code: "number exit status",
      lock_id: `synthetic ${GIT_INDEX_RESOURCE} lock id`,
      git_token: "fence token that git end can verify",
      refreshed_lock_ids: "file lock ids refreshed before taking the Git-index lock",
    },
  },
  "git.verify.compact": {
    type: "object",
    required: ["ok", "exit_code", "command", "caller"],
    optional: ["staged_paths", "uncovered", "foreign_covered", "covered", "sequencer", "next"],
    properties: {
      ok: "boolean advisory result",
      exit_code: "always 0; git verify reports findings without blocking",
      command: "literal git verify",
      caller: "detected agent identity and reliability",
      staged_paths: "paths considered for lock coverage",
      uncovered: "staged paths not covered by a live lock held by the caller",
      foreign_covered: "paths covered only by another live agent",
      covered: "paths covered by caller-held live locks",
      sequencer: "merge/rebase/cherry-pick state when verification is skipped",
      next: "recommended follow-up command when findings exist",
    },
  },
  "init.compact": {
    type: "object",
    required: [
      "kind",
      "ok",
      "exit_code",
      "check",
      "harness",
      "resolved_harness",
      "root",
      "change_count",
      "changes",
    ],
    optional: [],
    properties: {
      kind: "literal init",
      ok: "boolean false when --check finds drift or init cannot complete",
      exit_code: "0 when current or written successfully, 1 when drift/errors are reported",
      check: "true when --check wrote nothing",
      harness: "requested harness option",
      resolved_harness: "auto-resolved harness",
      root: "host repository root",
      change_count: "number of support-file changes",
      changes: "compact init change summaries",
    },
  },
  "capabilities.v2": {
    type: "object",
    required: [
      "kind",
      "schema_version",
      "name",
      "version",
      "contract",
      "commands",
      "json_schemas",
      "exit_codes",
      "env",
      "owner_detection",
      "defaults",
    ],
    optional: [],
    properties: {
      kind: "literal capabilities",
      schema_version: "literal 2",
      name: "literal agentlocks",
      version: "package version",
      contract: "literal agentlocks.capabilities.v2",
      commands: "command metadata including positionals and JSON shape refs",
      json_schemas: "schema summaries keyed by command json_schema_ref",
      exit_codes: "numeric exit-code meanings",
      env: "identity-related environment variables",
      owner_detection: "identity detection order and harness scopes",
      defaults: "runtime defaults for config, locks, ttl, liveness, and git index",
    },
  },
  "doctor.compact": {
    type: "object",
    required: ["kind", "schema_version", "ok", "exit_code", "summary", "checks"],
    optional: [],
    properties: {
      kind: "literal doctor",
      schema_version: "doctor payload schema version",
      ok: "boolean false when warnings/errors are present",
      exit_code: "0 when healthy, 1 when warnings/errors are present",
      summary: "count of ok/warn/error checks",
      checks: "read-only health check summaries",
    },
  },
};

function jsonOutput(
  jsonSchemaRef: string,
  jsonKind: string,
  jsonExample: Record<string, unknown>,
  compactVsVerbose = COMPACT_VERBOSE_LOCK_NOTE,
): Pick<
  CommandCapability,
  "json_kind" | "json_schema_ref" | "json_example" | "compact_vs_verbose"
> {
  return {
    json_kind: jsonKind,
    json_schema_ref: jsonSchemaRef,
    json_example: jsonExample,
    compact_vs_verbose: compactVsVerbose,
  };
}

function noJson(
  reason: string,
): Pick<
  CommandCapability,
  "json_kind" | "json_schema_ref" | "json_example" | "json_unsupported_reason"
> {
  return {
    json_kind: null,
    json_schema_ref: null,
    json_example: null,
    json_unsupported_reason: reason,
  };
}

export function agentlocksCapabilities(): AgentlocksCapabilities {
  return {
    kind: "capabilities",
    schema_version: 2,
    name: "agentlocks",
    version: packageJson.version,
    contract: "agentlocks.capabilities.v2",
    json_schemas: JSON_SCHEMAS,
    commands: [
      {
        name: "acquire",
        usage: "agentlocks acquire [resources...] --reason <text>",
        summary: "Acquire advisory locks for quoted repo-relative paths or glob patterns.",
        category: "lock",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: RESOURCE_SPECS_REQUIRED,
        flags: ["--reason", ...TTL_FLAGS, "--reclaim", ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["--reason", "resource"],
        ...jsonOutput("lock.acquired.compact", "acquired", {
          kind: "acquired",
          exit_code: 0,
          lock_id: "lock_20260604T120000Z_abc12345",
        }),
        json_alternate_schema_refs: ["lock.conflict.compact"],
        id_only_lines: ["lock_id"],
        exit_codes: [0, 2, 3],
        next: [
          "agentlocks refresh <lock_id>",
          'agentlocks git begin --refresh-lock <lock_id> --reason "<commit intent>"',
          "agentlocks release <lock_id>",
        ],
      },
      {
        name: "expand",
        usage: "agentlocks expand --lock <lock_id> [resources...]",
        summary: "Atomically add quoted repo-relative resources to an existing lock.",
        category: "lock",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: RESOURCE_SPECS_REQUIRED,
        flags: ["--lock", "--reason", ...TTL_FLAGS, ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["--lock", "resource"],
        ...jsonOutput("lock.updated.compact", "expanded", {
          kind: "expanded",
          exit_code: 0,
          lock_id: "lock_20260604T120000Z_abc12345",
        }),
        json_alternate_schema_refs: ["lock.conflict.compact"],
        id_only_lines: ["lock_id"],
        exit_codes: [0, 2, 3],
        next: ["agentlocks refresh <lock_id>", "agentlocks release <lock_id>"],
      },
      {
        name: "refresh",
        usage: "agentlocks refresh [lock_ids...]",
        summary: "Refresh held lock leases.",
        category: "lock",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: LOCK_IDS_OPTIONAL,
        flags: ["--lock", "--mine", ...TTL_FLAGS, ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["lock-id"],
        ...jsonOutput("lock.updated.compact", "refreshed", {
          kind: "refreshed",
          exit_code: 0,
          lock_id: "lock_20260604T120000Z_abc12345",
        }),
        id_only_lines: ["lock_id", "..."],
        exit_codes: [0, 2, 3],
        next: ['agentlocks git begin --refresh-lock <lock_id> --reason "<commit intent>"'],
      },
      {
        name: "release",
        usage: "agentlocks release [lock_ids...]",
        summary: "Release held locks, or every lock you hold with --mine.",
        category: "lock",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: LOCK_IDS_OPTIONAL,
        flags: ["--lock", "--mine", ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["lock-id"],
        ...jsonOutput("lock.updated.compact", "released", {
          kind: "released",
          exit_code: 0,
          lock_id: "lock_20260604T120000Z_abc12345",
        }),
        id_only_lines: ["lock_id", "..."],
        exit_codes: [0, 2, 3],
        next: ["agentlocks status --json"],
      },
      {
        name: "status",
        usage: "agentlocks status [resources...]",
        summary: "Show active locks, optionally filtered by resources or --mine.",
        category: "lock",
        mutates: false,
        json: true,
        id_only: true,
        verbose: true,
        positionals: RESOURCE_SPECS_OPTIONAL,
        flags: ["--mine", ...LOCK_OUTPUT_FLAGS],
        required: [],
        ...jsonOutput("lock.status.compact", "status", {
          kind: "status",
          exit_code: 0,
          lock_count: 1,
          lock_ids: ["lock_20260604T120000Z_abc12345"],
          locks: [
            {
              lock_id: "lock_20260604T120000Z_abc12345",
              status: "held",
              resources: [{ kind: "path", value: "src/app.ts" }],
              owner: { agent_id: "codex:thread" },
              reason: "edit app",
              reclaimable: false,
              next: "refresh_or_release_if_owner",
            },
          ],
        }),
        id_only_lines: ["lock_id", "..."],
        exit_codes: [0, 2],
        next: ['agentlocks acquire <resources...> --reason "<intent>" --id-only'],
      },
      {
        name: "board",
        usage: "agentlocks board [resources...]",
        summary: "Overview of active locks grouped by agent with each lease's state.",
        category: "lock",
        mutates: false,
        json: true,
        id_only: true,
        verbose: true,
        positionals: RESOURCE_SPECS_OPTIONAL,
        flags: ["--mine", ...LOCK_OUTPUT_FLAGS],
        required: [],
        ...jsonOutput("lock.board.compact", "board", {
          kind: "board",
          exit_code: 0,
          agent_count: 1,
          lock_count: 1,
          agents: [
            {
              agent_id: "codex:thread",
              locks: [
                {
                  lock_id: "lock_20260604T120000Z_abc12345",
                  status: "held",
                  resources: [{ kind: "path", value: "src/app.ts" }],
                  owner: { agent_id: "codex:thread" },
                  reason: "edit app",
                  reclaimable: false,
                  next: "refresh_or_release_if_owner",
                },
              ],
            },
          ],
        }),
        id_only_lines: ["lock_id", "..."],
        exit_codes: [0, 2],
        next: ['agentlocks acquire <resources...> --reason "<intent>" --id-only'],
      },
      {
        name: "prune",
        usage: "agentlocks prune",
        summary: "Remove reclaimable expired locks.",
        category: "lock",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: ["--dry-run", ...LOCK_OUTPUT_FLAGS],
        required: [],
        ...jsonOutput("lock.prune.compact", "pruned", {
          kind: "pruned",
          exit_code: 0,
          dry_run: true,
          pruned_count: 0,
          pruned_lock_ids: [],
        }),
        id_only_lines: ["lock_id", "..."],
        exit_codes: [0, 2],
        next: ['agentlocks acquire <resources...> --reason "<intent>" --id-only'],
        dry_run: "--dry-run",
      },
      {
        name: "identify",
        usage: "agentlocks identify",
        summary: "Show detected lock agent identity.",
        category: "lock",
        mutates: false,
        json: true,
        id_only: false,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: [...AGENT_FLAGS, "--json", "--verbose"],
        required: [],
        ...jsonOutput("lock.identified.compact", "identified", {
          kind: "identified",
          exit_code: 0,
          agent_id: "codex:thread",
          source: "harness:codex:CODEX_THREAD_ID",
          harness: "codex",
          harness_scope: "agent",
        }),
        exit_codes: [0],
        next: ['agentlocks acquire <resources...> --reason "<intent>"'],
      },
      {
        name: "git begin",
        usage: "agentlocks git begin --reason <text>",
        summary: `Acquire the synthetic ${GIT_INDEX_RESOURCE} lock.`,
        category: "git",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: ["--reason", "--refresh-lock", ...TTL_FLAGS, ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["--reason"],
        ...jsonOutput("git.begin.compact", "git-begin", {
          kind: "git-begin",
          exit_code: 0,
          lock_id: "lock_20260604T120000Z_git12345",
          git_token: "g7",
          refreshed_lock_ids: ["lock_20260604T120000Z_abc12345"],
        }),
        json_alternate_schema_refs: ["lock.conflict.compact"],
        id_only_lines: ["git_lock_id", "git_token"],
        exit_codes: [0, 2, 3],
        next: [
          "git add <locked_paths>",
          "git commit",
          "agentlocks git end <git_lock_id> --release-lock <lock_id>",
        ],
      },
      {
        name: "git end",
        usage: "agentlocks git end [git_lock_ids...]",
        summary: `Release the synthetic ${GIT_INDEX_RESOURCE} lock.`,
        category: "git",
        mutates: true,
        json: true,
        id_only: true,
        verbose: true,
        positionals: GIT_LOCK_IDS_REQUIRED,
        flags: ["--lock", "--release-lock", "--git-token", ...AGENT_FLAGS, ...LOCK_OUTPUT_FLAGS],
        required: ["lock-id"],
        ...jsonOutput("lock.updated.compact", "released", {
          kind: "released",
          exit_code: 0,
          lock_count: 2,
          lock_ids: ["lock_20260604T120000Z_git12345", "lock_20260604T120000Z_abc12345"],
        }),
        id_only_lines: ["git_lock_id", "released_lock_id", "..."],
        exit_codes: [0, 2, 3],
        next: ["agentlocks status --json"],
      },
      {
        name: "git verify",
        usage: "agentlocks git verify",
        summary: "Advisory check: are staged paths covered by a held lock? (never blocks)",
        category: "git",
        mutates: false,
        json: true,
        id_only: false,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: [
          "--staged",
          "--include-unstaged",
          "--pathspec",
          "--pathspec-mode",
          "--json",
          "--verbose",
        ],
        required: [],
        ...jsonOutput(
          "git.verify.compact",
          "git_verify",
          {
            ok: false,
            exit_code: 0,
            command: "git verify",
            caller: { agent_id: "codex:thread", reliable: true },
            uncovered: [
              { path: "src/app.ts", next: "agentlocks acquire 'src/app.ts' --reason ..." },
            ],
          },
          "Compact JSON is the git-verify report; --verbose includes additional lock and path details.",
        ),
        exit_codes: [0],
        next: ['agentlocks acquire <resources...> --reason "<intent>"'],
      },
      {
        name: "run",
        usage: "agentlocks run [resources...] --reason <text> -- <command>",
        summary: "Acquire locks, run a command after --, then release.",
        category: "lock",
        mutates: true,
        json: false,
        id_only: false,
        verbose: false,
        positionals: [...RESOURCE_SPECS_REQUIRED, WRAPPED_CHILD_COMMAND],
        flags: ["--reason", ...TTL_FLAGS, ...AGENT_FLAGS],
        required: ["--reason", "-- command"],
        ...noJson("run delegates stdout/stderr and exit status to the child command."),
        exit_codes: [0, 2, 3],
        next: ["agentlocks status --json"],
      },
      {
        name: "edit",
        usage: "agentlocks edit [resources...] --reason <text> -- <command>",
        summary: "Acquire locks, run a command after --, and keep the lock for later turns.",
        category: "lock",
        mutates: true,
        json: false,
        id_only: false,
        verbose: false,
        positionals: [...RESOURCE_SPECS_REQUIRED, WRAPPED_CHILD_COMMAND],
        flags: ["--reason", ...TTL_FLAGS, ...AGENT_FLAGS],
        required: ["--reason", "-- command"],
        ...noJson("edit delegates stdout/stderr and exit status to the child command."),
        exit_codes: [0, 2, 3],
        next: ["agentlocks refresh <lock_id>", "agentlocks release <lock_id>"],
      },
      {
        name: "commit",
        usage: "agentlocks commit [resources...] --reason <text> -m <message>",
        summary:
          "Lock resources and the Git index, stage and commit only those resources, then release.",
        category: "git",
        mutates: true,
        json: false,
        id_only: false,
        verbose: false,
        positionals: RESOURCE_SPECS_REQUIRED,
        flags: ["--reason", "--message", "--keep", ...TTL_FLAGS, ...AGENT_FLAGS],
        required: ["--reason"],
        ...noJson("commit wraps git add/commit and prints operational text, not JSON."),
        exit_codes: [0, 2, 3],
        next: ["agentlocks status --json"],
      },
      {
        name: "init",
        usage:
          "agentlocks init [--check] [--harness auto|codex|claude-code] [--no-commit-hook] [--json]",
        summary: "Initialize Agentlocks support files (incl. the commit-hook backstop by default).",
        category: "init",
        mutates: true,
        json: true,
        id_only: false,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: ["--check", "--harness", "--no-commit-hook", "--json", "--verbose"],
        required: [],
        ...jsonOutput(
          "init.compact",
          "init",
          {
            kind: "init",
            ok: false,
            exit_code: 1,
            check: true,
            harness: "auto",
            resolved_harness: "codex",
            root: "/repo",
            change_count: 1,
            changes: [{ path: "AGENTS.md", action: "update" }],
          },
          "Compact JSON summarizes support-file drift; --verbose includes full change records.",
        ),
        exit_codes: [0, 1],
        next: ["agentlocks init --check --json"],
        dry_run: "--check",
      },
      {
        name: "capabilities",
        usage: "agentlocks capabilities --json",
        summary: "Print the machine-readable CLI contract.",
        category: "meta",
        mutates: false,
        json: true,
        id_only: false,
        verbose: false,
        positionals: NO_POSITIONALS,
        flags: ["--json"],
        required: [],
        ...jsonOutput(
          "capabilities.v2",
          "capabilities",
          {
            kind: "capabilities",
            schema_version: 2,
            name: "agentlocks",
            contract: "agentlocks.capabilities.v2",
          },
          "Capabilities JSON is compact and has no --verbose mode.",
        ),
        exit_codes: [0],
        next: ["agentlocks status --json"],
      },
      {
        name: "robot-docs guide",
        usage: "agentlocks robot-docs guide",
        summary: "Print the concise agent workflow guide.",
        category: "meta",
        mutates: false,
        json: false,
        id_only: false,
        verbose: false,
        positionals: NO_POSITIONALS,
        flags: [],
        required: [],
        ...noJson("robot-docs guide is a plain text agent handbook."),
        exit_codes: [0],
        next: ["agentlocks capabilities --json", "agentlocks status --json"],
      },
      {
        name: "doctor",
        usage: "agentlocks doctor --json",
        summary: "Run read-only Agentlocks health checks.",
        category: "meta",
        mutates: false,
        json: true,
        id_only: false,
        verbose: true,
        positionals: NO_POSITIONALS,
        flags: ["--json", "--verbose"],
        required: [],
        ...jsonOutput(
          "doctor.compact",
          "doctor",
          {
            kind: "doctor",
            schema_version: 1,
            ok: false,
            exit_code: 1,
            summary: { ok: 2, warn: 1, error: 0 },
            checks: [{ id: "init", status: "warn", next: "agentlocks init --check --json" }],
          },
          "Compact JSON summarizes health checks; --verbose includes detailed diagnostics.",
        ),
        exit_codes: [0, 1],
        next: ["agentlocks init --check --json"],
      },
    ],
    exit_codes: [
      { code: 0, name: "success", meaning: "Command completed successfully." },
      {
        code: 1,
        name: "cli_or_check_error",
        meaning: "CLI parse error, init check drift, or doctor warning/error result.",
      },
      {
        code: 2,
        name: "lock_usage_error",
        meaning: "Invalid lock input, missing lock id, or missing lock resource.",
      },
      { code: 3, name: "lock_conflict", meaning: "Lock conflict or ownership failure." },
    ],
    env: [
      ...DEFAULT_AGENT_ENV_KEYS.map((name) => ({
        name,
        purpose: "Agent id lookup for unsupported harnesses, after harness detection.",
      })),
      {
        name: AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
        purpose: "Reserved harness-provided agent id, checked before explicit --agent-id.",
      },
      {
        name: CODEX_OWNER_ENV_KEY,
        purpose: "Codex agent thread id used for automatic agent id detection.",
      },
      {
        name: CLAUDE_CODE_SESSION_ENV_KEY,
        purpose: "Claude Code session id used as automatic agent id detection fallback.",
      },
    ],
    owner_detection: {
      order: [
        AGENTLOCKS_HARNESS_AGENT_ENV_KEY,
        CODEX_OWNER_ENV_KEY,
        CLAUDE_CODE_SESSION_ENV_KEY,
        "--agent-id",
        "AGENTLOCKS_AGENT_ID",
        "fallback",
      ],
      harnesses: [
        {
          name: "codex",
          primary_env: CODEX_OWNER_ENV_KEY,
          scope: "agent",
        },
        {
          name: "claude-code",
          primary_env: CLAUDE_CODE_SESSION_ENV_KEY,
          scope: "session",
        },
      ],
    },
    defaults: {
      config_file: DEFAULT_CONFIG_FILE,
      lock_root: DEFAULT_LOCK_ROOT,
      ttl_ms: DEFAULT_LOCK_TTL_MS,
      max_ttl_ms: MAX_LOCK_TTL_MS,
      unknown_liveness_grace_ms: DEFAULT_UNKNOWN_LIVENESS_GRACE_MS,
      git_index_resource: GIT_INDEX_RESOURCE,
    },
  };
}

export function renderCapabilitiesText(): string {
  const capabilities = agentlocksCapabilities();
  return [
    "agentlocks capabilities",
    `version: ${capabilities.version}`,
    "json: agentlocks capabilities --json",
    `commands: ${capabilities.commands.map((command) => command.name).join(", ")}`,
  ].join("\n");
}
