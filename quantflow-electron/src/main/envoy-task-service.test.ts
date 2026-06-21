import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { EnvoyService, type EnvoyCliRunner } from "./envoy-service";
import { EnvoyTaskService } from "./envoy-task-service";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { closeDb } from "./runtime-state/database";
import {
  _resetForTesting as resetEnvoy,
  listEnvoyReceipts,
  listEnvoyTasks,
} from "./runtime-state/envoy-repo";
import { _resetForTesting as resetEvents, listEvents } from "./runtime-state/events-repo";
import { _resetForTesting as resetConnections, createConnection } from "./runtime-state/connections-repo";
import { installTestKernelDb, closeTestKernelDb } from "./test-kernel-db";
import { getKernelDb } from "../../../src/kernel/database";
import { queryTaskGet } from "../../../src/kernel/tasks/index";

function makeRunner(): EnvoyCliRunner {
  let taskCounter = 0;
  return async (args) => {
    if (args.includes("spaces")) {
      return { stdout: JSON.stringify({ spaces: [] }), stderr: "", exitCode: 0 };
    }
    if (args.includes("space") && args.includes("create")) {
      return { stdout: JSON.stringify({ space_id: "space-1" }), stderr: "", exitCode: 0 };
    }
    if (args.includes("task") && args.includes("create")) {
      taskCounter += 1;
      return {
        stdout: JSON.stringify({ message_id: `envoy-task-${taskCounter}` }),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: JSON.stringify({ message_id: "status-msg" }), stderr: "", exitCode: 0 };
  };
}

beforeEach(() => {
  installTestKernelDb();
  installTestRuntimeDb();
  resetEvents();
  resetConnections();
  resetEnvoy();
});

afterAll(() => {
  closeDb();
  closeTestKernelDb();
});

describe("EnvoyTaskService", () => {
  test("creates, claims, rejects second claim, updates, completes, and receipts one correlation", async () => {
    createConnection({
      id: "conn-1",
      tileAId: "hermes",
      tileBId: "codex",
    });
    const service = new EnvoyTaskService({
      envoy: new EnvoyService({ runner: makeRunner() }),
      startListener: false,
    });

    const created = await service.createTask({
      canvasId: "main",
      sourceTileId: "hermes",
      targetTileId: "codex",
      connectionId: "conn-1",
      correlationId: "corr-parent",
      title: "Proof",
      instruction: "Do the proof",
      acceptanceCriteria: ["done"],
    }) as { task: { task_id: string; correlation_id: string } };
    const taskId = created.task.task_id;
    const correlationId = created.task.correlation_id;
    expect(correlationId).toBe("corr-parent");
    expect(queryTaskGet(getKernelDb(), taskId)?.status).toBe("open");

    await service.claimTask({ taskId, claimingTileId: "codex", agentName: "Codex" });
    await expect(service.claimTask({ taskId, claimingTileId: "other" })).rejects.toThrow(/already claimed/);
    await service.updateTaskProgress({ taskId, summary: "Working", actorTileId: "codex" });
    await service.completeTask({ taskId, resultSummary: "Done", artifactPaths: ["proof.md"] });

    const [task] = listEnvoyTasks({ correlationId });
    expect(task?.status).toBe("done");
    expect(task?.claimed_by).toBe("Codex");
    expect(queryTaskGet(getKernelDb(), taskId)?.status).toBe("complete");
    expect(JSON.parse(task?.artifact_paths ?? "[]")).toEqual(["proof.md"]);
    expect(listEnvoyReceipts({ correlationId })).toHaveLength(4);
    expect(listEvents({ correlationId }).map((event) => event.kind)).toEqual([
      "envoy.task.create",
      "envoy.task.claim",
      "envoy.task.progress",
      "envoy.task.complete",
    ]);
  });

  test("validates cable endpoints unless operator override is set", async () => {
    const service = new EnvoyTaskService({
      envoy: new EnvoyService({ runner: makeRunner() }),
      startListener: false,
    });

    await expect(service.createTask({
      canvasId: "main",
      sourceTileId: "hermes",
      targetTileId: "codex",
      connectionId: "missing",
      title: "Proof",
      instruction: "Do the proof",
    })).rejects.toThrow(/Connection not found/);

    const created = await service.createTask({
      canvasId: "main",
      sourceTileId: "hermes",
      targetTileId: "codex",
      connectionId: "missing",
      title: "Proof",
      instruction: "Do the proof",
      operatorOverride: true,
    }) as { task: { task_id: string } };

    expect(created.task.task_id).toBeString();
  });

  test("retries transient Envoy share pending failures when creating tasks", async () => {
    let createAttempts = 0;
    const runner: EnvoyCliRunner = async (args) => {
      if (args.includes("spaces")) {
        return { stdout: JSON.stringify({ spaces: [] }), stderr: "", exitCode: 0 };
      }
      if (args.includes("space") && args.includes("create")) {
        return { stdout: JSON.stringify({ space_id: "space-pending" }), stderr: "", exitCode: 0 };
      }
      if (args.includes("task") && args.includes("create")) {
        createAttempts += 1;
        if (createAttempts === 1) {
          return {
            stdout: JSON.stringify({
              error_code: "SHARE_PENDING",
              error: "room share setup is still pending",
            }),
            stderr: "",
            exitCode: 1,
          };
        }
        return {
          stdout: JSON.stringify({ message_id: "envoy-task-after-retry" }),
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: JSON.stringify({ message_id: "status-msg" }), stderr: "", exitCode: 0 };
    };
    const service = new EnvoyTaskService({
      envoy: new EnvoyService({ runner }),
      startListener: false,
    });

    const created = await service.createTask({
      canvasId: "main",
      sourceTileId: "operator",
      targetTileId: "hermes",
      correlationId: "corr-retry",
      title: "Retry proof",
      instruction: "Create after room share settles.",
      operatorOverride: true,
    }) as { task: { task_id: string; envoy_task_id: string } };

    expect(createAttempts).toBe(2);
    expect(created.task.envoy_task_id).toBe("envoy-task-after-retry");
    expect(listEnvoyTasks({ correlationId: "corr-retry" })).toHaveLength(1);
    expect(listEnvoyReceipts({ correlationId: "corr-retry" })).toHaveLength(1);
  });
});
