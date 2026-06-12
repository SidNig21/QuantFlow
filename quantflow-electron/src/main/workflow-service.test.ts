import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { EnvoyService, type EnvoyCliRunner } from "./envoy-service";
import { EnvoyTaskService } from "./envoy-task-service";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { closeDb } from "./runtime-state/database";
import { _resetForTesting as resetEnvoy, listEnvoyTasks } from "./runtime-state/envoy-repo";
import { _resetForTesting as resetEvents, listEvents } from "./runtime-state/events-repo";
import {
  CANVAS_SKILL_RELATIVE_PATH,
  WORKFLOW_SOURCE_TILE_ID,
  buildCodexWorkerCommand,
  buildCodexWorkerPrompt,
  buildSkillCatCommand,
  buildWorkflowActivationLine,
  createWorkflowTask,
  injectWorkflowContext,
  readCanvasSkill,
  truncateCanvasSkill,
  workflowTitleFromPrompt,
} from "./workflow-service";

async function makeVaultWithSkill(content: string): Promise<string> {
  const vaultPath = await mkdtemp(join(tmpdir(), "qf-vault-"));
  const skillPath = join(vaultPath, CANVAS_SKILL_RELATIVE_PATH);
  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, content, "utf-8");
  return vaultPath;
}

describe("truncateCanvasSkill", () => {
  test("normalizes CRLF and trims without truncating short text", () => {
    const result = truncateCanvasSkill("# Skill\r\nline two\r\n");
    expect(result).toEqual({ text: "# Skill\nline two", truncated: false });
  });

  test("truncates long text and appends a marker within the limit", () => {
    const result = truncateCanvasSkill("x".repeat(500), 120);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(120);
    expect(result.text).toEndWith("[... truncated — read the full skill file in the vault ...]");
  });
});

describe("readCanvasSkill", () => {
  test("reads the skill file from the vault", async () => {
    const vaultPath = await makeVaultWithSkill("# QuantFlow Canvas Skill\n\nqf_task_list\n");
    const skill = await readCanvasSkill({ vaultPath });
    expect(skill.path).toBe(join(vaultPath, CANVAS_SKILL_RELATIVE_PATH));
    expect(skill.text).toContain("qf_task_list");
    expect(skill.truncated).toBe(false);
  });

  test("throws a readable error when the skill file is missing", async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), "qf-vault-empty-"));
    expect(readCanvasSkill({ vaultPath }))
      .rejects.toThrow("QUANTFLOW_CANVAS_SKILL.md is not readable");
  });

  test("throws when the skill file is blank", async () => {
    const vaultPath = await makeVaultWithSkill("   \n  \n");
    expect(readCanvasSkill({ vaultPath }))
      .rejects.toThrow("is empty");
  });
});

describe("workflowTitleFromPrompt", () => {
  test("uses the first line and truncates long titles", () => {
    expect(workflowTitleFromPrompt("Fix the build\nmore detail")).toBe("Fix the build");
    const long = "y".repeat(120);
    const title = workflowTitleFromPrompt(long);
    expect(title.length).toBe(80);
    expect(title).toEndWith("...");
  });
});

function makeRunner(): EnvoyCliRunner {
  return async (args) => {
    if (args.includes("spaces")) {
      return { stdout: JSON.stringify({ spaces: [] }), stderr: "", exitCode: 0 };
    }
    if (args.includes("space") && args.includes("create")) {
      return { stdout: JSON.stringify({ space_id: "space-wf" }), stderr: "", exitCode: 0 };
    }
    if (args.includes("task") && args.includes("create")) {
      return { stdout: JSON.stringify({ message_id: "envoy-task-wf" }), stderr: "", exitCode: 0 };
    }
    return { stdout: JSON.stringify({ message_id: "status-msg" }), stderr: "", exitCode: 0 };
  };
}

function makeTaskService(): EnvoyTaskService {
  return new EnvoyTaskService({
    envoy: new EnvoyService({ runner: makeRunner() }),
    startListener: false,
  });
}

describe("createWorkflowTask", () => {
  beforeEach(() => {
    installTestRuntimeDb();
    resetEvents();
    resetEnvoy();
  });

  afterAll(() => {
    closeDb();
  });

  test("creates an operator-sourced Envoy task before any spawn", async () => {
    const result = await createWorkflowTask(
      { canvasId: "main", prompt: "Ship the workflow slice\nDetails here." },
      makeTaskService(),
    );

    expect(result.title).toBe("Ship the workflow slice");
    expect(result.correlationId).toMatch(/.+/);
    expect(result.envoySpaceId).toBe("space-wf");

    const tasks = listEnvoyTasks({ canvasId: "main" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].source_tile_id).toBe(WORKFLOW_SOURCE_TILE_ID);
    expect(tasks[0].instruction).toBe("Ship the workflow slice\nDetails here.");
    expect(tasks[0].status).toBe("inbox");
    expect(tasks[0].correlation_id).toBe(result.correlationId);

    const kinds = listEvents({ correlationId: result.correlationId })
      .map((event) => event.kind);
    expect(kinds).toContain("envoy.task.create");
    expect(kinds).toContain("workflow.task.created");
  });

  test("rejects an empty prompt without touching Envoy", async () => {
    expect(createWorkflowTask({ prompt: "   " }, makeTaskService()))
      .rejects.toThrow("non-empty prompt");
    expect(listEnvoyTasks({})).toHaveLength(0);
  });
});

describe("buildSkillCatCommand", () => {
  test("prints the skill with a single-line cat command in WSL", () => {
    const command = buildSkillCatCommand(
      "C:\\Users\\rybow\\Obsidian\\Cursor Collab\\Projects\\QuantFlow\\QUANTFLOW_CANVAS_SKILL.md",
    );
    expect(command).toBe(
      "cat '/mnt/c/Users/rybow/Obsidian/Cursor Collab/Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md'",
    );
  });

  test("throws when the path cannot be converted to WSL", () => {
    expect(() => buildSkillCatCommand("/posix/only/path.md"))
      .toThrow("Cannot convert skill path to WSL");
  });
});

describe("worker activation prompts", () => {
  const skillPath = "C:\\Users\\rybow\\Obsidian\\Cursor Collab\\Projects\\QuantFlow\\QUANTFLOW_CANVAS_SKILL.md";

  test("includes Envoy space and worker tile id in workflow activation lines", () => {
    const line = buildWorkflowActivationLine({
      taskId: "task-1",
      correlationId: "corr-1",
      canvasId: "canvas-1",
      envoySpaceId: "space-1",
      claimingTileId: "tile-codex",
      skillPath,
    });

    expect(line).toContain("task_id=task-1");
    expect(line).toContain("correlation_id=corr-1");
    expect(line).toContain("canvas_id=canvas-1");
    expect(line).toContain("envoy_space_id=space-1");
    expect(line).toContain("claiming_tile_id=tile-codex");
    expect(line).toContain("/mnt/c/Users/rybow/Obsidian/Cursor Collab/Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md");
  });

  test("builds a Codex command that carries task context as the launch prompt", () => {
    const prompt = buildCodexWorkerPrompt({
      taskId: "task-1",
      correlationId: "corr-1",
      canvasId: "canvas-1",
      envoySpaceId: "space-1",
      claimingTileId: "tile-codex",
      skillPath,
    });
    const command = buildCodexWorkerCommand({
      command: "codex",
      taskId: "task-1",
      correlationId: "corr-1",
      canvasId: "canvas-1",
      envoySpaceId: "space-1",
      claimingTileId: "tile-codex",
      skillPath,
    });

    expect(prompt).toContain("qf_task_claim");
    expect(prompt).toContain("Do not wait for terminal instructions");
    expect(command).toContain(" exec ");
    expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(command).toContain("--skip-git-repo-check");
    expect(command).toContain("mcp_servers.quantflow.command");
    expect(command).toContain("tools\\\\quantflow-mcp\\\\server.js");
    expect(command).toContain("task_id=task-1");
    expect(command).toContain("canvas_id=canvas-1");
    expect(command).toContain("claiming_tile_id=tile-codex");
  });
});

describe("injectWorkflowContext", () => {
  const NO_DELAYS = {
    paneReady: 0,
    promptTimeout: 5000,
    promptSettle: 0,
  };

  beforeEach(() => {
    installTestRuntimeDb();
    resetEvents();
    resetEnvoy();
  });

  function makeRpc(readPayload: unknown = {
    read: { text: "Welcome to Hermes Agent! Type your message or /help.\n❯" },
  }) {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const rpc = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push({ method, params });
      if (method === "pane.read") return readPayload;
      return {};
    }) as Parameters<typeof injectWorkflowContext>[1];
    return { rpc, calls };
  }

  test("when agent already launched, injects activation after prompt-ready wait", async () => {
    const vaultPath = await makeVaultWithSkill("# QuantFlow Canvas Skill\nqf_task_claim\n");
    const { rpc, calls } = makeRpc();

    const result = await injectWorkflowContext(
      {
        herdrPaneId: "pane-7",
        taskId: "task-1",
        correlationId: "corr-abc",
        vaultPath,
        agentAlreadyLaunched: true,
      },
      rpc,
      NO_DELAYS,
    );

    const sends = calls.filter((call) => call.method === "pane.send_text");
    expect(sends).toHaveLength(1);
    expect(String(sends[0].params.text)).toContain("correlation_id=corr-abc");
    expect(String(sends[0].params.text)).toContain("task_id=task-1");
    expect(calls.some((call) => call.method === "pane.read")).toBe(true);

    expect(result.activationLine).toBe(buildWorkflowActivationLine({
      correlationId: "corr-abc",
      taskId: "task-1",
      skillPath: result.skillPath,
    }));

    const kinds = listEvents({ correlationId: "corr-abc" }).map((event) => event.kind);
    expect(kinds).toContain("workflow.context.injected");
    expect(kinds).toContain("workflow.activated");
  });

  test("launches the agent when spawn left the pane at a shell prompt", async () => {
    const vaultPath = await makeVaultWithSkill("# Skill\n");
    const { rpc, calls } = makeRpc();

    await injectWorkflowContext(
      {
        herdrPaneId: "pane-7",
        taskId: "task-1",
        correlationId: "corr-abc",
        vaultPath,
        command: "hermes --canvas",
      },
      rpc,
      NO_DELAYS,
    );

    const sends = calls.filter((call) => call.method === "pane.send_text");
    expect(sends[0].params.text).toBe("hermes --canvas");
    expect(sends).toHaveLength(2);
  });

  test("rejects missing pane or ids before any pane writes", async () => {
    const { rpc, calls } = makeRpc();
    expect(injectWorkflowContext(
      { herdrPaneId: "", taskId: "t", correlationId: "c" },
      rpc,
      NO_DELAYS,
    )).rejects.toThrow("requires herdrPaneId");
    expect(calls).toHaveLength(0);
  });
});
