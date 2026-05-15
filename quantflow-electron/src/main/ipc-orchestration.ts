import { ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import {
  cancelRun,
  createCorrelatedTask,
  createRun,
  getRun,
  getTileRuntime,
  heartbeat,
  listCapabilities,
  listRunTasks,
  listRuns,
  registerTileCapability,
  resolveCapability,
  updateTileRuntime,
  type CreateCorrelatedTaskParams,
  type CreateRunParams,
  type RegisterTileCapabilityParams,
  type ResolveCapabilityParams,
  type TileHeartbeatParams,
} from "./orchestration-service";
import type {
  RunFilter,
  TileCapabilityFilter,
} from "./runtime-state/types";

export function registerOrchestrationHandlers(): void {
  ipcMain.handle("qf:runs:create", (_, params: CreateRunParams = {}) =>
    createRun(params),
  );
  ipcMain.handle("qf:runs:list", (_, filter: RunFilter = {}) =>
    listRuns(filter),
  );
  ipcMain.handle("qf:runs:get", (_, id: string) => getRun(id));
  ipcMain.handle("qf:runs:cancel", (_, id: string) => cancelRun(id));

  ipcMain.handle(
    "qf:capabilities:register",
    (_, params: RegisterTileCapabilityParams) =>
      registerTileCapability(params),
  );
  ipcMain.handle(
    "qf:capabilities:list",
    (_, filter: TileCapabilityFilter = {}) => listCapabilities(filter),
  );

  ipcMain.handle(
    "qf:tiles-runtime:heartbeat",
    (_, params: TileHeartbeatParams) => heartbeat(params),
  );
  ipcMain.handle(
    "qf:tiles-runtime:update",
    (_, params: TileHeartbeatParams) => updateTileRuntime(params),
  );
  ipcMain.handle(
    "qf:tiles-runtime:get",
    (_, tileId: string) => getTileRuntime(tileId),
  );

  ipcMain.handle(
    "qf:orchestration:resolve-route",
    (_, params: ResolveCapabilityParams) => resolveCapability(params),
  );
  ipcMain.handle(
    "qf:orchestration:tasks.create-correlated",
    (_, params: CreateCorrelatedTaskParams) => createCorrelatedTask(params),
  );
  ipcMain.handle(
    "qf:orchestration:tasks.list-run",
    (_, runId: string) => listRunTasks(runId),
  );

  registerOrchestrationRpcMethods();
}

function readId(params: unknown, field = "id"): string {
  if (typeof params === "string") return params;
  const value = (params as Record<string, unknown> | null)?.[field];
  return String(value ?? "");
}

function registerOrchestrationRpcMethods(): void {
  registerMethod(
    "orchestration.runCreate",
    (params) => createRun((params as CreateRunParams | undefined) ?? {}),
    {
      description: "Create an orchestration run",
      params: {
        title: "(optional) Run title",
        metadata: "(optional) Structured run metadata",
      },
    },
  );

  registerMethod(
    "orchestration.runGet",
    (params) => getRun(readId(params)),
    {
      description: "Get an orchestration run by id",
      params: { id: "Run id" },
    },
  );

  registerMethod(
    "orchestration.runList",
    (params) => listRuns((params as RunFilter | undefined) ?? {}),
    {
      description: "List orchestration runs",
      params: {
        status: "(optional) Run status filter",
        limit: "(optional) Maximum number of runs",
      },
    },
  );

  registerMethod(
    "orchestration.runCancel",
    (params) => cancelRun(readId(params)),
    {
      description: "Cancel an orchestration run",
      params: { id: "Run id" },
    },
  );

  registerMethod(
    "orchestration.capabilityRegister",
    (params) => registerTileCapability(params as RegisterTileCapabilityParams),
    {
      description: "Register or update a tile capability",
      params: {
        tileId: "Tile id",
        capability: "Capability key",
        schemaVersion: "(optional) Capability schema version",
      },
    },
  );

  registerMethod(
    "orchestration.capabilityList",
    (params) => listCapabilities((params as TileCapabilityFilter | undefined) ?? {}),
    {
      description: "List registered tile capabilities",
      params: {
        tileId: "(optional) Tile id filter",
        capability: "(optional) Capability key filter",
      },
    },
  );

  registerMethod(
    "orchestration.resolveRoute",
    (params) => resolveCapability(params as ResolveCapabilityParams),
    {
      description: "Resolve a capability to a tile runtime route",
      params: {
        capability: "Capability key",
        requireOnline: "(optional) true to require online tile runtime",
      },
    },
  );

  registerMethod(
    "orchestration.tileHeartbeat",
    (params) => heartbeat(params as TileHeartbeatParams),
    {
      description: "Update tile runtime heartbeat and presence",
      params: {
        tileId: "Tile id",
        paneId: "(optional) herdr pane id",
        status: "(optional) Tile status",
        presence: "(optional) Tile presence",
      },
    },
  );
}
