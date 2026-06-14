import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import { emitKernelEvent } from '../events/index';
import type { CommandResult } from './types';

export function handleConnectionCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.connection.create': return connectionCreate(db, payload);
    case 'kernel.connection.delete': return connectionDelete(db, payload);
    default: return { ok: false, error: `Unhandled connection command: ${type}` };
  }
}

function connectionCreate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = (payload['id'] as string | undefined) ?? randomUUID();
  const tileAId = payload['tileAId'] as string | undefined;
  const tileBId = payload['tileBId'] as string | undefined;
  if (!tileAId || !tileBId) return { ok: false, error: 'connection.create: tileAId and tileBId required' };
  const now = Date.now();
  try {
    // Idempotent: a re-create of the same id (e.g. restore hydration) is a no-op.
    const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(id);
    if (existing) return { ok: true, id };

    db.prepare(`
      INSERT INTO connections
        (id, workflow_id, tile_a_id, tile_b_id, from_tile_id, to_tile_id, semantic_type, label, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      (payload['workflowId'] as string | null) ?? null,
      tileAId,
      tileBId,
      (payload['fromTileId'] as string | null) ?? tileAId,
      (payload['toTileId'] as string | null) ?? tileBId,
      (payload['semanticType'] as string | undefined) ?? 'manual_connection',
      (payload['label'] as string | null) ?? null,
      'active',
      now,
      now,
    );
    emitKernelEvent({
      kind: 'connection.created',
      workflowId: payload['workflowId'] as string | undefined,
      data: { id, tileAId, tileBId, label: payload['label'] },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function connectionDelete(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'connection.delete: id required' };
  try {
    const info = db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    // DELETE is idempotent: a missing row means the desired end state already
    // holds. Still emit (when a row was removed) so renderers reconcile.
    if (info.changes > 0) {
      emitKernelEvent({ kind: 'connection.deleted', data: { id } });
    }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
