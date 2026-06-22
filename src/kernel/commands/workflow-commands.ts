import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import { emitKernelEvent } from '../events/index';
import type { CommandResult } from './types';
import { autoTriggerWorkflowEvaluation } from '../evals/auto-trigger';

function hasWorkflowColumn(db: KernelDB, name: string): boolean {
  const rows = db.prepare("PRAGMA table_info('workflows')").all() as Array<{ name: string }>;
  return rows.some((row) => row.name === name);
}

function normalizeBudgetJson(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return '{}';
    }
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '{}';
}

export function handleWorkflowCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.workflow.create': return workflowCreate(db, payload);
    case 'kernel.workflow.update': return workflowUpdate(db, payload);
    default: return { ok: false, error: `Unhandled workflow command: ${type}` };
  }
}

function workflowCreate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = (payload['id'] as string | undefined) ?? randomUUID();
  const name = payload['name'] as string | undefined;
  if (!name) return { ok: false, error: 'workflow.create: name required' };
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO workflows (id, name, objective, status, active_correlation_id, vault_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      (payload['objective'] as string | undefined) ?? '',
      (payload['status'] as string | undefined) ?? 'active',
      (payload['activeCorrelationId'] as string | null) ?? null,
      (payload['vaultPath'] as string | null) ?? null,
      now,
      now,
    );
    const patchFields: string[] = [];
    const patchValues: unknown[] = [];
    if (payload['mode'] !== undefined && hasWorkflowColumn(db, 'mode')) {
      patchFields.push('mode = ?');
      patchValues.push((payload['mode'] as string | null) ?? null);
    }
    const budgetJson = normalizeBudgetJson(payload['budgetJson'] ?? payload['budget']);
    if (budgetJson !== null && hasWorkflowColumn(db, 'budget_json')) {
      patchFields.push('budget_json = ?');
      patchValues.push(budgetJson);
    }
    if (patchFields.length > 0) {
      patchValues.push(id);
      db.prepare(`UPDATE workflows SET ${patchFields.join(', ')} WHERE id = ?`).run(...patchValues);
    }
    emitKernelEvent({ kind: 'workflow.created', workflowId: id, data: { id, name } });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function workflowUpdate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const id = payload['id'] as string | undefined;
  if (!id) return { ok: false, error: 'workflow.update: id required' };
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (payload['name'] !== undefined) { fields.push('name = ?'); values.push(payload['name']); }
    if (payload['objective'] !== undefined) { fields.push('objective = ?'); values.push(payload['objective']); }
    if (payload['status'] !== undefined) { fields.push('status = ?'); values.push(payload['status']); }
    if (payload['mode'] !== undefined && hasWorkflowColumn(db, 'mode')) {
      fields.push('mode = ?');
      values.push((payload['mode'] as string | null) ?? null);
    }
    const budgetJson = normalizeBudgetJson(payload['budgetJson'] ?? payload['budget']);
    if (budgetJson !== null && hasWorkflowColumn(db, 'budget_json')) {
      fields.push('budget_json = ?');
      values.push(budgetJson);
    }
    if (payload['checkpointState'] !== undefined && hasWorkflowColumn(db, 'checkpoint_state')) {
      fields.push('checkpoint_state = ?');
      values.push((payload['checkpointState'] as string | null) ?? null);
    }
    if (fields.length === 0) return { ok: false, error: 'workflow.update: no fields to update' };
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const info = db.prepare(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (info.changes === 0) return { ok: false, error: `workflow.update: workflow not found: ${id}` };
    if (payload['status'] === 'complete') {
      try {
        autoTriggerWorkflowEvaluation(db, id);
      } catch {
        // Evals are derived and non-authoritative; workflow updates do not depend on them.
      }
    }
    emitKernelEvent({ kind: 'workflow.updated', workflowId: id, data: payload });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
