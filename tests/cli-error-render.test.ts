import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runCli(args: string[]): Promise<CliResult> {
  return execFileAsync(process.execPath, [
    "run",
    path.join(process.cwd(), "bin", "agentlocks.ts"),
    ...args,
  ])
    .then(({ stdout, stderr }) => ({ stdout, stderr, code: 0 }))
    .catch((error: unknown) => {
      const failure = error as Partial<CliResult>;
      return {
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? "",
        code: failure.code ?? null,
      };
    });
}

test("plain CLI errors do not duplicate the agentlocks error prefix", async () => {
  const result = await runCli(["status", "--jason"]);

  expect(result.code).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("agentlocks error: unknown option '--jason'");
  expect(result.stderr).toContain("(Did you mean --json?)");
  expect(result.stderr).toContain("next: agentlocks status --json");
  expect(result.stderr).not.toContain("agentlocks error: error:");
});

test("json CLI errors expose the normalized message", async () => {
  const result = await runCli(["status", "--jason", "--json"]);
  const payload = JSON.parse(result.stdout) as { message?: unknown };

  expect(result.code).toBe(1);
  expect(result.stderr).toBe("");
  expect(payload.message).toBe("unknown option '--jason'\n(Did you mean --json?)");
});
