/**
 * Worker Instances — minimal Goal 4 link helper.
 *
 * Goal 4 needs tasks to be associable with a tile so the State Card watcher can
 * place a claimed task on the right tile (tasks.owner_worker_id →
 * worker_instances.tile_id). The live app spawns tiles but does not yet build
 * WorkerInstances — that full registry (role/harness/model, permissions,
 * lifecycle) is Goal 6.
 *
 * This module provides ONLY the minimal default link: ensure a single default
 * WorkerInstance row exists for a tile. role_id/harness_id/model_id are left
 * NULL on purpose; populating them is Goal 6's job. Kept here, backed by Kernel
 * state — never renderer state.
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';

/**
 * Return the default WorkerInstance id for a tile, creating a minimal one if
 * none exists. Idempotent: repeated calls return the same id.
 */
export function ensureWorkerInstanceForTile(db: KernelDB, tileId: string): string | null {
  const tile = db.prepare('SELECT id, workflow_id FROM tiles WHERE id = ?').get(tileId) as
    | { id: string; workflow_id: string | null }
    | undefined;
  if (!tile) return null; // no such tile — nothing to link

  const existing = db
    .prepare('SELECT id FROM worker_instances WHERE tile_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(tileId) as { id: string } | undefined;
  if (existing) return existing.id;

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO worker_instances
       (id, tile_id, workflow_id, status, created_at, updated_at, metadata_json)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    id,
    tileId,
    tile.workflow_id ?? null,
    now,
    now,
    JSON.stringify({ default: true, createdBy: 'goal4-statecard-link' }),
  );
  return id;
}

/** The default WorkerInstance id for a tile, or null if none exists. */
export function queryWorkerForTile(db: KernelDB, tileId: string): string | null {
  const row = db
    .prepare('SELECT id FROM worker_instances WHERE tile_id = ? ORDER BY created_at ASC LIMIT 1')
    .get(tileId) as { id: string } | undefined;
  return row?.id ?? null;
}
