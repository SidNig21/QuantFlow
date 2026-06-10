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
  buildSkillDisplayCommand,
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

describe("buildSkillDisplayCommand", () => {
  test("wraps the skill in a quoted no-op heredoc so bash executes nothing", () => {
    const command = buildSkillDisplayCommand("# Skill\nrm -rf / # would be fatal if run");
    expect(command.startsWith(": <<'QF_CANVAS_SKILL'\n")).toBe(true);
    expect(command.endsWith("\nQF_CANVAS_SKILL")).toBe(true);
    expect(command).toContain("# Skill");
  });

  test("drops lines that would terminate the heredoc early", () => {
    const command = buildSkillDisplayCommand("a\nQF_CANVAS_SKILL\nb");
    expect(command).toBe(": <<'QF_CANVAS_SKILL'\na\nb\nQF_CANVAS_SKILL");
  });
});

describe("injectWorkflowContext", () => {
  const NO_DELAYS = { render: 0, startup: 0 };

  beforeEach(() => {
    installTestRuntimeDb();
    resetEvents();
    resetEnvoy();
  });

  function makeRpc() {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const rpc = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push({ method, params });
      return {};
    }) as Parameters<typeof injectWorkflowContext>[1];
    return { rpc, calls };
  }

  test("sends skill, command, then activation line with the correlation id", async () => {
    const vaultPath = await makeVaultWithSkill("# QuantFlow Canvas Skill\nqf_task_claim\n");
    const { rpc, calls } = makeRpc();

    const result = await injectWorkflowContext(
      {
        herdrPaneId: "pane-7",
        taskId: "task-1",
        correlationId: "corr-abc",
        vaultPath,
      },
      rpc,
      NO_DELAYS,
    );

    const sends = calls.filter((call) => call.method === "pane.send_text");
    expect(sends).toHaveLength(3);
    expect(sends.every((call) => call.params.pane_id === "pane-7")).toBe(true);
    expect(String(sends[0].params.text)).toContain("QuantFlow Canvas Skill");
    expect(String(sends[0].params.text)).toStartWith(": <<'QF_CANVAS_SKILL'");
    expect(sends[1].params.text).toBe("hermes");
    expect(String(sends[2].params.text)).toContain("correlation_id=corr-abc");
    expect(String(sends[2].params.text)).toContain("task_id=task-1");

    // Each send_text is followed by an Enter keypress.
    const methods = calls.map((call) => call.method);
    expect(methods).toEqual([
      "pane.send_text", "pane.send_keys",
      "pane.send_text", "pane.send_keys",
      "pane.send_text", "pane.send_keys",
    ]);

    expect(result.activationLine).toBe(buildWorkflowActivationLine({
      correlationId: "corr-abc",
      taskId: "task-1",
      skillPath: result.skillPath,
    }));

    const kinds = listEvents({ correlationId: "corr-abc" }).map((event) => event.kind);
    expect(kinds).toContain("workflow.context.injected");
    expect(kinds).toContain("workflow.activated");
  });

  test("uses the provided agent command", async () => {
    const vaultPath = await makeVaultWithSkill("# Skill\n");
    const { rpc, calls } = makeRpc();
    await injectWorkflowContext(
      {
        herdrPaneId: "pane-7",
        taskId: "task-1",
        correlationId: "corr-abc",
        command: "hermes --canvas",
        vaultPath,
      },
      rpc,
      NO_DELAYS,
    );
    const sends = calls.filter((call) => call.method === "pane.send_text");
    expect(sends[1].params.text).toBe("hermes --canvas");
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
