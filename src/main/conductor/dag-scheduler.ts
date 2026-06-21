/**
 * DAG scheduler (R3b) — decides WHICH tasks are eligible to dispatch right now,
 * over the Kernel task graph (`task_dependencies` kind='blocks').
 *
 * This is deliberately a separate module, NOT an `if (dagMode)` branch inside
 * `conductor-loop.ts` (which stays one-approved-action-per-step). The scheduler
 * only computes the *eligible set*; the loop still executes a single approved
 * action through the same approval gate + Kernel command boundary. There is no
 * second orchestrator and no background writer — the Kernel `task.claim` gate
 * (`unmetBlockingDependencies`) is the enforcement that backs this set.
 *
 * A task is schedulable when it is `open` and every `blocks` upstream is
 * `complete` AND carries a `verification_passed` receipt. Independent branches
 * appear in the eligible set together (concurrency is realized by the caller).
 */

import type { KernelDB } from '../../kernel/database';
import { queryTaskDependencies, queryVerifiedTaskIds } from '../../kernel/tasks/index';

export interface SchedulerTask {
  id: string;
  status: string;
}

export interface SchedulerDependency {
  taskId: string;
  dependsOnTaskId: string;
  kind: string;
}

export interface DagSchedulerInput {
  tasks: SchedulerTask[];
  dependencies: SchedulerDependency[];
  /** Task ids that carry a verification_passed receipt. */
  verifiedTaskIds: Iterable<string>;
}

/**
 * Pure: the ids of tasks eligible to be dispatched now — `open` tasks whose every
 * `blocks` upstream is complete + verified. Stable order (input task order).
 */
export function schedulableTasks(input: DagSchedulerInput): string[] {
  const verified = new Set(input.verifiedTaskIds);
  const statusById = new Map(input.tasks.map((t) => [t.id, t.status]));
  const blocksByTask = new Map<string, string[]>();
  for (const dep of input.dependencies) {
    if (dep.kind !== 'blocks') continue;
    const list = blocksByTask.get(dep.taskId) ?? [];
    list.push(dep.dependsOnTaskId);
    blocksByTask.set(dep.taskId, list);
  }
  const upstreamSatisfied = (upstreamId: string): boolean =>
    statusById.get(upstreamId) === 'complete' && verified.has(upstreamId);

  return input.tasks
    .filter((task) => task.status === 'open')
    .filter((task) => (blocksByTask.get(task.id) ?? []).every(upstreamSatisfied))
    .map((task) => task.id);
}

/**
 * Read the scheduler input from the Kernel and return the eligible set. db is
 * passed explicitly (works for the live DB and for smoke/in-memory DBs alike).
 */
export function readSchedulableTasks(db: KernelDB, workflowId?: string): string[] {
  const tasks = (workflowId
    ? (db.prepare('SELECT id, status FROM tasks WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as SchedulerTask[])
    : (db.prepare('SELECT id, status FROM tasks ORDER BY created_at ASC').all() as SchedulerTask[]));
  return schedulableTasks({
    tasks,
    dependencies: queryTaskDependencies(db, workflowId),
    verifiedTaskIds: queryVerifiedTaskIds(db, workflowId),
  });
}
