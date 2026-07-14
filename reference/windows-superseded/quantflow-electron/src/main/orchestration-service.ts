import { randomUUID } from "node:crypto";
import {
  createRun as repoCreateRun,
  getRun,
  listRuns,
  updateRun,
} from "./runtime-state/runs-repo";
import { createTask, listTasks } from "./runtime-state/tasks-repo";
import {
  getTileCapability,
  listTileCapabilities,
  upsertTileCapability,
} from "./runtime-state/tile-capabilities-repo";
import {
  getTileRuntime,
  upsertTileRuntime,
} from "./runtime-state/tiles-runtime-repo";
import type {
  RunFilter,
  RunRow,
  TaskRow,
  TileCapabilityFilter,
  TileCapabilityRow,
  TileRuntimeRow,
} from "./runtime-state/types";

export interface CreateRunParams {
  title?: string | null;
  metadata?: Record<string, unknown>;
  startedAt?: number;
}

export interface RegisterTileCapabilityParams {
  tileId: string;
  capability: string;
  schemaVersion?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResolveCapabilityParams {
  capability: string;
  requireOnline?: boolean;
}

export interface ResolvedCapability {
  tileId: string;
  capability: TileCapabilityRow;
  runtime: TileRuntimeRow | null;
}

export interface TileHeartbeatParams {
  tileId: string;
  paneId?: string | null;
  status?: string | null;
  presence?: string;
  metadata?: Record<string, unknown>;
  now?: number;
}

export interface CreateCorrelatedTaskParams {
  runId?: string | null;
  parentTaskId?: string | null;
  cableId?: string | null;
  fromTileId: string;
  toTileId: string;
  correlationId?: string | null;
  threadId?: string | null;
  traceId?: string | null;
  origin?: string | null;
  payload: string;
  payloadHash?: string | null;
  schemaId?: string | null;
  schemaVersion?: string | null;
}

export function createRun(params: CreateRunParams = {}): RunRow {
  return repoCreateRun(params);
}

export { getRun, listRuns };

export function cancelRun(id: string, now = Date.now()): RunRow | null {
  return updateRun(id, { status: "cancelled", completedAt: now });
}

export function registerTileCapability(
  params: RegisterTileCapabilityParams,
): TileCapabilityRow {
  const metadata =
    params.schemaVersion === undefined
      ? params.metadata
      : { ...(params.metadata ?? {}), schemaVersion: params.schemaVersion };

  return upsertTileCapability({
    tileId: params.tileId,
    capability: params.capability,
    metadata,
  });
}

export function listCapabilities(
  filter: TileCapabilityFilter = {},
): TileCapabilityRow[] {
  return listTileCapabilities(filter);
}

export function resolveCapability(
  params: ResolveCapabilityParams,
): ResolvedCapability | null {
  const candidates = listTileCapabilities({ capability: params.capability });

  for (const capability of candidates) {
    const runtime = getTileRuntime(capability.tile_id);
    if (params.requireOnline && runtime?.presence !== "online") continue;
    return {
      tileId: capability.tile_id,
      capability,
      runtime,
    };
  }

  return null;
}

export function heartbeat(params: TileHeartbeatParams): TileRuntimeRow {
  return upsertTileRuntime({
    tileId: params.tileId,
    paneId: params.paneId,
    status: params.status,
    presence: params.presence ?? "online",
    metadata: params.metadata,
    lastSeenAt: params.now ?? Date.now(),
  });
}

export const updateTileRuntime = heartbeat;
export { getTileRuntime };

export function createCorrelatedTask(
  params: CreateCorrelatedTaskParams,
): TaskRow {
  const run =
    params.runId === undefined || params.runId === null
      ? createRun({ metadata: { origin: params.origin ?? "orchestration" } })
      : null;

  const correlationId = params.correlationId ?? randomUUID();
  const threadId = params.threadId ?? correlationId;
  const traceId = params.traceId ?? randomUUID();

  return createTask({
    runId: params.runId ?? run?.id ?? null,
    parentTaskId: params.parentTaskId ?? null,
    cableId: params.cableId ?? null,
    fromTileId: params.fromTileId,
    toTileId: params.toTileId,
    correlationId,
    threadId,
    traceId,
    origin: params.origin ?? "orchestration",
    payload: params.payload,
    payloadHash: params.payloadHash ?? null,
    schemaId: params.schemaId ?? null,
    schemaVersion: params.schemaVersion ?? null,
    sentAt: Date.now(),
  });
}

export function listRunTasks(runId: string): TaskRow[] {
  return listTasks({ runId });
}

export function listRunsForService(filter: RunFilter = {}): RunRow[] {
  return listRuns(filter);
}
