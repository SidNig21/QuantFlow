import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { ArtifactFilter, ArtifactRow } from "./types";

export function createArtifact(params: {
  runId?: string | null;
  taskId?: string | null;
  tileId?: string | null;
  kind: string;
  uri?: string | null;
  contentHash?: string | null;
  mediaType?: string | null;
  sizeBytes?: number | null;
  metadata?: Record<string, unknown>;
}): ArtifactRow {
  const row: ArtifactRow = {
    id: randomUUID(),
    run_id: params.runId ?? null,
    task_id: params.taskId ?? null,
    tile_id: params.tileId ?? null,
    kind: params.kind,
    uri: params.uri ?? null,
    content_hash: params.contentHash ?? null,
    media_type: params.mediaType ?? null,
    size_bytes: params.sizeBytes ?? null,
    metadata: params.metadata ?? {},
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      `INSERT INTO artifacts
         (id, run_id, task_id, tile_id, kind, uri, content_hash, media_type, size_bytes, metadata, created_at)
       VALUES
         (@id, @run_id, @task_id, @tile_id, @kind, @uri, @content_hash, @media_type, @size_bytes, @metadata, @created_at)`,
    )
    .run({ ...row, metadata: JSON.stringify(row.metadata) });

  return row;
}

export function listArtifacts(filter: ArtifactFilter = {}): ArtifactRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.runId !== undefined) {
    conditions.push("run_id = @runId");
    params["runId"] = filter.runId;
  }
  if (filter.taskId !== undefined) {
    conditions.push("task_id = @taskId");
    params["taskId"] = filter.taskId;
  }
  if (filter.tileId !== undefined) {
    conditions.push("tile_id = @tileId");
    params["tileId"] = filter.tileId;
  }
  if (filter.kind !== undefined) {
    conditions.push("kind = @kind");
    params["kind"] = filter.kind;
  }
  if (filter.contentHash !== undefined) {
    conditions.push("content_hash = @contentHash");
    params["contentHash"] = filter.contentHash;
  }
  if (filter.since !== undefined) {
    conditions.push("created_at >= @since");
    params["since"] = filter.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  const rows = getDb()
    .prepare(`SELECT * FROM artifacts ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<ArtifactRow, "metadata"> & { metadata: string })[];

  return rows.map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }));
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM artifacts").run();
}
