import { Command, CommanderError, InvalidArgumentError, type OutputConfiguration } from "commander";
import packageJson from "../../package.json";
import type { InitHarness } from "../init";
import { type LockCommand, LockCommandError } from "../locks/types";
import type { CapabilitiesCommandOptions } from "./capabilities";
import type { InitCommandOptions } from "./commands/init";
import type { WrappedCommand } from "./commands/wrapped";
import type { DoctorCommandOptions } from "./doctor";
import type { RobotDocsCommandOptions } from "./robot-docs";

export type CliCommand =
  | { kind: "lock"; command: LockCommand }
  | { kind: "wrapped"; command: WrappedCommand }
  | { kind: "init"; options: InitCommandOptions }
  | { kind: "capabilities"; options: CapabilitiesCommandOptions }
  | { kind: "robot-docs"; options: RobotDocsCommandOptions }
  | { kind: "doctor"; options: DoctorCommandOptions };

export interface ParsedCli {
  help: boolean;
  helpText?: string;
  command?: CliCommand;
}

interface LockOutputOptions {
  json?: boolean;
  idOnly?: boolean;
  verbose?: boolean;
}

interface LockAcquireOptions extends LockOutputOptions {
  glob?: string[];
  reason: string;
  ttlMs?: number;
  agentId?: string;
  reclaim?: boolean;
}

interface LockExpandOptions extends LockOutputOptions {
  lock: string;
  glob?: string[];
  reason?: string;
  ttlMs?: number;
  agentId?: string;
}

interface LockRefreshOptions extends LockOutputOptions {
  lock?: string[];
  ttlMs?: number;
  agentId?: string;
  mine?: boolean;
}

interface LockReleaseOptions extends LockOutputOptions {
  lock?: string[];
  agentId?: string;
  mine?: boolean;
}

interface LockStatusOptions extends LockOutputOptions {
  glob?: string[];
  mine?: boolean;
}

interface LockGitVerifyOptions extends LockOutputOptions {
  staged?: boolean;
  includeUnstaged?: boolean;
  pathspec?: string[];
  pathspecMode?: "only" | "include";
}

interface LockIdentifyOptions extends LockOutputOptions {
  agentId?: string;
}

interface LockPruneOptions extends LockOutputOptions {
  dryRun?: boolean;
}

interface LockGitBeginOptions extends LockOutputOptions {
  reason: string;
  refreshLock?: string[];
  ttlMs?: number;
  agentId?: string;
}

interface LockGitEndOptions extends LockOutputOptions {
  lock?: string[];
  releaseLock?: string[];
  agentId?: string;
  gitToken?: string;
}

interface InitCliOptions {
  check?: boolean;
  json?: boolean;
  verbose?: boolean;
  harness?: InitHarness;
  // commander sets this to `false` only when `--no-commit-hook` is passed (default-on).
  commitHook?: boolean;
}

interface WrappedRunOptions {
  glob?: string[];
  reason: string;
  ttlMs?: number;
  agentId?: string;
}

interface WrappedCommitOptions {
  glob?: string[];
  reason: string;
  ttlMs?: number;
  agentId?: string;
  message?: string;
  keep?: boolean;
}

export function parseCliArgs(argv: string[]): ParsedCli {
  let parsedCommand: CliCommand | undefined;
  let helpBuffer = "";
  const { effectiveArgv, childArgv } = splitWrappedChild(argv);
  const program = createProgram((command) => {
    parsedCommand = childArgv !== undefined ? withChildArgv(command, childArgv) : command;
  });
  configureOutputTree(program, {
    writeOut: (text: string) => {
      helpBuffer += text;
    },
    writeErr: (text: string) => {
      helpBuffer += text;
    },
  });

  try {
    program.parse(normalizeHelpAlias(effectiveArgv), { from: "user" });
  } catch (error) {
    // commander.helpDisplayed = explicit --help; commander.help = bare invocation or a
    // command group with no subcommand (`agentlocks`, `robot-docs`, `git`); commander.version
    // = --version. All three are informational, not errors — return the buffered text so main
    // prints it and exits 0, instead of leaking commander's "(outputHelp)" sentinel as an error.
    if (
      error instanceof CommanderError &&
      (error.code === "commander.helpDisplayed" ||
        error.code === "commander.help" ||
        error.code === "commander.version")
    ) {
      return { help: true, helpText: helpBuffer || program.helpInformation() };
    }
    throw error;
  }

  return parsedCommand
    ? { help: false, command: parsedCommand }
    : { help: true, helpText: helpText() };
}

export function helpText(): string {
  return createProgram().helpInformation();
}

function createProgram(onCommand?: (command: CliCommand) => void): Command {
  const program = new Command()
    .name("agentlocks")
    .description("Local advisory locking for shared repository worktrees.")
    .version(packageJson.version, "-V, --version", "Print the agentlocks version and exit.")
    .showHelpAfterError()
    .allowExcessArguments(false)
    .exitOverride()
    .enablePositionalOptions();

  addLockCommands(program, onCommand);
  addWrappedCommands(program, onCommand);
  addInitCommand(program, onCommand);
  addCapabilitiesCommand(program, onCommand);
  addRobotDocsCommand(program, onCommand);
  addDoctorCommand(program, onCommand);
  return program;
}

function addLockCommands(program: Command, onCommand?: (command: CliCommand) => void): void {
  addLockOutputOptions(
    program
      .command("acquire")
      .description("Acquire advisory locks for paths or globs.")
      .argument("[paths...]", "Repo-relative file paths.")
      .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
      .requiredOption("--reason <text>", "Human-readable lock intent.")
      .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .option(
        "--reclaim",
        "Reclaim overlapping locks first when every conflict is already reclaimable, then acquire in one command.",
      )
      .allowExcessArguments(false),
  ).action((paths: string[], _options: LockAcquireOptions, command: Command) => {
    const options = command.opts<LockAcquireOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "acquire",
          paths,
          globs: options.glob ?? [],
          reason: options.reason,
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          ...(options.reclaim ? { reclaimConflicts: true } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("expand")
      .description("Atomically add paths or globs to an existing lock.")
      .argument("[paths...]", "Repo-relative file paths.")
      .requiredOption("--lock <lock_id>", "Lock id.")
      .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
      .option("--reason <text>", "Ignored note accepted for acquire/expand command symmetry.")
      .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .allowExcessArguments(false),
  ).action((paths: string[], _options: LockExpandOptions, command: Command) => {
    const options = command.opts<LockExpandOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "expand",
          lockId: options.lock,
          paths,
          globs: options.glob ?? [],
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("refresh")
      .description("Refresh a held lock lease.")
      .argument("[locks...]", "Lock ids; equivalent to repeatable --lock.")
      .option("--lock <lock_id>", "Lock id; repeatable.", collectValues, [])
      .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .option("--mine", "Refresh every lock you hold (no ids); requires a stable identity.")
      .allowExcessArguments(false),
  ).action((locks: string[], _options: LockRefreshOptions, command: Command) => {
    const options = command.opts<LockRefreshOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "refresh",
          lockIds: mergeLockIds(options.lock, locks),
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          ...(options.mine ? { mine: true } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("release")
      .description("Release a held lock.")
      .argument("[locks...]", "Lock ids; equivalent to repeatable --lock.")
      .option("--lock <lock_id>", "Lock id; repeatable.", collectValues, [])
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .option("--mine", "Release every lock you hold (no ids); requires a stable identity.")
      .allowExcessArguments(false),
  ).action((locks: string[], _options: LockReleaseOptions, command: Command) => {
    const options = command.opts<LockReleaseOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "release",
          lockIds: mergeLockIds(options.lock, locks),
          agentId: options.agentId ?? null,
          ...(options.mine ? { mine: true } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("status")
      .description("Show active locks, optionally filtered by requested resources.")
      .argument("[paths...]", "Repo-relative file paths.")
      .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
      .option("--mine", "Show only the locks you hold.")
      .allowExcessArguments(false),
  ).action((paths: string[], _options: LockStatusOptions, command: Command) => {
    const options = command.opts<LockStatusOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "status",
          paths,
          globs: options.glob ?? [],
          ...(options.mine ? { mine: true } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("board")
      .description(
        "Show active locks grouped by agent, with each lock's lease state and next step.",
      )
      .argument("[paths...]", "Repo-relative file paths.")
      .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
      .option("--mine", "Show only the locks you hold.")
      .allowExcessArguments(false),
  ).action((paths: string[], _options: LockStatusOptions, command: Command) => {
    const options = command.opts<LockStatusOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "board",
          paths,
          globs: options.glob ?? [],
          ...(options.mine ? { mine: true } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("prune")
      .description("Remove reclaimable expired locks.")
      .option("--dry-run", "Print reclaimable locks without deleting them.")
      .allowExcessArguments(false),
  ).action((_options: LockPruneOptions, command: Command) => {
    const options = command.opts<LockPruneOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "prune",
          dryRun: Boolean(options.dryRun),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    program
      .command("identify")
      .description("Show detected lock agent identity.")
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .allowExcessArguments(false),
  ).action((_options: LockIdentifyOptions, command: Command) => {
    const options = command.opts<LockIdentifyOptions>();
    if (options.idOnly) {
      throw new LockCommandError(
        "--id-only is not supported for identify; use `agentlocks identify --json`.",
        2,
        "unsupported_output_option",
      );
    }
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "identify",
          agentId: options.agentId ?? null,
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  const git = program.command("git").description("Coordinate shared Git index operations.");
  addLockOutputOptions(
    git
      .command("begin")
      .description("Acquire the synthetic @git/index lock.")
      .requiredOption("--reason <text>", "Human-readable commit intent.")
      .option(
        "--refresh-lock <lock_id>",
        "Held file lock to refresh first; repeatable.",
        collectValues,
        [],
      )
      .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .allowExcessArguments(false),
  ).action((_options: LockGitBeginOptions, command: Command) => {
    const options = command.opts<LockGitBeginOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "git-begin",
          reason: options.reason,
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          refreshLockIds: options.refreshLock ?? [],
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    git
      .command("end")
      .description("Release the synthetic @git/index lock.")
      .argument("[locks...]", "Git/index lock ids; equivalent to repeatable --lock.")
      .option("--lock <lock_id>", "Git/index lock id; repeatable.", collectValues, [])
      .option(
        "--release-lock <lock_id>",
        "Held file lock to release after git lock; repeatable.",
        collectValues,
        [],
      )
      .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
      .option("--git-token <token>", "Fence token from `git begin`; re-checked before release.")
      .allowExcessArguments(false),
  ).action((locks: string[], _options: LockGitEndOptions, command: Command) => {
    const options = command.opts<LockGitEndOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "git-end",
          lockIds: mergeLockIds(options.lock, locks),
          releaseLockIds: options.releaseLock ?? [],
          agentId: options.agentId ?? null,
          ...(options.gitToken !== undefined ? { gitToken: options.gitToken } : {}),
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });

  addLockOutputOptions(
    git
      .command("verify")
      .description("Advisory check: are staged paths covered by a held lock? (never blocks)")
      .option("--staged", "Verify the staged index (default).")
      .option(
        "--include-unstaged",
        "Also include tracked-but-unstaged changes (for `git commit -a`).",
      )
      .option(
        "--pathspec <path>",
        "Restrict/extend to a pathspec; repeatable (for pathspec commits).",
        collectValues,
        [],
      )
      .option(
        "--pathspec-mode <mode>",
        "How a pathspec applies: only | include.",
        parsePathspecMode,
      )
      .allowExcessArguments(false),
  ).action((_options: LockGitVerifyOptions, command: Command) => {
    const options = command.opts<LockGitVerifyOptions>();
    onCommand?.({
      kind: "lock",
      command: withLockVerbose(
        {
          name: "git-verify",
          includeUnstaged: Boolean(options.includeUnstaged),
          pathspec: options.pathspec ?? [],
          pathspecMode: options.pathspecMode ?? null,
          json: Boolean(options.json),
          idOnly: Boolean(options.idOnly),
        },
        options,
      ),
    });
  });
}

function addWrappedCommands(program: Command, onCommand?: (command: CliCommand) => void): void {
  addWrappedRun(
    program,
    "run",
    "Acquire locks for paths, run a command after --, then release.",
    onCommand,
  );
  addWrappedRun(
    program,
    "edit",
    "Acquire locks for paths and run a command after --, keeping the lock for later turns.",
    onCommand,
  );

  program
    .command("commit")
    .description("Lock paths and the Git index, stage and commit only those paths, then release.")
    .argument("[paths...]", "Repo-relative file paths to lock and commit.")
    .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
    .requiredOption("--reason <text>", "Human-readable commit intent.")
    .option("-m, --message <text>", "Commit message passed to git commit -m.")
    .option("--keep", "Keep the file lock after committing.")
    .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
    .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
    .allowExcessArguments(false)
    .action((paths: string[], _options: WrappedCommitOptions, command: Command) => {
      const options = command.opts<WrappedCommitOptions>();
      onCommand?.({
        kind: "wrapped",
        command: {
          name: "commit",
          paths,
          globs: options.glob ?? [],
          reason: options.reason,
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          message: options.message ?? null,
          keep: Boolean(options.keep),
        },
      });
    });
}

function addWrappedRun(
  program: Command,
  name: "run" | "edit",
  description: string,
  onCommand?: (command: CliCommand) => void,
): void {
  program
    .command(name)
    .description(description)
    .argument("[paths...]", "Repo-relative file paths to lock.")
    .option("--glob <pattern>", "Repo-relative glob; repeatable.", collectValues, [])
    .requiredOption("--reason <text>", "Human-readable lock intent.")
    .option("--ttl-ms <n>", "Lease length in milliseconds.", parseInteger)
    .option("--agent-id <id>", "Explicit agent id for unsupported harness or recovery.")
    .allowExcessArguments(false)
    .action((paths: string[], _options: WrappedRunOptions, command: Command) => {
      const options = command.opts<WrappedRunOptions>();
      onCommand?.({
        kind: "wrapped",
        command: {
          name,
          paths,
          globs: options.glob ?? [],
          reason: options.reason,
          ttlMs: options.ttlMs ?? null,
          agentId: options.agentId ?? null,
          argv: [],
        },
      });
    });
}

function addInitCommand(program: Command, onCommand?: (command: CliCommand) => void): void {
  program
    .command("init")
    .description("Initialize Agentlocks support files in the host repository.")
    .option("--check", "Report required changes without writing.")
    .option(
      "--harness <name>",
      "Agent harness for generated support files: auto, codex, or claude-code.",
      parseInitHarness,
      "auto",
    )
    .option("--json", "Print machine-readable output.")
    .option("--verbose", "Include full init JSON details.")
    .option(
      "--no-commit-hook",
      "Skip the PreToolUse commit-hook backstop (installed by default for the resolved harness).",
    )
    .allowExcessArguments(false)
    .action((_options: InitCliOptions, command: Command) => {
      const options = command.opts<InitCliOptions>();
      onCommand?.({
        kind: "init",
        options: {
          check: Boolean(options.check),
          json: Boolean(options.json),
          verbose: Boolean(options.verbose),
          harness: options.harness ?? "auto",
          commitHook: options.commitHook !== false,
        },
      });
    });
}

function addCapabilitiesCommand(program: Command, onCommand?: (command: CliCommand) => void): void {
  program
    .command("capabilities")
    .description("Print the machine-readable CLI contract.")
    .option("--json", "Print machine-readable output.")
    .allowExcessArguments(false)
    .action((_options: CapabilitiesCommandOptions, command: Command) => {
      const options = command.opts<CapabilitiesCommandOptions>();
      onCommand?.({
        kind: "capabilities",
        options: {
          json: Boolean(options.json),
        },
      });
    });
}

function addRobotDocsCommand(program: Command, onCommand?: (command: CliCommand) => void): void {
  const robotDocs = program.command("robot-docs").description("Print agent-oriented CLI docs.");
  robotDocs
    .command("guide")
    .description("Print the concise agent workflow guide.")
    .allowExcessArguments(false)
    .action(() => {
      onCommand?.({
        kind: "robot-docs",
        options: {
          topic: "guide",
        },
      });
    });
}

function addDoctorCommand(program: Command, onCommand?: (command: CliCommand) => void): void {
  program
    .command("doctor")
    .description("Run read-only Agentlocks health checks.")
    .option("--json", "Print machine-readable output.")
    .option("--verbose", "Include full check details.")
    .allowExcessArguments(false)
    .action((_options: DoctorCommandOptions, command: Command) => {
      const options = command.opts<DoctorCommandOptions>();
      onCommand?.({
        kind: "doctor",
        options: {
          json: Boolean(options.json),
          verbose: Boolean(options.verbose),
        },
      });
    });
}

function addLockOutputOptions(command: Command): Command {
  return command
    .option("--json", "Print machine-readable output.")
    .option("--id-only", "Print only affected lock ids on success.")
    .option("--verbose", "Include full lock resource/status details.");
}

function withLockVerbose<const T extends object>(
  command: T,
  options: LockOutputOptions,
): T & { verbose?: true } {
  return options.verbose ? { ...command, verbose: true } : command;
}

function parseInteger(value: string, previous: unknown): number {
  if (typeof previous === "number") return previous;
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError(`Expected a positive integer, got ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseInitHarness(value: string): InitHarness {
  if (value === "auto" || value === "codex" || value === "claude-code") return value;
  throw new InvalidArgumentError(`Expected auto, codex, or claude-code, got ${value}`);
}

function parsePathspecMode(value: string): "only" | "include" {
  if (value === "only" || value === "include") return value;
  throw new InvalidArgumentError(`Expected only or include, got ${value}`);
}

function mergeLockIds(optionLocks: string[] | undefined, positional: string[]): string[] {
  return [...new Set([...(positional ?? []), ...(optionLocks ?? [])])];
}

function splitWrappedChild(argv: string[]): { effectiveArgv: string[]; childArgv?: string[] } {
  if (argv[0] !== "run" && argv[0] !== "edit") return { effectiveArgv: argv };
  const separator = argv.indexOf("--");
  if (separator === -1) return { effectiveArgv: argv };
  return { effectiveArgv: argv.slice(0, separator), childArgv: argv.slice(separator + 1) };
}

function withChildArgv(command: CliCommand, childArgv: string[]): CliCommand {
  if (
    command.kind === "wrapped" &&
    (command.command.name === "run" || command.command.name === "edit")
  ) {
    return { kind: "wrapped", command: { ...command.command, argv: childArgv } };
  }
  return command;
}

function normalizeHelpAlias(argv: string[]): string[] {
  if (argv[0] === "help" && argv[1]) return [...argv.slice(1), "--help"];
  if (argv[0] === "git" && argv[1] === "help" && argv[2]) {
    return ["git", argv[2], "--help", ...argv.slice(3)];
  }
  return argv;
}

function configureOutputTree(command: Command, output: OutputConfiguration): void {
  command.configureOutput(output);
  for (const child of command.commands) configureOutputTree(child, output);
}
