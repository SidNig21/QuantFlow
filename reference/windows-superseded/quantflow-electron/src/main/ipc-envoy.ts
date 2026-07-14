import { ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import { getEnvoyTaskService } from "./envoy-task-service";

function service() {
  return getEnvoyTaskService();
}

export function registerEnvoyHandlers(): void {
  ipcMain.handle("envoy:space-status", (_event, params?: { canvasId?: string }) =>
    service().spaceStatus(params?.canvasId),
  );
  ipcMain.handle("envoy:task-list", (_event, params = {}) =>
    service().listTasks(params),
  );
  ipcMain.handle("envoy:task-create", (_event, params) =>
    service().createTask(params),
  );
  ipcMain.handle("envoy:task-claim", (_event, params) =>
    service().claimTask(params),
  );
  ipcMain.handle("envoy:task-update", (_event, params) =>
    service().updateTaskProgress(params),
  );
  ipcMain.handle("envoy:task-complete", (_event, params) =>
    service().completeTask(params),
  );
  ipcMain.handle("envoy:task-block", (_event, params) =>
    service().blockTask(params),
  );
  ipcMain.handle("envoy:task-fail", (_event, params) =>
    service().failTask(params),
  );
  ipcMain.handle("envoy:receipt-list", (_event, params = {}) =>
    service().listReceipts(params),
  );
  ipcMain.handle("envoy:watch", (_event, params = {}) =>
    service().recentEvents(params),
  );

  registerMethod(
    "envoy.spaceStatus",
    (params: unknown) => {
      const p = params as { canvasId?: string } | undefined;
      return service().spaceStatus(p?.canvasId);
    },
    {
      description: "Get QuantFlow Envoy space status",
      params: { canvasId: "(optional) canvas id" },
    },
  );

  registerMethod(
    "envoy.taskList",
    (params) => service().listTasks(params as any),
    {
      description: "List QuantFlow Envoy tasks",
      params: {
        canvasId: "(optional) canvas id",
        status: "(optional) inbox, ready, claimed, working, review, done, blocked, failed, or all",
        targetTileId: "(optional) target tile id",
      },
    },
  );

  registerMethod(
    "envoy.taskCreate",
    (params) => service().createTask(params as any),
    {
      description: "Create a QuantFlow Envoy task",
      params: {
        canvasId: "Canvas id",
        sourceTileId: "Source tile id",
        targetTileId: "(optional) target tile id",
        connectionId: "(optional) cable/connection id",
        title: "Task title",
        instruction: "Task instruction",
        acceptanceCriteria: "(optional) string array",
        operatorOverride: "(optional) bypass cable validation",
      },
    },
  );

  registerMethod(
    "envoy.taskClaim",
    (params) => service().claimTask(params as any),
    {
      description: "Claim a QuantFlow Envoy task atomically",
      params: {
        taskId: "Task id",
        claimingTileId: "Claiming tile id",
        agentName: "(optional) agent display name",
      },
    },
  );

  registerMethod(
    "envoy.taskUpdate",
    (params) => service().updateTaskProgress(params as any),
    {
      description: "Record QuantFlow Envoy task progress",
      params: {
        taskId: "Task id",
        summary: "Progress summary",
        actorTileId: "(optional) actor tile id",
        agentName: "(optional) agent display name",
      },
    },
  );

  registerMethod(
    "envoy.taskComplete",
    (params) => service().completeTask(params as any),
    {
      description: "Complete a QuantFlow Envoy task",
      params: {
        taskId: "Task id",
        resultSummary: "Result summary",
        artifactPaths: "(optional) string array",
        actorTileId: "(optional) actor tile id",
        agentName: "(optional) agent display name",
      },
    },
  );

  registerMethod(
    "envoy.taskBlock",
    (params) => service().blockTask(params as any),
    {
      description: "Block a QuantFlow Envoy task",
      params: {
        taskId: "Task id",
        reason: "Block reason",
        actorTileId: "(optional) actor tile id",
        agentName: "(optional) agent display name",
      },
    },
  );

  registerMethod(
    "envoy.taskFail",
    (params) => service().failTask(params as any),
    {
      description: "Fail a QuantFlow Envoy task",
      params: {
        taskId: "Task id",
        reason: "Failure reason",
        actorTileId: "(optional) actor tile id",
        agentName: "(optional) agent display name",
      },
    },
  );

  registerMethod(
    "envoy.receiptList",
    (params) => service().listReceipts(params as any),
    {
      description: "List QuantFlow Envoy receipts",
      params: {
        taskId: "(optional) task id",
        canvasId: "(optional) canvas id",
        correlationId: "(optional) correlation id",
      },
    },
  );

  registerMethod(
    "envoy.watch",
    (params) => service().recentEvents(params as any),
    {
      description: "Return recent QuantFlow Envoy runtime events",
      params: {
        correlationId: "(optional) correlation id",
        limit: "(optional) max events",
      },
    },
  );
}
