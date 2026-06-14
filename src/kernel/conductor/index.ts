/**
 * Kernel Conductor surface — v3 Goal 5A (read-only).
 *
 * The Conductor is a planner. In Goal 5A it may ONLY read Kernel truth and post
 * append-only planning receipts. It owns no state and advances no task. Spawn,
 * assign, verify, block, and autonomous loops are out of scope until Goal 6A /
 * 5C (see docs/v3/WORKER_RECONCILIATION.md).
 *
 * This module is the Kernel-owned half:
 *  - queryConductorContext: one aggregate read of the live world.
 *  - queryWorkflowSnapshot: workflow row + counts.
 *  - kernel.conductor.plan: append a `planning` receipt (the only write).
 */

import type { KernelDB } from '../database';
import type { CommandResult } from '../commands/types';
import { emitKernelEvent } from '../events/index';
import { postReceipt, queryReceiptList, type ReceiptSnapshot } from '../receipts/index';
import { queryTaskList, type TaskSnapshot } from '../tasks/index';
import { queryStateCardList, type StateCardSnapshot } from '../state-cards/index';

export interface WorkflowSnapshot {
  id: string;
  name: string;
  objective: string;
  status: string;
  tileCount: number;
  taskCount: number;
  receiptCount: number;
  openTaskCount: number;
  blockedTaskCount: number;
}

export interface ConductorTileRef {
  id: string;
  displayName: string;
  tileKind: string;
  status: string;
}

export interface ConductorContext {
  workflow: WorkflowSnapshot | null;
  tiles: ConductorTileRef[];
  stateCards: StateCardSnapshot[];
  tasks: TaskSnapshot[];
  recentReceipts: ReceiptSnapshot[];
}

export function queryWorkflowSnapshot(db: KernelDB, workflowId: string): WorkflowSnapshot | null {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as
    | { id: string; name: string; objective: string; status: string }
    | undefined;
  if (!wf) return null;
  const count = (sql: string, ...args: unknown[]): number => {
    const row = db.prepare(sql).get(...args) as { n: number } | undefined;
    return row?.n ?? 0;
  };
  return {
    id: wf.id,
    name: wf.name,
    objective: wf.objective,
    status: wf.status,
    tileCount: count('SELECT COUNT(*) AS n FROM tiles WHERE workflow_id = ?', workflowId),
    taskCount: count('SELECT COUNT(*) AS n FROM tasks WHERE workflow_id = ?', workflowId),
    receiptCount: count('SELECT COUNT(*) AS n FROM receipts WHERE workflow_id = ?', workflowId),
    openTaskCount: count("SELECT COUNT(*) AS n FROM tasks WHERE workflow_id = ? AND status = 'open'", workflowId),
    blockedTaskCount: count("SELECT COUNT(*) AS n FROM tasks WHERE workflow_id = ? AND status = 'blocked'", workflowId),
  };
}

function readTiles(db: KernelDB, workflowId?: string): ConductorTileRef[] {
  const rows = workflowId
    ? (db
        .prepare('SELECT id, display_name, tile_kind, status FROM tiles WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(workflowId) as Record<string, unknown>[])
    : (db
        .prepare('SELECT id, display_name, tile_kind, status FROM tiles ORDER BY created_at ASC')
        .all() as Record<string, unknown>[]);
  return rows.map((r) => ({
    id: r['id'] as string,
    displayName: r['display_name'] as string,
    tileKind: r['tile_kind'] as string,
    status: r['status'] as string,
  }));
}

/**
 * One aggregate read of the live Kernel world for the Conductor: workflow,
 * tiles, State Cards, tasks, and recent receipts. Strictly read-only.
 */
export function queryConductorContext(
  db: KernelDB,
  params: { workflowId?: string; receiptLimit?: number } = {},
): ConductorContext {
  const { workflowId, receiptLimit = 20 } = params;
  return {
    workflow: workflowId ? queryWorkflowSnapshot(db, workflowId) : null,
    tiles: readTiles(db, workflowId),
    stateCards: queryStateCardList(db, workflowId ? { workflowId } : {}),
    tasks: queryTaskList(db, workflowId ? { workflowId } : {}),
    recentReceipts: queryReceiptList(db, { limit: receiptLimit }),
  };
}

export function handleConductorCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  if (type !== 'kernel.conductor.plan') {
    return { ok: false, error: `Unhandled conductor command: ${type}` };
  }
  return conductorPlan(db, payload);
}

/**
 * Append a Conductor planning receipt. This is the ONLY write the read-only
 * Conductor may make. It never transitions a task. Workflow-scoped by default
 * (task_id optional). metadata carries the structured plan.
 */
function conductorPlan(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const summary = payload['summary'] as string | undefined;
  if (!summary || summary.trim().length === 0) {
    return { ok: false, error: 'conductor.plan: summary required' };
  }
  try {
    const id = postReceipt(db, {
      type: 'planning',
      workflowId: (payload['workflowId'] as string | null) ?? null,
      taskId: (payload['taskId'] as string | null) ?? null,
      tileId: (payload['tileId'] as string | null) ?? null,
      correlationId: (payload['correlationId'] as string | null) ?? null,
      summary,
      metadata: {
        plan: payload['plan'] ?? summary,
        reads: payload['reads'] ?? null,
        blockers: payload['blockers'] ?? null,
        nextAction: payload['nextAction'] ?? null,
        toolCalls: payload['toolCalls'] ?? null,
        requestApproval: payload['requestApproval'] === true,
        source: 'conductor',
      },
    });
    emitKernelEvent({
      kind: 'conductor.plan_posted',
      workflowId: (payload['workflowId'] as string | undefined) ?? undefined,
      data: { id, summary, requestApproval: payload['requestApproval'] === true },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
