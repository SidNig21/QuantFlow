import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type {
  EnvoyReceiptFilter,
  EnvoyReceiptRow,
  EnvoySpaceRow,
  EnvoySpaceStatus,
  EnvoyTaskFilter,
  EnvoyTaskRow,
  EnvoyTaskStatus,
} from "./types";

export function upsertEnvoySpace(params: {
  canvasId: string;
  workspaceHash?: string | null;
  spaceName: string;
  envoySpaceId?: string | null;
  status?: EnvoySpaceStatus;
  error?: string | null;
}): EnvoySpaceRow {
  const now = Date.now();
  const existing = getEnvoySpace(params.canvasId);
  const row: EnvoySpaceRow = {
    canvas_id: params.canvasId,
    workspace_hash: params.workspaceHash ?? existing?.workspace_hash ?? null,
    space_name: params.spaceName,
    envoy_space_id: params.envoySpaceId ?? existing?.envoy_space_id ?? null,
    status: params.status ?? existing?.status ?? "pending",
    error: params.error ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO envoy_spaces
         (canvas_id, workspace_hash, space_name, envoy_space_id, status, error, created_at, updated_at)
       VALUES
         (@canvas_id, @workspace_hash, @space_name, @envoy_space_id, @status, @error, @created_at, @updated_at)
       ON CONFLICT(canvas_id) DO UPDATE SET
         workspace_hash = excluded.workspace_hash,
         space_name = excluded.space_name,
         envoy_space_id = excluded.envoy_space_id,
         status = excluded.status,
         error = excluded.error,
         updated_at = excluded.updated_at`,
    )
    .run(row);

  return row;
}

export function getEnvoySpace(canvasId: string): EnvoySpaceRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM envoy_spaces WHERE canvas_id = ?")
      .get(canvasId) as EnvoySpaceRow | undefined) ?? null
  );
}

export function listEnvoySpaces(): EnvoySpaceRow[] {
  return getDb()
    .prepare("SELECT * FROM envoy_spaces ORDER BY created_at ASC")
    .all() as EnvoySpaceRow[];
}

export function insertEnvoyTask(params: {
  taskId?: string;
  envoyTaskId?: string | null;
  canvasId: string;
  envoySpaceId: string;
  sourceTileId: string;
  targetTileId?: string | null;
  connectionId?: string | null;
  correlationId?: string;
  title: string;
  instruction: string;
  acceptanceCriteria?: string[];
  status?: EnvoyTaskStatus;
}): EnvoyTaskRow {
  const now = Date.now();
  const row: EnvoyTaskRow = {
    task_id: params.taskId ?? randomUUID(),
    envoy_task_id: params.envoyTaskId ?? null,
    canvas_id: params.canvasId,
    envoy_space_id: params.envoySpaceId,
    source_tile_id: params.sourceTileId,
    target_tile_id: params.targetTileId ?? null,
    connection_id: params.connectionId ?? null,
    correlation_id: params.correlationId ?? randomUUID(),
    title: params.title,
    instruction: params.instruction,
    acceptance_criteria: JSON.stringify(params.acceptanceCriteria ?? []),
    status: params.status ?? (params.targetTileId ? "ready" : "inbox"),
    claimed_by: null,
    claimed_at: null,
    result_summary: null,
    receipt_ids: "[]",
    artifact_paths: "[]",
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO envoy_tasks
         (task_id, envoy_task_id, canvas_id, envoy_space_id, source_tile_id, target_tile_id,
          connection_id, correlation_id, title, instruction, acceptance_criteria,
          status, claimed_by, claimed_at, result_summary, receipt_ids, artifact_paths,
          created_at, updated_at)
       VALUES
         (@task_id, @envoy_task_id, @canvas_id, @envoy_space_id, @source_tile_id, @target_tile_id,
          @connection_id, @correlation_id, @title, @instruction, @acceptance_criteria,
          @status, @claimed_by, @claimed_at, @result_summary, @receipt_ids, @artifact_paths,
          @created_at, @updated_at)`,
    )
    .run(row);

  return row;
}

export function getEnvoyTask(taskId: string): EnvoyTaskRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM envoy_tasks WHERE task_id = ?")
      .get(taskId) as EnvoyTaskRow | undefined) ?? null
  );
}

export function listEnvoyTasks(filter: EnvoyTaskFilter = {}): EnvoyTaskRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.canvasId !== undefined) {
    conditions.push("canvas_id = @canvasId");
    params.canvasId = filter.canvasId;
  }
  if (filter.status !== undefined && filter.status !== "all") {
    conditions.push("status = @status");
    params.status = filter.status;
  }
  if (filter.targetTileId !== undefined) {
    conditions.push("target_tile_id = @targetTileId");
    params.targetTileId = filter.targetTileId;
  }
  if (filter.sourceTileId !== undefined) {
    conditions.push("source_tile_id = @sourceTileId");
    params.sourceTileId = filter.sourceTileId;
  }
  if (filter.correlationId !== undefined) {
    conditions.push("correlation_id = @correlationId");
    params.correlationId = filter.correlationId;
  }
  if (filter.connectionId !== undefined) {
    conditions.push("connection_id = @connectionId");
    params.connectionId = filter.connectionId;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  return getDb()
    .prepare(`SELECT * FROM envoy_tasks ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as EnvoyTaskRow[];
}

export function claimEnvoyTask(params: {
  taskId: string;
  claimingTileId: string;
  agentName?: string | null;
  now?: number;
}): EnvoyTaskRow | null {
  const now = params.now ?? Date.now();
  const claimedBy = params.agentName ?? params.claimingTileId;
  const result = getDb()
    .prepare(
      `UPDATE envoy_tasks
       SET status = 'claimed',
           claimed_by = @claimedBy,
           claimed_at = @now,
           updated_at = @now
       WHERE task_id = @taskId
         AND claimed_by IS NULL
         AND status IN ('inbox', 'ready')`,
    )
    .run({ taskId: params.taskId, claimedBy, now });

  if (result.changes === 0) return null;
  return getEnvoyTask(params.taskId);
}

export function patchEnvoyTaskClaim(
  taskId: string,
  claimedBy: string,
  claimedAt: number = Date.now(),
): EnvoyTaskRow | null {
  const result = getDb()
    .prepare(
      `UPDATE envoy_tasks
       SET claimed_by = @claimedBy,
           claimed_at = @claimedAt,
           updated_at = @now
       WHERE task_id = @taskId`,
    )
    .run({ taskId, claimedBy, claimedAt, now: Date.now() });
  if (result.changes === 0) return null;
  return getEnvoyTask(taskId);
}

export function updateEnvoyTask(
  taskId: string,
  changes: {
    status?: EnvoyTaskStatus;
    resultSummary?: string | null;
    receiptIds?: string[];
    artifactPaths?: string[];
  },
): EnvoyTaskRow | null {
  const existing = getEnvoyTask(taskId);
  if (!existing) return null;

  const updated: EnvoyTaskRow = {
    ...existing,
    status: changes.status ?? existing.status,
    result_summary:
      changes.resultSummary !== undefined ? changes.resultSummary : existing.result_summary,
    receipt_ids:
      changes.receiptIds !== undefined ? JSON.stringify(changes.receiptIds) : existing.receipt_ids,
    artifact_paths:
      changes.artifactPaths !== undefined
        ? JSON.stringify(changes.artifactPaths)
        : existing.artifact_paths,
    updated_at: Date.now(),
  };

  getDb()
    .prepare(
      `UPDATE envoy_tasks
       SET status = @status,
           result_summary = @result_summary,
           receipt_ids = @receipt_ids,
           artifact_paths = @artifact_paths,
           updated_at = @updated_at
       WHERE task_id = @task_id`,
    )
    .run(updated);

  return updated;
}

export function insertEnvoyReceipt(params: {
  receiptId?: string;
  taskId: string;
  canvasId: string;
  envoySpaceId: string;
  correlationId: string;
  connectionId?: string | null;
  kind: string;
  actorTileId?: string | null;
  agentName?: string | null;
  envoyMessageId?: string | null;
  payload?: Record<string, unknown>;
}): EnvoyReceiptRow {
  const row: EnvoyReceiptRow = {
    receipt_id: params.receiptId ?? randomUUID(),
    task_id: params.taskId,
    canvas_id: params.canvasId,
    envoy_space_id: params.envoySpaceId,
    correlation_id: params.correlationId,
    connection_id: params.connectionId ?? null,
    kind: params.kind,
    actor_tile_id: params.actorTileId ?? null,
    agent_name: params.agentName ?? null,
    envoy_message_id: params.envoyMessageId ?? null,
    payload: JSON.stringify(params.payload ?? {}),
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      `INSERT INTO envoy_receipts
         (receipt_id, task_id, canvas_id, envoy_space_id, correlation_id,
          connection_id, kind, actor_tile_id, agent_name, envoy_message_id, payload, created_at)
       VALUES
         (@receipt_id, @task_id, @canvas_id, @envoy_space_id, @correlation_id,
          @connection_id, @kind, @actor_tile_id, @agent_name, @envoy_message_id, @payload, @created_at)`,
    )
    .run(row);

  const task = getEnvoyTask(params.taskId);
  if (task) {
    const current = parseJsonArray(task.receipt_ids);
    updateEnvoyTask(task.task_id, { receiptIds: [...current, row.receipt_id] });
  }

  return row;
}

export function listEnvoyReceipts(filter: EnvoyReceiptFilter = {}): EnvoyReceiptRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.taskId !== undefined) {
    conditions.push("task_id = @taskId");
    params.taskId = filter.taskId;
  }
  if (filter.canvasId !== undefined) {
    conditions.push("canvas_id = @canvasId");
    params.canvasId = filter.canvasId;
  }
  if (filter.correlationId !== undefined) {
    conditions.push("correlation_id = @correlationId");
    params.correlationId = filter.correlationId;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  return getDb()
    .prepare(`SELECT * FROM envoy_receipts ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as EnvoyReceiptRow[];
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM envoy_receipts").run();
  getDb().prepare("DELETE FROM envoy_tasks").run();
  getDb().prepare("DELETE FROM envoy_spaces").run();
}
