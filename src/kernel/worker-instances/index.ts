/**
 * Worker Instances — Kernel-authoritative worker identity (Goal 4 link → Goal 6A).
 *
 * The `worker_instances` row is the single identity tying a tile to its role,
 * harness, model, runtime ids (herdr pane / envoy space), receipts, and State
 * Card. Goal 4 created a minimal default row per tile; Goal 6A makes the Kernel
 * the spawn/status authority and populates role/harness/model + runtime ids.
 *
 * Harness/model/role registry rows are seeded from the pure harness config in
 * src/harness (configuration only — no harness execution code in the Kernel).
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import type { WorkerInstanceStatus } from '../schema/types';
import { HARNESS_DESCRIPTORS, type HarnessKind } from '../../harness/registry';

const DEFAULT_MODEL_ID = 'model-local-default';

// ---------------------------------------------------------------------------
// Registry seed (idempotent) — harnesses + a default model.
// ---------------------------------------------------------------------------

function harnessId(kind: HarnessKind): string {
  return `harness-${kind}`;
}

/** Seed the harness + default model registry rows. Idempotent. */
export function seedHarnessRegistry(db: KernelDB): void {
  const now = Date.now();
  for (const d of HARNESS_DESCRIPTORS) {
    db.prepare(
      `INSERT OR IGNORE INTO harnesses (id, kind, description, config_schema_json, created_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, '{}')`,
    ).run(harnessId(d.kind), d.kind, d.description, JSON.stringify(d.configSchema), now);
  }
  db.prepare(
    `INSERT OR IGNORE INTO models (id, provider, name, description, created_at, metadata_json)
     VALUES (?, 'local', 'default', 'Default local model (Goal 6A placeholder)', ?, '{}')`,
  ).run(DEFAULT_MODEL_ID, now);
}

function getHarnessIdByKind(db: KernelDB, kind: HarnessKind): string | null {
  const row = db.prepare('SELECT id FROM harnesses WHERE kind = ?').get(kind) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function getDefaultModelId(db: KernelDB): string | null {
  const row = db.prepare('SELECT id FROM models WHERE id = ?').get(DEFAULT_MODEL_ID) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function ensureRoleByName(db: KernelDB, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = db.prepare('SELECT id FROM roles WHERE name = ?').get(trimmed) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = `role-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description, created_at, metadata_json)
     VALUES (?, ?, NULL, ?, '{}')`,
  ).run(id, trimmed, Date.now());
  const row = db.prepare('SELECT id FROM roles WHERE name = ?').get(trimmed) as { id: string };
  return row.id;
}

function ensureModel(
  db: KernelDB,
  provider: string,
  name: string,
): string {
  const id = `model-${provider}-${name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  db.prepare(
    `INSERT OR IGNORE INTO models (id, provider, name, description, created_at, metadata_json)
     VALUES (?, ?, ?, NULL, ?, '{}')`,
  ).run(id, provider, name, Date.now());
  return id;
}

// ---------------------------------------------------------------------------
// Worker rows
// ---------------------------------------------------------------------------

/**
 * Ensure a single default WorkerInstance for a tile. Idempotent. Populates
 * harness_id (local-shell) + model_id (default) when the registry is seeded;
 * leaves them NULL otherwise (backward-compatible with pre-6A callers).
 */
export function ensureWorkerInstanceForTile(db: KernelDB, tileId: string): string | null {
  const tile = db.prepare('SELECT id, workflow_id FROM tiles WHERE id = ?').get(tileId) as
    | { id: string; workflow_id: string | null }
    | undefined;
  if (!tile) return null;

  const existing = db
    .prepare('SELECT id FROM worker_instances WHERE tile_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(tileId) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO worker_instances
       (id, tile_id, workflow_id, harness_id, model_id, status, created_at, updated_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    id,
    tileId,
    tile.workflow_id ?? null,
    getHarnessIdByKind(db, 'local-shell'),
    getDefaultModelId(db),
    now,
    now,
    JSON.stringify({ default: true, createdBy: 'tile-create' }),
  );
  return id;
}

export interface SpawnWorkerArgs {
  tileId: string;
  roleName?: string | null;
  harnessKind?: HarnessKind;
  modelProvider?: string | null;
  modelName?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Establish/refresh the Kernel worker identity for a tile at spawn time:
 * populate role/harness/model and set status='spawning'. Ensures exactly one
 * worker row per tile (reuses the default row created by tile.create).
 */
export function spawnWorkerForTile(db: KernelDB, args: SpawnWorkerArgs): string | null {
  const workerId = ensureWorkerInstanceForTile(db, args.tileId);
  if (!workerId) return null;

  const harnessKind: HarnessKind = args.harnessKind ?? 'local-shell';
  const harness = getHarnessIdByKind(db, harnessKind);
  const model =
    args.modelProvider && args.modelName
      ? ensureModel(db, args.modelProvider, args.modelName)
      : getDefaultModelId(db);
  const role = args.roleName ? ensureRoleByName(db, args.roleName) : null;

  db.prepare(
    `UPDATE worker_instances
       SET role_id = COALESCE(?, role_id),
           harness_id = COALESCE(?, harness_id),
           model_id = COALESCE(?, model_id),
           status = 'spawning',
           updated_at = ?
     WHERE id = ?`,
  ).run(role, harness, model, Date.now(), workerId);
  return workerId;
}

export interface WorkerStatusPatch {
  status?: WorkerInstanceStatus;
  herdrPaneId?: string | null;
  envoySpaceId?: string | null;
}

/** Resolve a worker id from an explicit id or a tile id. */
export function resolveWorkerId(
  db: KernelDB,
  ref: { workerId?: string; tileId?: string },
): string | null {
  if (ref.workerId) return ref.workerId;
  if (ref.tileId) return queryWorkerForTile(db, ref.tileId);
  return null;
}

/** Patch a worker's status and/or runtime ids. Returns the tile id (for events). */
export function updateWorkerInstance(
  db: KernelDB,
  workerId: string,
  patch: WorkerStatusPatch,
): { tileId: string | null; workflowId: string | null } | null {
  const row = db
    .prepare('SELECT tile_id, workflow_id FROM worker_instances WHERE id = ?')
    .get(workerId) as { tile_id: string | null; workflow_id: string | null } | undefined;
  if (!row) return null;

  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [Date.now()];
  if (patch.status !== undefined) {
    sets.push('status = ?');
    vals.push(patch.status);
  }
  if (patch.herdrPaneId !== undefined) {
    sets.push('herdr_pane_id = ?');
    vals.push(patch.herdrPaneId);
  }
  if (patch.envoySpaceId !== undefined) {
    sets.push('envoy_space_id = ?');
    vals.push(patch.envoySpaceId);
  }
  vals.push(workerId);
  db.prepare(`UPDATE worker_instances SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return { tileId: row.tile_id, workflowId: row.workflow_id };
}

export interface WorkerSnapshot {
  id: string;
  tileId: string;
  workflowId: string | null;
  roleId: string | null;
  harnessId: string | null;
  modelId: string | null;
  status: WorkerInstanceStatus;
  herdrPaneId: string | null;
  envoySpaceId: string | null;
}

function rowToWorker(r: Record<string, unknown>): WorkerSnapshot {
  return {
    id: r['id'] as string,
    tileId: r['tile_id'] as string,
    workflowId: (r['workflow_id'] as string | null) ?? null,
    roleId: (r['role_id'] as string | null) ?? null,
    harnessId: (r['harness_id'] as string | null) ?? null,
    modelId: (r['model_id'] as string | null) ?? null,
    status: r['status'] as WorkerInstanceStatus,
    herdrPaneId: (r['herdr_pane_id'] as string | null) ?? null,
    envoySpaceId: (r['envoy_space_id'] as string | null) ?? null,
  };
}

export function queryWorkerGet(db: KernelDB, workerId: string): WorkerSnapshot | null {
  const row = db.prepare('SELECT * FROM worker_instances WHERE id = ?').get(workerId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToWorker(row) : null;
}

export function queryWorkerList(db: KernelDB, params: { workflowId?: string } = {}): WorkerSnapshot[] {
  const rows = params.workflowId
    ? (db
        .prepare('SELECT * FROM worker_instances WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(params.workflowId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM worker_instances ORDER BY created_at ASC').all() as Record<string, unknown>[]);
  return rows.map(rowToWorker);
}

/** The default WorkerInstance id for a tile, or null if none exists. */
export function queryWorkerForTile(db: KernelDB, tileId: string): string | null {
  const row = db
    .prepare('SELECT id FROM worker_instances WHERE tile_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(tileId) as { id: string } | undefined;
  return row?.id ?? null;
}
