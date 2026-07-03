import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import { emitKernelEvent } from '../events/index';
import { ensureWorkerInstanceForTile } from '../worker-instances/index';
import type { CommandResult } from './types';

function tableExists(db: KernelDB, tableName: string): boolean {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) != null;
}

export function handleTileCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.tile.create': return tileCreate(db, payload);
    case 'kernel.tile.move': return tileMove(db, payload);
    case 'kernel.tile.resize': return tileResize(db, payload);
    case 'kernel.tile.rename': return tileRename(db, payload);
    case 'kernel.tile.status_update': return tileStatusUpdate(db, payload);
    case 'kernel.tile.remove': return tileRemove(db, payload);
    case 'kernel.tile.layout_sync': return tileLayoutSync(db, payload);
    default: return { ok: false, error: `Unhandled tile command: ${type}` };
  }
}

function tileCreate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = (payload['id'] as string | undefined) ?? randomUUID();
  const now = Date.now();
  try {
    // Idempotent: if the tile already exists (e.g. shell and main both fired create),
    // treat the second call as a no-op so neither path is blocked.
    const existing = db.prepare('SELECT id FROM tiles WHERE id = ?').get(id);
    if (existing) return { ok: true, id };

    db.prepare(`
      INSERT INTO tiles
        (id, workflow_id, display_name, tile_kind, x, y, width, height, z_index, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      (payload['workflowId'] as string | null) ?? null,
      (payload['displayName'] as string | undefined) ?? 'tile',
      (payload['tileKind'] as string | undefined) ?? 'worker',
      Number(payload['x'] ?? 0),
      Number(payload['y'] ?? 0),
      Number(payload['width'] ?? 320),
      Number(payload['height'] ?? 240),
      Number(payload['zIndex'] ?? 0),
      (payload['status'] as string | undefined) ?? 'idle',
      now,
      now,
    );
    // Ensure a default WorkerInstance for worker tiles so Kernel tasks can be
    // claimed against the tile and surface on its State Card (Goal 4 link;
    // full registry is Goal 6).
    const tileKind = (payload['tileKind'] as string | undefined) ?? 'worker';
    if (tileKind === 'worker') {
      ensureWorkerInstanceForTile(db, id);
    }
    emitKernelEvent({
      kind: 'tile.created',
      tileId: id,
      workflowId: payload['workflowId'] as string | undefined,
      data: { id, displayName: payload['displayName'], tileKind: payload['tileKind'] },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function tileMove(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.move: id required' };
  try {
    const info = db.prepare('UPDATE tiles SET x = ?, y = ?, updated_at = ? WHERE id = ?')
      .run(Number(payload['x'] ?? 0), Number(payload['y'] ?? 0), Date.now(), id);
    if (info.changes === 0) return { ok: false, error: `tile.move: tile not found: ${id}` };
    emitKernelEvent({ kind: 'tile.moved', tileId: id, data: { x: payload['x'], y: payload['y'] } });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function tileResize(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.resize: id required' };
  try {
    const info = db.prepare('UPDATE tiles SET width = ?, height = ?, updated_at = ? WHERE id = ?')
      .run(Number(payload['width'] ?? 320), Number(payload['height'] ?? 240), Date.now(), id);
    if (info.changes === 0) return { ok: false, error: `tile.resize: tile not found: ${id}` };
    emitKernelEvent({ kind: 'tile.resized', tileId: id, data: { width: payload['width'], height: payload['height'] } });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function tileRename(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.rename: id required' };
  const displayName = payload['displayName'] as string | undefined;
  if (!displayName) return { ok: false, error: 'tile.rename: displayName required' };
  try {
    const info = db.prepare('UPDATE tiles SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(displayName, Date.now(), id);
    if (info.changes === 0) return { ok: false, error: `tile.rename: tile not found: ${id}` };
    emitKernelEvent({ kind: 'tile.renamed', tileId: id, data: { displayName } });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function tileStatusUpdate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.status_update: id required' };
  const status = payload['status'] as string | undefined;
  if (!status) return { ok: false, error: 'tile.status_update: status required' };
  try {
    const info = db.prepare('UPDATE tiles SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
    if (info.changes === 0) return { ok: false, error: `tile.status_update: tile not found: ${id}` };
    emitKernelEvent({ kind: 'tile.status_updated', tileId: id, data: { status } });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Geometry + display title only — never touches status, tile_kind, or workflow_id. */
function tileLayoutSync(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.layout_sync: id required' };

  const setParts: string[] = ['updated_at = ?'];
  const setVals: unknown[] = [Date.now()];

  if ('x' in payload) {
    setParts.push('x = ?');
    setVals.push(Number(payload['x'] ?? 0));
  }
  if ('y' in payload) {
    setParts.push('y = ?');
    setVals.push(Number(payload['y'] ?? 0));
  }
  if ('width' in payload) {
    setParts.push('width = ?');
    setVals.push(Number(payload['width'] ?? 320));
  }
  if ('height' in payload) {
    setParts.push('height = ?');
    setVals.push(Number(payload['height'] ?? 240));
  }
  if ('zIndex' in payload) {
    setParts.push('z_index = ?');
    setVals.push(Number(payload['zIndex'] ?? 0));
  }
  if ('displayName' in payload) {
    const displayName = payload['displayName'] as string | undefined;
    if (!displayName?.trim()) {
      return { ok: false, error: 'tile.layout_sync: displayName must be a non-empty string' };
    }
    setParts.push('display_name = ?');
    setVals.push(displayName);
  }

  if (setParts.length === 1) {
    return { ok: false, error: 'tile.layout_sync: at least one layout field required' };
  }

  try {
    setVals.push(id);
    const info = db.prepare(`UPDATE tiles SET ${setParts.join(', ')} WHERE id = ?`).run(...setVals);
    if (info.changes === 0) return { ok: false, error: `tile.layout_sync: tile not found: ${id}` };
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function tileRemove(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'tile.remove: id required' };
  try {
    const workerRows = db.prepare('SELECT id FROM worker_instances WHERE tile_id = ?').all(id) as Array<{ id: string }>;
    for (const worker of workerRows) {
      db.prepare('UPDATE tasks SET owner_worker_id = NULL WHERE owner_worker_id = ?').run(worker.id);
      db.prepare('UPDATE tasks SET source_worker_id = NULL WHERE source_worker_id = ?').run(worker.id);
      db.prepare('UPDATE tasks SET target_worker_id = NULL WHERE target_worker_id = ?').run(worker.id);
      db.prepare('UPDATE receipts SET worker_id = NULL WHERE worker_id = ?').run(worker.id);
      db.prepare('UPDATE artifacts SET worker_id = NULL WHERE worker_id = ?').run(worker.id);
      db.prepare('UPDATE events SET worker_id = NULL WHERE worker_id = ?').run(worker.id);
      // Remaining FK refs to worker_instances that must clear BEFORE the worker
      // row is deleted. State Cards/evals are detached (kept as truth/derived);
      // permissions are worker-scoped, so they go with the worker.
      db.prepare('UPDATE state_cards SET worker_id = NULL WHERE worker_id = ?').run(worker.id);
      if (tableExists(db, 'evaluations')) {
        db.prepare('UPDATE evaluations SET worker_id = NULL WHERE worker_id = ?').run(worker.id);
      }
      db.prepare('DELETE FROM permissions WHERE worker_id = ?').run(worker.id);
    }
    db.prepare('DELETE FROM worker_instances WHERE tile_id = ?').run(id);
    db.prepare('DELETE FROM state_cards WHERE tile_id = ?').run(id);
    db.prepare('UPDATE artifacts SET tile_id = NULL WHERE tile_id = ?').run(id);
    db.prepare('UPDATE events SET tile_id = NULL WHERE tile_id = ?').run(id);
    // Receipts are append-only evidence: detach the tile FK (nullable) but keep
    // the receipt rows + their task/worker/correlation provenance intact.
    db.prepare('UPDATE receipts SET tile_id = NULL WHERE tile_id = ?').run(id);
    // Connections require both endpoints (tile_a_id/tile_b_id are NOT NULL), so a
    // connection cannot outlive a removed endpoint — delete any that touch it.
    db.prepare(
      'DELETE FROM connections WHERE tile_a_id = ? OR tile_b_id = ? OR from_tile_id = ? OR to_tile_id = ?',
    ).run(id, id, id, id);
    const info = db.prepare('DELETE FROM tiles WHERE id = ?').run(id);
    // DELETE is idempotent: a missing row means the desired end state (gone)
    // already holds. Still emit so renderers reconcile.
    if (info.changes > 0) {
      emitKernelEvent({ kind: 'tile.removed', tileId: id });
    }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
