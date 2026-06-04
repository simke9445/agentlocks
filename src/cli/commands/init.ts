import { type InitHarness, type InitResult, renderInitResult, runInit } from "../../init";

export interface InitCommandOptions {
  check: boolean;
  json: boolean;
  verbose: boolean;
  harness: InitHarness;
  commitHook?: boolean;
}

export async function runInitCommand(options: InitCommandOptions): Promise<void> {
  const result = await runInit({
    check: options.check,
    harness: options.harness,
    // Default-on: install the commit-hook backstop unless explicitly disabled (--no-commit-hook).
    commitHook: options.commitHook !== false,
  });
  if (options.json) {
    console.log(JSON.stringify(initResultJson(result, options)));
  } else {
    console.log(renderInitResult(result));
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function initResultJson(result: InitResult, options: InitCommandOptions): Record<string, unknown> {
  if (!options.verbose) return compactInitResult(result, options);
  const { exitCode, ...rest } = result;
  return { ...rest, exit_code: exitCode };
}

function compactInitResult(
  result: InitResult,
  options: InitCommandOptions,
): Record<string, unknown> {
  return {
    kind: "init",
    ok: result.ok,
    exit_code: result.exitCode,
    check: options.check,
    harness: result.harness,
    resolved_harness: result.resolvedHarness,
    instructions_path: result.instructionsPath,
    change_count: result.changes.length,
    changes: result.changes.map((change) => ({
      path: change.path,
      action: change.action,
    })),
  };
}
