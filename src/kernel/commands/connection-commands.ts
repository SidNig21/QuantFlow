import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import { emitKernelEvent } from '../events/index';
import { normalizeSemanticType } from '../workflows/index';
import type { CommandResult } from './types';

export function handleConnectionCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.connection.create': return connectionCreate(db, payload);
    case 'kernel.connection.update': return connectionUpdate(db, payload);
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

    // A string belongs to a workflow so its region can count it. Callers (manual
    // cable drop, shell RPC, main RPC) rarely pass workflowId, so derive it from
    // the endpoints: when both tiles share a workflow, the string inherits it.
    const workflowId = resolveConnectionWorkflowId(db, payload['workflowId'], tileAId, tileBId);

    db.prepare(`
      INSERT INTO connections
        (id, workflow_id, tile_a_id, tile_b_id, from_tile_id, to_tile_id, semantic_type, label, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workflowId,
      tileAId,
      tileBId,
      (payload['fromTileId'] as string | null) ?? tileAId,
      (payload['toTileId'] as string | null) ?? tileBId,
      // Coerce to a known semantic type so the canonical row is always valid.
      normalizeSemanticType(payload['semanticType']),
      (payload['label'] as string | null) ?? null,
      'active',
      now,
      now,
    );
    emitKernelEvent({
      kind: 'connection.created',
      workflowId: workflowId ?? undefined,
      data: { id, tileAId, tileBId, workflowId, label: payload['label'] },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolve the workflow a connection belongs to. An explicit payload value wins;
 * otherwise, when both endpoint tiles belong to the same (non-null) workflow,
 * the connection inherits it. Cross-workflow or unknown tiles yield null (a
 * loose, workflow-agnostic link).
 */
function resolveConnectionWorkflowId(
  db: KernelDB,
  explicit: unknown,
  tileAId: string,
  tileBId: string,
): string | null {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const a = db.prepare('SELECT workflow_id FROM tiles WHERE id = ?').get(tileAId) as
    | { workflow_id: string | null }
    | undefined;
  const b = db.prepare('SELECT workflow_id FROM tiles WHERE id = ?').get(tileBId) as
    | { workflow_id: string | null }
    | undefined;
  if (a?.workflow_id && b?.workflow_id && a.workflow_id === b.workflow_id) {
    return a.workflow_id;
  }
  return null;
}

/**
 * Update a connection's semantic type and/or label. This is how a string gains
 * meaning (delegation, verification, …) after it is drawn — the operator or the
 * Conductor declares it; the Kernel stays the owner of the type. Idempotent and
 * scoped to the two mutable fields; endpoints never change here.
 */
function connectionUpdate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'connection.update: id required' };
  try {
    const existing = db.prepare('SELECT workflow_id FROM connections WHERE id = ?').get(id) as
      | { workflow_id: string | null }
      | undefined;
    if (!existing) return { ok: false, error: `connection.update: connection not found: ${id}` };

    const fields: string[] = [];
    const values: unknown[] = [];
    if (payload['semanticType'] !== undefined) {
      fields.push('semantic_type = ?');
      values.push(normalizeSemanticType(payload['semanticType']));
    }
    if (payload['label'] !== undefined) {
      fields.push('label = ?');
      values.push((payload['label'] as string | null) ?? null);
    }
    if (fields.length === 0) return { ok: false, error: 'connection.update: no fields to update' };
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE connections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    emitKernelEvent({
      kind: 'connection.updated',
      workflowId: existing.workflow_id ?? undefined,
      data: { id, semanticType: payload['semanticType'], label: payload['label'] },
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
