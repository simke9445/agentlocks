import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createClaudeCodeSessionProbe,
  createHarnessSessionProbe,
  type LockOwner,
} from "../src/index";

function claudeOwner(sessionId: string, cwd: string): LockOwner {
  return {
    agentId: `claude-code:${sessionId}`,
    hostname: "host",
    pid: 4242,
    cwd,
    source: "harness:claude-code:CLAUDE_CODE_SESSION_ID",
    harness: "claude-code",
    harnessScope: "session",
    rawSessionId: sessionId,
  };
}

async function withProjects(fn: (projectsDir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lockpick-claude-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeTranscript(
  projectsDir: string,
  encodedDir: string,
  sessionId: string,
): Promise<number> {
  const projectSub = path.join(projectsDir, encodedDir);
  await mkdir(projectSub, { recursive: true });
  const transcript = path.join(projectSub, `${sessionId}.jsonl`);
  await writeFile(transcript, "{}\n", "utf8");
  return (await stat(transcript)).mtimeMs;
}

test("claude-code probe classifies transcript freshness", async () => {
  await withProjects(async (projectsDir) => {
    const cwd = "/Users/dev/project";
    const sessionId = "11111111-2222-3333-4444-555555555555";
    const mtime = await writeTranscript(projectsDir, "-Users-dev-project", sessionId);
    const probe = createClaudeCodeSessionProbe({ projectsDir, staleMs: 300_000, env: {} });

    expect((await probe(claudeOwner(sessionId, cwd), new Date(mtime + 1_000))).status).toBe("live");
    expect((await probe(claudeOwner(sessionId, cwd), new Date(mtime + 600_000))).status).toBe(
      "unknown",
    );
    expect(
      (await probe(claudeOwner("99999999-0000-0000-0000-000000000000", cwd), new Date(mtime)))
        .status,
    ).toBe("dead");
  });
});

test("claude-code probe scans project dirs and reports unknown when the home is absent", async () => {
  await withProjects(async (projectsDir) => {
    const sessionId = "aaaa1111-2222-3333-4444-555555555555";
    const mtime = await writeTranscript(projectsDir, "-totally-different-encoding", sessionId);
    const probe = createClaudeCodeSessionProbe({ projectsDir, env: {} });
    const found = await probe(
      claudeOwner(sessionId, "/Users/dev/elsewhere"),
      new Date(mtime + 1_000),
    );
    expect(found.status).toBe("live");
  });

  const missingHome = createClaudeCodeSessionProbe({
    projectsDir: path.join(os.tmpdir(), "lockpick-claude-absent-xyz"),
    env: {},
  });
  const owner = claudeOwner("bbbb1111-2222-3333-4444-555555555555", "/Users/dev/project");
  expect((await missingHome(owner, new Date())).status).toBe("unknown");

  const noSession: LockOwner = {
    agentId: "claude-code:",
    hostname: "host",
    pid: 1,
    cwd: "/Users/dev/project",
    source: "fallback",
  };
  const probe = createClaudeCodeSessionProbe({ projectsDir: os.tmpdir(), env: {} });
  expect((await probe(noSession, new Date())).status).toBe("unknown");
});

test("harness probe dispatches claude transcript and falls through for generic owners", async () => {
  await withProjects(async (projectsDir) => {
    const cwd = "/Users/dev/proj2";
    const sessionId = "cccc1111-2222-3333-4444-555555555555";
    const mtime = await writeTranscript(projectsDir, "-Users-dev-proj2", sessionId);
    const probe = createHarnessSessionProbe({ claude: { projectsDir, env: {} } });

    expect((await probe(claudeOwner(sessionId, cwd), new Date(mtime + 1_000))).status).toBe("live");

    const generic: LockOwner = {
      agentId: "lockpick:host:1",
      hostname: "host",
      pid: 1,
      cwd,
      source: "fallback",
      harness: "lockpick",
      harnessScope: "fallback",
    };
    expect((await probe(generic, new Date(mtime + 1_000))).status).toBe("unknown");
  });
});
