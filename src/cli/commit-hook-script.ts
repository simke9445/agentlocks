// Generators for the opt-in PreToolUse commit-hook backstops (F5 / GIT_HOOK_SPEC §4).
//
// These build the *source text* of standalone Node ESM hook scripts that `init
// --commit-hook` writes next to the existing harness hooks. The scripts are
// advisory-only: they detect an agent's `git commit` tool-call, run
// `agentlocks git verify --json`, and surface uncovered/foreign-covered paths.
// They NEVER deny/block and fail OPEN on any error (GIT_HOOK_SPEC §4.1).
//
// The Claude script is the *merge* of the existing agent-id injection hook
// (`agentlocks-agent-env.mjs`) and the verify branch — one node spawn per Bash
// (§4.2). The Codex script is a standalone verify-only twin (§4.3). Both embed
// the same shared verify logic (`SHARED_VERIFY_LOGIC`).

/**
 * Shared JS source (emitted verbatim into both generated `.mjs` scripts).
 *
 * Provides, in the emitted script's scope:
 *  - `agentlocksIsGitCommit(command)` — fast, ~free `git commit` detection that
 *    tolerates `git -c …`/`env X=1 …`/`cd sub && …` prefixes, does NOT match
 *    `agentlocks commit` or `git commit` inside a quoted string (§4.1 step 3).
 *  - `agentlocksParseCommitForm(command, toolCwd)` — the commit FORM → verify
 *    args (`--include-unstaged` / `--pathspec … --pathspec-mode only|include`)
 *    plus the effective cwd for `cd <dir>`/`git -C <dir>` (§3.5a, §4 step 3b/4).
 *  - `agentlocksRunVerify(form, harnessAgentId)` — spawns `agentlocks git verify
 *    --json` in the effective cwd; returns parsed JSON or null (fail-open).
 *  - `agentlocksBuildAdvice(result, note)` — advice string for uncovered +
 *    (reliable-identity) foreign-covered paths, or null when silent (§4 step 5).
 *
 * The text below is JavaScript that lands inside the generated file; backticks
 * and `${` are escaped because this is itself a TS template literal.
 */
const SHARED_VERIFY_LOGIC = `function agentlocksTokenizeSegments(command) {
  const segments = [];
  let tokens = [];
  let current = "";
  let hasToken = false;
  let hadVar = false;
  let quote = null;
  const pushToken = () => {
    if (!hasToken) return;
    tokens.push({ text: current, hadVar });
    current = "";
    hasToken = false;
    hadVar = false;
  };
  const pushSegment = () => {
    pushToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else { current += ch; hasToken = true; }
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else { current += ch; hasToken = true; if (ch === "$" || ch === "\\\`") hadVar = true; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; hasToken = true; continue; }
    if (ch === "$" || ch === "\\\`" || ch === "~") { current += ch; hasToken = true; hadVar = true; continue; }
    if (ch === " " || ch === "\\t" || ch === "\\n" || ch === "\\r") { pushToken(); continue; }
    if (ch === "&" || ch === "|" || ch === ";" || ch === "(" || ch === ")") {
      // Two-char operators (&&, ||) collapse to the same boundary as one char.
      if ((ch === "&" || ch === "|") && command[i + 1] === ch) i++;
      pushSegment();
      continue;
    }
    current += ch;
    hasToken = true;
  }
  pushSegment();
  return segments;
}

function agentlocksIsTopLevelValueOpt(name) {
  return (
    name === "-c" ||
    name === "-C" ||
    name === "--git-dir" ||
    name === "--work-tree" ||
    name === "--namespace" ||
    name === "--exec-path" ||
    name === "--config-env"
  );
}

function agentlocksGitWord(token) {
  if (!token || token.hadVar) return false;
  const text = token.text;
  if (text === "git") return true;
  return /(^|\\/)git$/.test(text) && !text.includes(" ");
}

function agentlocksStripEnvPrefix(tokens) {
  let i = 0;
  if (tokens[i] && tokens[i].text === "env" && !tokens[i].hadVar) i++;
  while (tokens[i] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i].text)) i++;
  return i;
}

// Returns { cwdDir, dirToken } for a leading \`cd <dir>\` segment, else null.
function agentlocksCdDir(tokens) {
  if (!tokens.length) return null;
  if (tokens[0].text !== "cd" || tokens[0].hadVar) return null;
  const dir = tokens[1];
  if (!dir) return null;
  return { dirToken: dir };
}

function agentlocksGitCommitIndex(tokens) {
  // Index of the \`commit\` token in a git-commit segment, or -1.
  const start = agentlocksStripEnvPrefix(tokens);
  if (!agentlocksGitWord(tokens[start])) return { commit: -1, cIndex: -1 };
  let i = start + 1;
  let cIndex = -1;
  while (i < tokens.length) {
    const t = tokens[i];
    const text = t.text;
    if (text === "--") return { commit: -1, cIndex };
    if (text.startsWith("-")) {
      const eq = text.indexOf("=");
      const name = eq === -1 ? text : text.slice(0, eq);
      if ((name === "-C" || name === "--git-dir" || name === "--work-tree") && eq === -1) {
        if (i + 1 < tokens.length) { if (name === "-C") cIndex = i + 1; i += 2; continue; }
      }
      if (name === "-C" && eq !== -1) { cIndex = i; }
      if (agentlocksIsTopLevelValueOpt(name) && eq === -1) { i += 2; continue; }
      i += 1;
      continue;
    }
    // First non-option argument.
    if (text === "commit") return { commit: i, cIndex };
    return { commit: -1, cIndex };
  }
  return { commit: -1, cIndex };
}

function agentlocksIsGitCommit(command) {
  if (typeof command !== "string" || command.indexOf("commit") === -1) return false;
  const segments = agentlocksTokenizeSegments(command);
  for (const tokens of segments) {
    if (agentlocksGitCommitIndex(tokens).commit !== -1) return true;
  }
  return false;
}

function agentlocksIsCommitValueLong(name) {
  return (
    name === "--message" ||
    name === "--author" ||
    name === "--date" ||
    name === "--file" ||
    name === "--cleanup" ||
    name === "--gpg-sign" ||
    name === "--reuse-message" ||
    name === "--reedit-message" ||
    name === "--fixup" ||
    name === "--squash" ||
    name === "--template" ||
    name === "--pathspec-from-file" ||
    name === "--trailer"
  );
}

function agentlocksParseCommitForm(command, toolCwd) {
  const segments = agentlocksTokenizeSegments(command);
  let commitTokens = null;
  let cIndexToken = null;
  let cdToken = null;
  for (const tokens of segments) {
    const info = agentlocksGitCommitIndex(tokens);
    if (info.commit !== -1) {
      commitTokens = tokens;
      cIndexToken = info.cIndex === -1 ? null : tokens[info.cIndex];
      break;
    }
    const cd = agentlocksCdDir(tokens);
    if (cd) cdToken = cd.dirToken;
  }
  if (!commitTokens) return null;

  let all = false;
  let onlyFlag = false;
  let includeFlag = false;
  const pathspecs = [];
  const info = agentlocksGitCommitIndex(commitTokens);
  let i = info.commit + 1;
  let afterDoubleDash = false;
  while (i < commitTokens.length) {
    const text = commitTokens[i].text;
    if (afterDoubleDash) { pathspecs.push(commitTokens[i]); i++; continue; }
    if (text === "--") { afterDoubleDash = true; i++; continue; }
    if (text.startsWith("--")) {
      const eq = text.indexOf("=");
      const name = eq === -1 ? text : text.slice(0, eq);
      if (name === "--all") all = true;
      else if (name === "--only") onlyFlag = true;
      else if (name === "--include") includeFlag = true;
      else if (agentlocksIsCommitValueLong(name) && eq === -1) { i += 2; continue; }
      i += 1;
      continue;
    }
    if (text.startsWith("-") && text.length > 1) {
      // Short cluster: letters, possibly with a trailing value-taking flag.
      let consumedNext = false;
      for (let k = 1; k < text.length; k++) {
        const c = text[k];
        if (c === "a") all = true;
        else if (c === "i") includeFlag = true;
        else if (c === "o") onlyFlag = true;
        else if (c === "m" || c === "F" || c === "C" || c === "c") {
          // Value-taking: the rest of the cluster is the value, else next token.
          if (k + 1 >= text.length) consumedNext = true;
          break;
        }
      }
      i += consumedNext ? 2 : 1;
      continue;
    }
    // Bare positional → pathspec.
    pathspecs.push(commitTokens[i]);
    i += 1;
  }

  // Effective cwd: \`cd <dir>\` changes the shell dir; a later \`git -C <dir>\` resolves
  // relative to THAT. Apply cd first, then -C, so a combined prefix is correct.
  let effectiveCwd = toolCwd;
  let unparseableCwd = false;
  const agentlocksPath = require("node:path");
  if (cdToken) {
    if (cdToken.hadVar || !cdToken.text) unparseableCwd = true;
    else effectiveCwd = agentlocksPath.resolve(effectiveCwd, cdToken.text);
  }
  if (cIndexToken) {
    let dirText = cIndexToken.text;
    if (dirText.startsWith("-C=")) dirText = dirText.slice(3);
    if (cIndexToken.hadVar || !dirText) unparseableCwd = true;
    else effectiveCwd = agentlocksPath.resolve(effectiveCwd, dirText);
  }

  const hasPathspec = pathspecs.length > 0;
  let note = null;
  let pathspecMode = null;
  let pathspecValues = [];
  if (includeFlag) { pathspecMode = "include"; pathspecValues = pathspecs.map((p) => p.text); }
  else if (onlyFlag || hasPathspec) { pathspecMode = "only"; pathspecValues = pathspecs.map((p) => p.text); }

  if (unparseableCwd && pathspecMode) {
    note =
      "agentlocks: could not resolve the commit's working directory; skipping pathspec coverage check for " +
      pathspecValues.join(", ");
    pathspecMode = null;
    pathspecValues = [];
    effectiveCwd = toolCwd;
  }

  return {
    includeUnstaged: all && pathspecMode === null,
    pathspecMode,
    pathspecs: pathspecValues,
    effectiveCwd,
    note,
  };
}

function agentlocksRunVerify(form, harnessAgentId) {
  const { spawnSync } = require("node:child_process");
  const args = ["git", "verify", "--json"];
  if (form.includeUnstaged) args.push("--include-unstaged");
  if (form.pathspecMode) {
    for (const p of form.pathspecs) args.push("--pathspec", p);
    args.push("--pathspec-mode", form.pathspecMode);
  }
  const env = { ...process.env };
  if (harnessAgentId) env.AGENTLOCKS_HARNESS_AGENT_ID = harnessAgentId;
  try {
    const result = spawnSync("agentlocks", args, {
      cwd: form.effectiveCwd || process.cwd(),
      env,
      encoding: "utf8",
      timeout: 20000,
    });
    if (!result || result.error || typeof result.stdout !== "string") return null;
    const text = result.stdout.trim();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function agentlocksBuildAdvice(result, note) {
  const lines = [];
  if (note) lines.push(note);
  if (result && typeof result === "object") {
    const uncovered = Array.isArray(result.uncovered) ? result.uncovered : [];
    const foreign = Array.isArray(result.foreign_covered) ? result.foreign_covered : [];
    if (uncovered.length) {
      const paths = uncovered.map((u) => (u && u.path) || "").filter(Boolean);
      lines.push(
        "agentlocks: staged path(s) not covered by a held lock: " +
          paths.join(", ") +
          " — acquire a lock or use \\\`agentlocks commit\\\`.",
      );
      for (const u of uncovered) {
        if (u && typeof u.hint === "string" && u.hint) lines.push("  hint: " + u.hint);
      }
    }
    if (foreign.length) {
      const paths = foreign.map((f) => (f && f.path) || "").filter(Boolean);
      lines.push(
        "agentlocks: staged path(s) covered only by another agent's lock: " + paths.join(", ") + ".",
      );
    }
  }
  return lines.length ? lines.join("\\n") : null;
}`;

const CLAUDE_SHEBANG = "#!/usr/bin/env node";

/**
 * The id-injection-only Claude hook body (byte-identical to the 0.3.0 default
 * `agentlocks-agent-env.mjs`). Authored here as the single source of truth so the
 * merged commit-hook body can be assembled from the same pieces.
 */
export const CLAUDE_AGENT_ENV_HOOK_BODY = `${CLAUDE_SHEBANG}
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");

if (input.tool_name !== "Bash") process.exit(0);

const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : null;
const command = typeof toolInput?.command === "string" ? toolInput.command : "";

if (!command || !invokesAgentlocks(command)) process.exit(0);
if (
  /\\bAGENTLOCKS_HARNESS_AGENT_ID\\s*=/.test(command) ||
  /\\bAGENTLOCKS_AGENT_ID\\s*=/.test(command) ||
  /(^|\\s)--agent-id(\\s|=|$)/.test(command)
) {
  process.exit(0);
}

const sessionId =
  typeof input.session_id === "string" && input.session_id.trim()
    ? input.session_id.trim()
    : typeof process.env.CLAUDE_CODE_SESSION_ID === "string"
      ? process.env.CLAUDE_CODE_SESSION_ID.trim()
      : "";

if (!sessionId) process.exit(0);

const agentId = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
const ownerId = agentId
  ? \`claude-code:\${sessionId}:agent:\${agentId}\`
  : \`claude-code:\${sessionId}:main\`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: {
        ...toolInput,
        command: \`export AGENTLOCKS_HARNESS_AGENT_ID=\${shellQuote(ownerId)}; \${command}\`,
      },
    },
  }),
);

function invokesAgentlocks(command) {
  const direct = /(^|[;&|(){}]\\s*)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s]+\\s+)*agentlocks(?:\\s|$)/;
  const packageScript =
    /(^|[;&|(){}]\\s*)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s]+\\s+)*(?:bun|npm|pnpm)\\s+run\\s+(?:--silent\\s+)?agentlocks(?::[A-Za-z0-9:_-]+)?(?:\\s|$)/;
  return direct.test(command) || packageScript.test(command);
}

function shellQuote(value) {
  return \`'\${value.replace(/'/g, "'\\\\''")}'\`;
}
`;

/**
 * The MERGED Claude hook body: agent-id injection (gated on `invokesAgentlocks`)
 * AND the gated git-commit verify branch (run BEFORE the injection early-exit
 * so a raw `git commit` reaches verify — §4.2). One node spawn per Bash.
 */
export const CLAUDE_COMMIT_HOOK_BODY = `${CLAUDE_SHEBANG}
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const input = JSON.parse(readFileSync(0, "utf8") || "{}");

if (input.tool_name !== "Bash") process.exit(0);

const toolInput = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : null;
const command = typeof toolInput?.command === "string" ? toolInput.command : "";

if (!command) process.exit(0);

const sessionId =
  typeof input.session_id === "string" && input.session_id.trim()
    ? input.session_id.trim()
    : typeof process.env.CLAUDE_CODE_SESSION_ID === "string"
      ? process.env.CLAUDE_CODE_SESSION_ID.trim()
      : "";
const claudeAgentId = typeof input.agent_id === "string" ? input.agent_id.trim() : "";
const ownerId = sessionId
  ? claudeAgentId
    ? \`claude-code:\${sessionId}:agent:\${claudeAgentId}\`
    : \`claude-code:\${sessionId}:main\`
  : "";

// VERIFY BRANCH — independent of invokesAgentlocks so a raw \`git commit\` reaches it.
if (agentlocksIsGitCommit(command)) {
  try {
    const toolCwd =
      typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : process.cwd();
    const form = agentlocksParseCommitForm(command, toolCwd);
    if (form) {
      const result = agentlocksRunVerify(form, ownerId);
      const advice = agentlocksBuildAdvice(result, form.note);
      if (advice) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "allow",
              permissionDecisionReason: advice,
              additionalContext: advice,
            },
          }),
        );
      }
    }
  } catch {
    // Advisory only: fail open on any error.
  }
  process.exit(0);
}

// ID INJECTION — gated on invokesAgentlocks (only agentlocks commands need it).
if (!invokesAgentlocks(command)) process.exit(0);
if (
  /\\bAGENTLOCKS_HARNESS_AGENT_ID\\s*=/.test(command) ||
  /\\bAGENTLOCKS_AGENT_ID\\s*=/.test(command) ||
  /(^|\\s)--agent-id(\\s|=|$)/.test(command)
) {
  process.exit(0);
}
if (!ownerId) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      updatedInput: {
        ...toolInput,
        command: \`export AGENTLOCKS_HARNESS_AGENT_ID=\${shellQuote(ownerId)}; \${command}\`,
      },
    },
  }),
);

function invokesAgentlocks(command) {
  const direct = /(^|[;&|(){}]\\s*)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s]+\\s+)*agentlocks(?:\\s|$)/;
  const packageScript =
    /(^|[;&|(){}]\\s*)\\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s]+\\s+)*(?:bun|npm|pnpm)\\s+run\\s+(?:--silent\\s+)?agentlocks(?::[A-Za-z0-9:_-]+)?(?:\\s|$)/;
  return direct.test(command) || packageScript.test(command);
}

function shellQuote(value) {
  return \`'\${value.replace(/'/g, "'\\\\''")}'\`;
}

${SHARED_VERIFY_LOGIC}
`;

/**
 * The Codex verify-only hook body (twin of the Claude verify branch, with Codex
 * stdin/stdout I/O — §4.3). Codex resolves its identity from the inherited
 * ambient `CODEX_THREAD_ID`, so it passes no `AGENTLOCKS_HARNESS_AGENT_ID`.
 */
export const CODEX_COMMIT_HOOK_BODY = `${CLAUDE_SHEBANG}
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const input = JSON.parse(readFileSync(0, "utf8") || "{}");

const command = agentlocksExtractCommand(input);
if (!command || !agentlocksIsGitCommit(command)) process.exit(0);

try {
  const toolCwd = agentlocksExtractCwd(input);
  const form = agentlocksParseCommitForm(command, toolCwd);
  if (form) {
    const result = agentlocksRunVerify(form, "");
    const advice = agentlocksBuildAdvice(result, form.note);
    if (advice) {
      process.stdout.write(
        JSON.stringify({
          decision: "allow",
          reason: advice,
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "allow",
            permissionDecisionReason: advice,
            additionalContext: advice,
          },
        }),
      );
    }
  }
} catch {
  // Advisory only: fail open on any error.
}
process.exit(0);

function agentlocksExtractCommand(input) {
  if (!input || typeof input !== "object") return "";
  const candidates = [
    input.tool_input && input.tool_input.command,
    input.command,
    input.arguments && input.arguments.command,
    input.params && input.params.command,
    input.input && input.input.command,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return "";
}

function agentlocksExtractCwd(input) {
  const candidates = [
    input && input.cwd,
    input && input.tool_input && input.tool_input.cwd,
    input && input.params && input.params.cwd,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return process.cwd();
}

${SHARED_VERIFY_LOGIC}
`;

/** The merged (verify-enabled) Claude hook body for `init --commit-hook`. */
export function renderClaudeCommitHookScript(): string {
  return CLAUDE_COMMIT_HOOK_BODY;
}

/** The Codex verify-only hook body for `init --commit-hook --harness codex`. */
export function renderCodexCommitHookScript(): string {
  return CODEX_COMMIT_HOOK_BODY;
}
