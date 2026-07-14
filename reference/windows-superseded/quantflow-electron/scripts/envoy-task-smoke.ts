import { EnvoyTaskService } from "../src/main/envoy-task-service";
import { installTestRuntimeDb } from "../src/main/runtime-state/test-sqlite-adapter";
import { closeDb } from "../src/main/runtime-state/database";
import { listEnvoyReceipts, listEnvoyTasks } from "../src/main/runtime-state/envoy-repo";
import { listEvents } from "../src/main/runtime-state/events-repo";
import { installTestKernelDb, closeTestKernelDb } from "../src/main/test-kernel-db";
import { getKernelDb } from "../../src/kernel/database";
import { queryTaskGet } from "../../src/kernel/tasks/index";

async function main(): Promise<void> {
  installTestKernelDb();
  installTestRuntimeDb();

  const service = new EnvoyTaskService({ startListener: false });
  const canvasId = "qf-envoy-smoke";

  try {
    const created = await service.createTask({
      canvasId,
      sourceTileId: "hermes-smoke",
      targetTileId: "codex-smoke",
      connectionId: "conn-smoke",
      title: "Envoy task bus smoke proof",
      instruction: "Create a deterministic proof that claim locking and receipts work.",
      acceptanceCriteria: [
        "task can be created",
        "task can be claimed once",
        "second claim is rejected",
        "task can be completed",
        "receipts share one correlation_id",
      ],
      operatorOverride: true,
    }) as { task: { task_id: string; correlation_id: string } };

    const taskId = created.task.task_id;
    const correlationId = created.task.correlation_id;

    await service.claimTask({
      taskId,
      claimingTileId: "codex-smoke",
      agentName: "Codex Smoke",
    });

    let secondClaimRejected = false;
    try {
      await service.claimTask({
        taskId,
        claimingTileId: "other-smoke",
        agentName: "Other Smoke",
      });
    } catch {
      secondClaimRejected = true;
    }

    await service.updateTaskProgress({
      taskId,
      summary: "Smoke task is in progress.",
      actorTileId: "codex-smoke",
      agentName: "Codex Smoke",
    });

    await service.completeTask({
      taskId,
      resultSummary: "Smoke task complete.",
      artifactPaths: ["envoy-task-smoke.ts"],
      actorTileId: "codex-smoke",
      agentName: "Codex Smoke",
    });

    const tasks = listEnvoyTasks({ correlationId });
    const receipts = listEnvoyReceipts({ correlationId });
    const events = listEvents({ correlationId }).filter((event) =>
      event.kind.startsWith("envoy."),
    );
    const receiptIds = receipts.map((receipt) => receipt.receipt_id);

    const proof = {
      ok:
        secondClaimRejected &&
        tasks.length === 1 &&
        tasks[0]?.status === "done" &&
        queryTaskGet(getKernelDb(), taskId)?.status === "complete" &&
        receipts.length >= 4 &&
        events.length >= 4,
      canvas_id: canvasId,
      task_id: taskId,
      envoy_task_id: tasks[0]?.envoy_task_id ?? null,
      envoy_space_id: tasks[0]?.envoy_space_id ?? null,
      connection_id: tasks[0]?.connection_id ?? null,
      correlation_id: correlationId,
      second_claim_rejected: secondClaimRejected,
      final_status: tasks[0]?.status ?? null,
      receipt_ids: receiptIds,
      event_kinds: events.map((event) => event.kind),
    };

    console.log(JSON.stringify(proof, null, 2));
    if (!proof.ok) {
      process.exitCode = 1;
    }
  } finally {
    closeDb();
    closeTestKernelDb();
  }
}

await main();
