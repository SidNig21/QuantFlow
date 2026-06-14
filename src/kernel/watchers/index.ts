/**
 * State Card Watcher — v3 (Goal 4).
 *
 * Maintains the Kernel `state_cards` table by consuming Kernel events:
 *   - task lifecycle events (task.created/claimed/started/submitted/verifying/
 *     verification_passed/verification_failed/completed/blocked/failed)
 *   - receipt events (receipt.posted)
 *   - tile lifecycle events (tile.created)
 *   - (future) worker status + terminal significance signals
 *
 * It promotes *meaningful* status only — current task, status, blocker, last
 * meaningful update, next action, last receipt, artifacts. It never dumps raw
 * terminal output into the card. See docs/v3/AUTHORITY_RULES.md.
 */

import type { KernelDB } from '../database';
import type { StateCardStatus, TaskStatus, WorkerInstanceStatus } from '../schema/types';
import { onKernelEvent, type KernelEventPayload } from '../events/index';
import { upsertStateCard } from '../state-cards/index';

const TASK_STATUS_TO_CARD: Record<TaskStatus, StateCardStatus> = {
  open: 'idle',
  claimed: 'idle',
  working: 'active',
  submitted: 'active',
  verifying: 'active',
  complete: 'complete',
  blocked: 'blocked',
  failed: 'error',
};

const NEXT_ACTION: Record<StateCardStatus, string> = {
  idle: 'Awaiting start',
  active: 'Work in progress',
  blocked: 'Resolve blocker',
  complete: '—',
  error: 'Review failure',
};

const EVENT_SUMMARY: Record<string, string> = {
  'task.created': 'Task created',
  'task.claimed': 'Task claimed',
  'task.started': 'Working',
  'task.submitted': 'Result submitted',
  'task.verifying': 'Verification started',
  'task.verification_passed': 'Verification passed',
  'task.verification_failed': 'Verification failed — returned to working',
  'task.completed': 'Task complete',
  'task.blocked': 'Blocked',
  'task.failed': 'Failed',
};

const CAVEMAN: Record<StateCardStatus, string> = {
  idle: 'WAIT FOR WORK.',
  active: 'DOING WORK.',
  blocked: 'STUCK. NEED HELP.',
  complete: 'WORK DONE. GOOD.',
  error: 'WORK BROKE.',
};

// Worker runtime status → State Card status (Goal 6A). The State Card reflects
// Kernel-owned worker status when no task is actively driving the card.
const WORKER_STATUS_TO_CARD: Record<WorkerInstanceStatus, StateCardStatus> = {
  spawning: 'active',
  active: 'active',
  idle: 'idle',
  stopped: 'idle',
  error: 'error',
};

const WORKER_EVENT_SUMMARY: Record<string, string> = {
  'worker.spawned': 'Worker spawning',
  'worker.status_updated': 'Worker status updated',
  'worker.stopped': 'Worker stopped',
};

interface TilePlacement {
  tileId: string;
  workflowId: string | null;
  workerId: string | null;
  status: TaskStatus;
}

/** Resolve which tile a task is shown on, via its owning worker instance. */
function placementForTask(db: KernelDB, taskId: string): TilePlacement | null {
  const row = db
    .prepare(
      `SELECT wi.tile_id AS tile_id, t.workflow_id AS workflow_id,
              t.owner_worker_id AS worker_id, t.status AS status
         FROM tasks t
         LEFT JOIN worker_instances wi ON wi.id = t.owner_worker_id
        WHERE t.id = ?`,
    )
    .get(taskId) as
    | { tile_id: string | null; workflow_id: string | null; worker_id: string | null; status: TaskStatus }
    | undefined;
  if (!row || !row.tile_id) return null;
  return {
    tileId: row.tile_id,
    workflowId: row.workflow_id,
    workerId: row.worker_id,
    status: row.status,
  };
}

function artifactsForTask(db: KernelDB, taskId: string): unknown[] {
  const rows = db
    .prepare('SELECT kind, uri, summary FROM artifacts WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as { kind: string; uri: string | null; summary: string | null }[];
  return rows.map((r) => ({ kind: r.kind, uri: r.uri, summary: r.summary }));
}

function latestReceiptSummary(db: KernelDB, taskId: string): string | null {
  const row = db
    .prepare('SELECT summary FROM receipts WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get(taskId) as { summary: string } | undefined;
  return row?.summary ?? null;
}

/**
 * Apply a single Kernel event to the state_cards table. Exported for testing;
 * the live watcher just forwards every Kernel event here.
 */
export function applyEventToStateCards(db: KernelDB, payload: KernelEventPayload): void {
  const kind = payload.kind;

  // Ignore our own writes to avoid feedback loops.
  if (kind.startsWith('state_card.')) return;

  // New tile → seed an idle card so the flip always has something to show.
  if (kind === 'tile.created' && payload.tileId) {
    upsertStateCard(db, payload.tileId, {
      workflowId: payload.workflowId ?? null,
      status: 'idle',
      lastMeaningfulUpdate: 'Tile created',
      nextAction: NEXT_ACTION.idle,
      cavemanSummary: CAVEMAN.idle,
    });
    return;
  }

  // Receipt posted → record the latest evidence pointer + promoted summary.
  if (kind === 'receipt.posted' && payload.taskId) {
    const placement = placementForTask(db, payload.taskId);
    if (!placement) return;
    const data = (payload.data ?? {}) as { id?: string; type?: string; summary?: string };
    upsertStateCard(db, placement.tileId, {
      workflowId: placement.workflowId,
      workerId: placement.workerId,
      currentTaskId: payload.taskId,
      lastReceiptId: data.id ?? null,
      lastMeaningfulUpdate: data.summary || EVENT_SUMMARY[kind] || 'Update',
      artifacts: artifactsForTask(db, payload.taskId),
    });
    return;
  }

  // Worker lifecycle → reflect Kernel-owned worker status on the tile's card.
  if (kind.startsWith('worker.') && payload.tileId) {
    const row = db
      .prepare('SELECT status FROM worker_instances WHERE tile_id = ? ORDER BY created_at ASC LIMIT 1')
      .get(payload.tileId) as { status: WorkerInstanceStatus } | undefined;
    const workerStatus = row?.status ?? 'idle';
    const cardStatus = WORKER_STATUS_TO_CARD[workerStatus] ?? 'idle';
    upsertStateCard(db, payload.tileId, {
      workflowId: payload.workflowId ?? null,
      status: cardStatus,
      lastMeaningfulUpdate: WORKER_EVENT_SUMMARY[kind] ?? 'Worker update',
      nextAction: NEXT_ACTION[cardStatus],
      cavemanSummary: CAVEMAN[cardStatus],
    });
    return;
  }

  // Task lifecycle → promote current task + status + next action.
  if (kind.startsWith('task.') && payload.taskId) {
    const placement = placementForTask(db, payload.taskId);
    if (!placement) return;
    const cardStatus = TASK_STATUS_TO_CARD[placement.status] ?? 'idle';
    const blocker = placement.status === 'blocked' ? latestReceiptSummary(db, payload.taskId) : null;
    upsertStateCard(db, placement.tileId, {
      workflowId: placement.workflowId,
      workerId: placement.workerId,
      currentTaskId: payload.taskId,
      status: cardStatus,
      blocker,
      lastMeaningfulUpdate: EVENT_SUMMARY[kind] ?? 'Update',
      nextAction: NEXT_ACTION[cardStatus],
      cavemanSummary: CAVEMAN[cardStatus],
    });
  }
}

let registered = false;

/**
 * Register the live State Card watcher on the in-process Kernel event bus.
 * Idempotent — safe to call once during app startup.
 */
export function startStateCardWatcher(db: KernelDB): void {
  if (registered) return;
  registered = true;
  onKernelEvent((payload) => {
    try {
      applyEventToStateCards(db, payload);
    } catch (err) {
      console.error('[state-card-watcher] failed to apply event:', err);
    }
  });
}
