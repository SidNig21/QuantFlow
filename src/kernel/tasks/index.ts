/**
 * Kernel Task Commands — v3 lifecycle handlers.
 *
 * Routes kernel.task.* commands. Every handler:
 *   1. loads the task and checks it exists,
 *   2. asserts the transition is legal via the state machine,
 *   3. writes the task row (status + lifecycle timestamps),
 *   4. posts the append-only receipt(s) for the transition,
 *   5. emits an in-process Kernel event.
 *
 * The hard rule is enforced here + in validators.ts:
 *   working → complete is rejected; completion requires the submitted → verifying
 *   gate and a verification_passed receipt, unless an explicit legacy flag is set.
 *
 * See KERNEL_CONSTITUTION.md, docs/v3/AUTHORITY_RULES.md.
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import type { TaskRow, TaskStatus } from '../schema/types';
import { emitKernelEvent } from '../events/index';
import { postReceipt } from '../receipts/index';
import { verifyTaskArtifacts } from '../artifacts/verify';
import { assignWorkerToTask, ensureWorkerInstanceForTile } from '../worker-instances/index';
import type { CommandResult } from '../commands/types';
import { assertTransition } from './state-machine';
import {
  requireString,
  validateComplete,
  validateVerifierDistinct,
} from './validators';

/** A claimed task untouched for this long may be reclaimed (returned to open). */
const STALE_CLAIM_MS = 5 * 60 * 1000;

export function handleTaskCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.task.create': return taskCreate(db, payload);
    case 'kernel.task.claim': return taskClaim(db, payload);
    case 'kernel.task.start': return taskStart(db, payload);
    case 'kernel.task.submit': return taskSubmit(db, payload);
    case 'kernel.task.verify': return taskVerify(db, payload);
    case 'kernel.task.reject': return taskReject(db, payload);
    case 'kernel.task.complete': return taskComplete(db, payload);
    case 'kernel.task.block': return taskBlock(db, payload);
    case 'kernel.task.fail': return taskFail(db, payload);
    default: return { ok: false, error: `Unhandled task command: ${type}` };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTask(db: KernelDB, id: string): TaskRow | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
}

function setStatus(
  db: KernelDB,
  id: string,
  status: TaskStatus,
  extraColumns: Record<string, number | string | null> = {},
): void {
  const cols = ['status = ?', 'updated_at = ?'];
  const vals: (number | string | null)[] = [status, Date.now()];
  for (const [col, val] of Object.entries(extraColumns)) {
    cols.push(`${col} = ?`);
    vals.push(val);
  }
  vals.push(id);
  db.prepare(`UPDATE tasks SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

function emitTaskEvent(task: TaskRow, kind: string, data: Record<string, unknown> = {}): void {
  emitKernelEvent({
    kind,
    taskId: task.id,
    workflowId: task.workflow_id ?? undefined,
    data,
  });
}

function transition(
  db: KernelDB,
  payload: Record<string, unknown>,
  to: TaskStatus,
): { ok: false; error: string } | { ok: true; task: TaskRow } {
  const idCheck = requireString(payload, 'taskId');
  if (!idCheck.ok) return { ok: false, error: idCheck.error! };
  const id = payload['taskId'] as string;
  const task = getTask(db, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };
  const check = assertTransition(task.status, to);
  if (!check.ok) return { ok: false, error: check.error! };
  return { ok: true, task };
}

function normalizeArtifactRefs(payload: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const artifactId = payload['artifactId'];
  if (typeof artifactId === 'string' && artifactId.trim()) refs.push(artifactId.trim());
  const artifactRefs = payload['artifactRefs'];
  if (Array.isArray(artifactRefs)) {
    for (const ref of artifactRefs) {
      if (typeof ref === 'string' && ref.trim()) refs.push(ref.trim());
    }
  }
  return [...new Set(refs)];
}

function latestSubmittedArtifactRefs(db: KernelDB, taskId: string): string[] {
  const row = db
    .prepare(
      `SELECT artifact_refs_json FROM receipts
       WHERE task_id = ? AND type = 'task_submitted'
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(taskId) as { artifact_refs_json: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.artifact_refs_json);
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === 'string' && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function attemptMetadata(payload: Record<string, unknown>): Record<string, unknown> {
  const attemptId = payload['attemptId'];
  return typeof attemptId === 'string' && attemptId.trim()
    ? { attemptId: attemptId.trim() }
    : {};
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function taskCreate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const titleCheck = requireString(payload, 'title');
  if (!titleCheck.ok) return { ok: false, error: titleCheck.error };
  const objectiveCheck = requireString(payload, 'objective');
  if (!objectiveCheck.ok) return { ok: false, error: objectiveCheck.error };

  const id = (payload['id'] as string | undefined) ?? randomUUID();
  const correlationId = (payload['correlationId'] as string | undefined) ?? id;
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO tasks
         (id, workflow_id, parent_task_id, correlation_id, title, objective, status,
          owner_worker_id, source_worker_id, target_worker_id, priority, approval_level,
          created_at, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      (payload['workflowId'] as string | null) ?? null,
      (payload['parentTaskId'] as string | null) ?? null,
      correlationId,
      payload['title'] as string,
      payload['objective'] as string,
      (payload['ownerWorkerId'] as string | null) ?? null,
      (payload['sourceWorkerId'] as string | null) ?? null,
      (payload['targetWorkerId'] as string | null) ?? null,
      Number(payload['priority'] ?? 0),
      (payload['approvalLevel'] as string | undefined) ?? 'none',
      now,
      now,
      JSON.stringify((payload['metadata'] as Record<string, unknown> | undefined) ?? {}),
    );
    const task = getTask(db, id)!;
    postReceipt(db, {
      type: 'task_created',
      taskId: id,
      workflowId: task.workflow_id,
      correlationId,
      summary: payload['title'] as string,
    });
    emitTaskEvent(task, 'task.created', { status: 'open' });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskClaim(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const idCheck = requireString(payload, 'taskId');
  if (!idCheck.ok) return { ok: false, error: idCheck.error };
  const id = payload['taskId'] as string;
  const task = getTask(db, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };

  // Stale-claim recovery: a claimed task untouched past the threshold is
  // returned to open by the Kernel so it can be reclaimed.
  if (task.status === 'claimed') {
    const age = Date.now() - (task.claimed_at ?? task.updated_at);
    if (age < STALE_CLAIM_MS) {
      return { ok: false, error: `task already claimed (${id})` };
    }
  } else if (task.status !== 'open') {
    const check = assertTransition(task.status, 'claimed');
    if (!check.ok) return { ok: false, error: check.error };
  }

  try {
    const now = Date.now();
    // Resolve the owning worker: explicit ownerWorkerId wins; otherwise, if a
    // tileId is supplied, ensure/derive the tile's default WorkerInstance so the
    // claimed task surfaces on that tile's State Card (Goal 4 link).
    let ownerWorkerId =
      (payload['ownerWorkerId'] as string | null) ?? task.owner_worker_id ?? null;
    if (!ownerWorkerId && typeof payload['tileId'] === 'string') {
      ownerWorkerId = ensureWorkerInstanceForTile(db, payload['tileId'] as string);
    }
    if (!ownerWorkerId) {
      return {
        ok: false,
        error: 'task.claim requires ownerWorkerId or tileId resolving to a WorkerInstance',
      };
    }
    setStatus(db, id, 'claimed', {
      owner_worker_id: ownerWorkerId,
      claimed_at: now,
    });
    assignWorkerToTask(db, ownerWorkerId, id);
    const updated = getTask(db, id)!;
    postReceipt(db, {
      type: 'task_claimed',
      taskId: id,
      workflowId: updated.workflow_id,
      workerId: updated.owner_worker_id,
      correlationId: updated.correlation_id,
      summary: (payload['summary'] as string | undefined) ?? 'task claimed',
    });
    emitTaskEvent(updated, 'task.claimed', { status: 'claimed' });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskStart(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const t = transition(db, payload, 'working');
  if (!t.ok) return t;
  try {
    setStatus(db, t.task.id, 'working');
    const updated = getTask(db, t.task.id)!;
    postReceipt(db, {
      type: 'task_started',
      taskId: updated.id,
      workflowId: updated.workflow_id,
      workerId: updated.owner_worker_id,
      correlationId: updated.correlation_id,
      summary: (payload['summary'] as string | undefined) ?? 'task started',
    });
    emitTaskEvent(updated, 'task.started', { status: 'working' });
    return { ok: true, id: updated.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskSubmit(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const t = transition(db, payload, 'submitted');
  if (!t.ok) return t;
  const artifactRefs = normalizeArtifactRefs(payload);
  if (artifactRefs.length === 0) {
    return { ok: false, error: 'task.submit requires artifactId or non-empty artifactRefs' };
  }
  try {
    setStatus(db, t.task.id, 'submitted', { submitted_at: Date.now() });
    const updated = getTask(db, t.task.id)!;
    postReceipt(db, {
      type: 'task_submitted',
      taskId: updated.id,
      workflowId: updated.workflow_id,
      workerId: updated.owner_worker_id,
      correlationId: updated.correlation_id,
      summary: (payload['summary'] as string | undefined) ?? 'result submitted',
      artifactRefs,
      metadata: attemptMetadata(payload),
    });
    emitTaskEvent(updated, 'task.submitted', { status: 'submitted' });
    return { ok: true, id: updated.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * kernel.task.verify — the verification action.
 *
 * verdict 'pass' (default): submitted → verifying (verification_started),
 *   post verification_passed, then verifying → complete (task_completed).
 * verdict 'fail': behaves like reject — verification_failed, → working.
 *
 * Workers may not verify their own task (see validateVerifierDistinct).
 */
function taskVerify(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const idCheck = requireString(payload, 'taskId');
  if (!idCheck.ok) return { ok: false, error: idCheck.error };
  const id = payload['taskId'] as string;
  const task = getTask(db, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };

  const verifierWorkerId = (payload['verifierWorkerId'] as string | null) ?? null;
  const operatorOverride = payload['operatorOverride'] === true;
  const distinct = validateVerifierDistinct(task, verifierWorkerId, operatorOverride);
  if (!distinct.ok) return { ok: false, error: distinct.error };

  const verdict = (payload['verdict'] as string | undefined) ?? 'pass';
  const summary = (payload['summary'] as string | undefined) ?? `verification ${verdict}`;
  const explicitArtifactRefs = normalizeArtifactRefs(payload);
  const submittedArtifactRefs = explicitArtifactRefs.length > 0
    ? explicitArtifactRefs
    : latestSubmittedArtifactRefs(db, id);
  const metadataBase = attemptMetadata(payload);

  // Enter verifying from submitted.
  if (task.status === 'submitted') {
    setStatus(db, id, 'verifying');
    const verifying = getTask(db, id)!;
    postReceipt(db, {
      type: 'verification_started',
      taskId: id,
      workflowId: verifying.workflow_id,
      workerId: verifierWorkerId,
      correlationId: verifying.correlation_id,
      summary: 'verification started',
      artifactRefs: submittedArtifactRefs,
      metadata: metadataBase,
    });
    emitTaskEvent(verifying, 'task.verifying', { status: 'verifying' });
  } else if (task.status !== 'verifying') {
    return {
      ok: false,
      error: `verify requires status 'submitted' or 'verifying' (task is '${task.status}')`,
    };
  }

  try {
    if (verdict === 'fail') {
      return rejectFromVerifying(db, id, verifierWorkerId, summary, submittedArtifactRefs, metadataBase);
    }

    const structural = verifyTaskArtifacts(db, {
      taskId: id,
      artifactRefs: submittedArtifactRefs,
      artifactRoot: (payload['artifactRoot'] as string | null) ?? null,
    });
    if (!structural.ok) {
      return rejectFromVerifying(
        db,
        id,
        verifierWorkerId,
        'verification failed: structural artifact check',
        submittedArtifactRefs,
        { ...metadataBase, structural },
      );
    }

    // Pass: record the verification_passed receipt, then complete.
    const verifying = getTask(db, id)!;
    postReceipt(db, {
      type: 'verification_passed',
      taskId: id,
      workflowId: verifying.workflow_id,
      workerId: verifierWorkerId,
      correlationId: verifying.correlation_id,
      summary,
      artifactRefs: submittedArtifactRefs,
      metadata: { ...metadataBase, structural },
    });
    emitTaskEvent(verifying, 'task.verification_passed', {});

    const now = Date.now();
    setStatus(db, id, 'complete', {
      verified_at: verifying.verified_at ?? now,
      completed_at: now,
    });
    if (verifying.owner_worker_id) assignWorkerToTask(db, verifying.owner_worker_id, null);
    const completed = getTask(db, id)!;
    postReceipt(db, {
      type: 'task_completed',
      taskId: id,
      workflowId: completed.workflow_id,
      workerId: completed.owner_worker_id,
      correlationId: completed.correlation_id,
      summary: 'task completed (verified)',
      metadata: { verified: true },
    });
    emitTaskEvent(completed, 'task.completed', { status: 'complete', verified: true });
    return { ok: true, id, data: { status: 'complete', verified: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskReject(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const idCheck = requireString(payload, 'taskId');
  if (!idCheck.ok) return { ok: false, error: idCheck.error };
  const id = payload['taskId'] as string;
  const task = getTask(db, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };

  const verifierWorkerId = (payload['verifierWorkerId'] as string | null) ?? null;
  const operatorOverride = payload['operatorOverride'] === true;
  const distinct = validateVerifierDistinct(task, verifierWorkerId, operatorOverride);
  if (!distinct.ok) return { ok: false, error: distinct.error };

  const reason = (payload['reason'] as string | undefined) ?? 'verification rejected';

  if (task.status === 'submitted') {
    setStatus(db, id, 'verifying');
    const verifying = getTask(db, id)!;
    postReceipt(db, {
      type: 'verification_started',
      taskId: id,
      workflowId: verifying.workflow_id,
      workerId: verifierWorkerId,
      correlationId: verifying.correlation_id,
      summary: 'verification started',
    });
    emitTaskEvent(verifying, 'task.verifying', { status: 'verifying' });
  } else if (task.status !== 'verifying') {
    return {
      ok: false,
      error: `reject requires status 'submitted' or 'verifying' (task is '${task.status}')`,
    };
  }

  try {
    return rejectFromVerifying(db, id, verifierWorkerId, reason);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Post verification_failed and return the task to working. */
function rejectFromVerifying(
  db: KernelDB,
  id: string,
  verifierWorkerId: string | null,
  summary: string,
  artifactRefs: string[] = [],
  metadata: Record<string, unknown> = {},
): CommandResult {
  const verifying = getTask(db, id)!;
  postReceipt(db, {
    type: 'verification_failed',
    taskId: id,
    workflowId: verifying.workflow_id,
    workerId: verifierWorkerId,
    correlationId: verifying.correlation_id,
    summary,
    artifactRefs,
    metadata,
  });
  setStatus(db, id, 'working');
  const working = getTask(db, id)!;
  emitTaskEvent(working, 'task.verification_failed', { status: 'working' });
  return { ok: true, id, data: { status: 'working', verified: false } };
}

/**
 * kernel.task.complete — explicit completion command.
 *
 * Normal path requires status 'verifying' + a verification_passed receipt.
 * Legacy path (payload.legacy === true) allows completion without verification
 * and tags the receipt so the bypass is auditable. See ENVOY.md.
 */
function taskComplete(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const idCheck = requireString(payload, 'taskId');
  if (!idCheck.ok) return { ok: false, error: idCheck.error };
  const id = payload['taskId'] as string;
  const task = getTask(db, id);
  if (!task) return { ok: false, error: `task not found: ${id}` };

  const legacy = payload['legacy'] === true;
  const guard = validateComplete(db, task, legacy);
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    const now = Date.now();
    setStatus(db, id, 'complete', {
      verified_at: task.verified_at ?? (legacy ? null : now),
      completed_at: now,
    });
    if (task.owner_worker_id) assignWorkerToTask(db, task.owner_worker_id, null);
    const completed = getTask(db, id)!;
    postReceipt(db, {
      type: 'task_completed',
      taskId: id,
      workflowId: completed.workflow_id,
      workerId: completed.owner_worker_id,
      correlationId: completed.correlation_id,
      summary: legacy
        ? (payload['summary'] as string | undefined) ?? 'task completed (legacy, verification bypassed)'
        : (payload['summary'] as string | undefined) ?? 'task completed (verified)',
      metadata: legacy ? { legacy: true, bypassedVerification: true } : { verified: true },
    });
    emitTaskEvent(completed, 'task.completed', { status: 'complete', verified: !legacy, legacy });
    return { ok: true, id, data: { status: 'complete', verified: !legacy, legacy } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskBlock(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const t = transition(db, payload, 'blocked');
  if (!t.ok) return t;
  try {
    setStatus(db, t.task.id, 'blocked');
    const updated = getTask(db, t.task.id)!;
    postReceipt(db, {
      type: 'task_blocked',
      taskId: updated.id,
      workflowId: updated.workflow_id,
      workerId: updated.owner_worker_id,
      correlationId: updated.correlation_id,
      summary: (payload['reason'] as string | undefined) ?? 'task blocked',
    });
    emitTaskEvent(updated, 'task.blocked', { status: 'blocked' });
    return { ok: true, id: updated.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function taskFail(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const t = transition(db, payload, 'failed');
  if (!t.ok) return t;
  try {
    setStatus(db, t.task.id, 'failed');
    if (t.task.owner_worker_id) assignWorkerToTask(db, t.task.owner_worker_id, null);
    const updated = getTask(db, t.task.id)!;
    postReceipt(db, {
      type: 'task_failed',
      taskId: updated.id,
      workflowId: updated.workflow_id,
      workerId: updated.owner_worker_id,
      correlationId: updated.correlation_id,
      summary: (payload['reason'] as string | undefined) ?? 'task failed',
    });
    emitTaskEvent(updated, 'task.failed', { status: 'failed' });
    return { ok: true, id: updated.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface TaskSnapshot {
  id: string;
  workflowId: string | null;
  correlationId: string;
  title: string;
  objective: string;
  status: TaskStatus;
  ownerWorkerId: string | null;
  priority: number;
  createdAt: number;
  updatedAt: number;
  claimedAt: number | null;
  submittedAt: number | null;
  verifiedAt: number | null;
  completedAt: number | null;
}

function rowToTask(r: TaskRow): TaskSnapshot {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    correlationId: r.correlation_id,
    title: r.title,
    objective: r.objective,
    status: r.status,
    ownerWorkerId: r.owner_worker_id,
    priority: r.priority,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    claimedAt: r.claimed_at,
    submittedAt: r.submitted_at,
    verifiedAt: r.verified_at,
    completedAt: r.completed_at,
  };
}

export function queryTaskList(
  db: KernelDB,
  params: { workflowId?: string; status?: TaskStatus; limit?: number } = {},
): TaskSnapshot[] {
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 200;
  const clauses: string[] = [];
  const vals: (string | number)[] = [];
  if (params.workflowId) {
    clauses.push('workflow_id = ?');
    vals.push(params.workflowId);
  }
  if (params.status) {
    clauses.push('status = ?');
    vals.push(params.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  vals.push(limit);
  const rows = db
    .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(...vals) as TaskRow[];
  return rows.map(rowToTask);
}

export function queryTaskGet(db: KernelDB, taskId: string): TaskSnapshot | null {
  const row = getTask(db, taskId);
  return row ? rowToTask(row) : null;
}
