/**
 * Conductor native actions — v3 Goal 5C.
 *
 * Single-step, operator-triggered mutation tools. Each is a THIN native binding
 * over existing Kernel authority — no business logic, no private state, no MCP,
 * no terminal_write. The operator triggers one action at a time; the Conductor
 * may only propose them.
 *
 *   create_task / assign_task / submit_task / verify_task / reject_task /
 *   block_task   -> Kernel task commands (which post the canonical receipts)
 *   spawn_role    -> the approved shell role-spawn path (deps.spawnRole), which
 *                    starts the runtime and is itself gated by kernel.worker.spawn
 *   connect_tiles -> kernel.connection.create
 *
 * assign_task = claim + start: it both assigns the task to a worker/tile and
 * activates it (claimed → working), so the worker can then submit. Completion is
 * never exposed raw — verify_task drives the verified path (verification_passed
 * → task_completed), so a task can't complete without verification evidence.
 */

import { dispatchKernelCommand, type CommandResult } from '../../kernel/commands/index';
import { buildContextEnvelope, type ContextEnvelopeV0 } from '../../kernel/context/envelope';
import type { TaskSnapshot } from '../../kernel/tasks/index';
import type { WorkerSnapshot } from '../../kernel/worker-instances/index';
import type { HarnessKind, ReceiptDraft, WorkerHandle, WorkerHarness } from '../../harness/types';

export type ConductorActionDispatch = (
  type: string,
  payload: Record<string, unknown>,
  requestedBy?: string,
) => Promise<CommandResult>;

/**
 * Invoke the approved shell role-spawn path (canvas.roleSpawn → spawnRoleTileAt),
 * which starts the shipped terminal/herdr runtime AND is gated by
 * kernel.worker.spawn (Goal 6A). Injected by the wiring layer because it crosses
 * into the Electron app; the Conductor never starts a runtime itself.
 */
export type ConductorSpawnRole = (
  args: Record<string, unknown>,
) => Promise<CommandResult>;

export interface ConductorActionDeps {
  spawnRole?: ConductorSpawnRole;
  getTask?: (taskId: string) => TaskSnapshot | null | Promise<TaskSnapshot | null>;
  getWorker?: (workerId: string) => WorkerSnapshot | null | Promise<WorkerSnapshot | null>;
  getWorkerHarness?: (kind: HarnessKind) => WorkerHarness;
  buildContextEnvelope?: (taskId: string) => ContextEnvelopeV0 | null | Promise<ContextEnvelopeV0 | null>;
}

export const CONDUCTOR_ACTIONS = [
  'create_task',
  'assign_task',
  'submit_task',
  'verify_task',
  'reject_task',
  'block_task',
  'spawn_role',
  'connect_tiles',
] as const;

export type ConductorAction = (typeof CONDUCTOR_ACTIONS)[number];

const REQUESTED_BY = 'conductor';

function rec(args: unknown): Record<string, unknown> {
  return (args as Record<string, unknown>) ?? {};
}

function asHarnessKind(value: unknown): HarnessKind {
  return value === 'mock' || value === 'eve-harness' || value === 'herdr-shell' || value === 'local-shell'
    ? value
    : 'local-shell';
}

function approvalPresent(args: Record<string, unknown>): boolean {
  return args['operatorApproved'] === true
    || (typeof args['approvalToken'] === 'string' && args['approvalToken'].trim().length > 0);
}

export interface ConductorActions {
  runAction(action: string, args?: Record<string, unknown>): Promise<CommandResult>;
}

/**
 * Build the Conductor action surface. `dispatch` is injectable for testing;
 * it defaults to the live in-process Kernel command dispatcher.
 */
export function createConductorActions(
  dispatch: ConductorActionDispatch = dispatchKernelCommand,
  deps: ConductorActionDeps = {},
): ConductorActions {
  const cmd = (type: string, payload: Record<string, unknown>) =>
    dispatch(type, payload, REQUESTED_BY);

  async function runAction(action: string, argsIn: Record<string, unknown> = {}): Promise<CommandResult> {
    const args = rec(argsIn);
    switch (action) {
      case 'create_task':
        return cmd('kernel.task.create', args);

      case 'assign_task': {
        // Assign to a worker/tile AND activate it (open → claimed → working).
        const claim = await cmd('kernel.task.claim', {
          taskId: args['taskId'],
          tileId: args['tileId'],
          ownerWorkerId: args['ownerWorkerId'],
        });
        if (!claim.ok) return claim;
        const start = await cmd('kernel.task.start', { taskId: args['taskId'] });
        if (!start.ok || args['deliver'] !== true) return start;
        return deliverAssignedTask(args, cmd, deps);
      }

      case 'submit_task':
        return cmd('kernel.task.submit', args);

      case 'verify_task':
        return cmd('kernel.task.verify', args);

      case 'reject_task':
        return cmd('kernel.task.reject', args);

      case 'block_task':
        return cmd('kernel.task.block', args);

      case 'spawn_role':
        // Trigger the approved shell role-spawn path, which creates the tile,
        // starts the shipped terminal/herdr runtime, and is itself gated by
        // kernel.worker.spawn (Goal 6A). The Conductor never starts a runtime
        // directly, and must not fall back to marking a Kernel worker
        // "spawning" with no runtime behind it.
        if (!deps.spawnRole) {
          return { ok: false, error: 'spawn_role unavailable: no shell role-spawn binding' };
        }
        return deps.spawnRole(args);

      case 'connect_tiles':
        return cmd('kernel.connection.create', args);

      default:
        return { ok: false, error: `Unknown conductor action: ${action}` };
    }
  }

  return { runAction };
}

async function deliverAssignedTask(
  args: Record<string, unknown>,
  cmd: (type: string, payload: Record<string, unknown>) => Promise<CommandResult>,
  deps: ConductorActionDeps,
): Promise<CommandResult> {
  if (!deps.getTask || !deps.getWorkerHarness) {
    return { ok: false, error: 'assign_task deliver unavailable: missing task lookup or harness binding' };
  }
  const taskId = args['taskId'];
  if (typeof taskId !== 'string' || !taskId.trim()) {
    return { ok: false, error: 'assign_task deliver requires taskId' };
  }
  const harnessKind = asHarnessKind(args['harnessKind']);
  if (harnessKind !== 'mock' && !approvalPresent(args)) {
    return { ok: false, error: 'assign_task deliver to real harness requires operator approval' };
  }

  const task = await deps.getTask(taskId);
  if (!task) return { ok: false, error: `assign_task deliver: task not found: ${taskId}` };
  if (!task.ownerWorkerId) return { ok: false, error: 'assign_task deliver: task has no owner worker' };

  const worker = deps.getWorker ? await deps.getWorker(task.ownerWorkerId) : null;
  const handle: WorkerHandle = {
    workerId: task.ownerWorkerId,
    tileId: worker?.tileId ?? (typeof args['tileId'] === 'string' ? args['tileId'] : task.ownerWorkerId),
    kind: harnessKind,
    eveSessionId: typeof args['eveSessionId'] === 'string' ? args['eveSessionId'] : null,
    workspacePath: typeof args['artifactRoot'] === 'string' ? args['artifactRoot'] : null,
  };
  const harness = deps.getWorkerHarness(harnessKind);
  const instruction = [task.title, '', task.objective].join('\n').trim();
  const contextEnvelope = await maybeBuildContextEnvelope(taskId, deps);
  const derivedFrom = contextEnvelope?.upstream_artifacts.map((artifact) => artifact.artifact_id) ?? [];
  await harness.send(handle, {
    text: instruction,
    taskId,
    workflowId: task.workflowId,
    artifactRoot: (args['artifactRoot'] as string | null) ?? null,
    contextEnvelope: contextEnvelope ?? undefined,
  });
  await harness.readState(handle);
  const drafts = await harness.collectReceipts(handle);
  const artifactIds: string[] = [];
  for (const draft of drafts) {
    if (!draft.artifactFilePath) continue;
    const created = await createArtifactFromDraft(cmd, task, handle, draft, args, derivedFrom);
    if (!created.ok) return created;
    const data = (created.data && typeof created.data === 'object')
      ? created.data as Record<string, unknown>
      : {};
    const artifactId = typeof created.id === 'string'
      ? created.id
      : typeof data['artifactId'] === 'string'
        ? data['artifactId']
        : null;
    if (artifactId) artifactIds.push(artifactId);
  }
  if (artifactIds.length === 0) {
    return { ok: false, error: 'assign_task deliver: harness produced no artifact draft' };
  }
  const submitted = await cmd('kernel.task.submit', {
    taskId,
    summary: drafts[0]?.summary ?? 'result submitted',
    artifactRefs: artifactIds,
    attemptId: args['attemptId'],
  });
  if (!submitted.ok) return submitted;
  return {
    ok: true,
    id: taskId,
    data: {
      artifactIds,
      derivedFrom,
      contextEnvelope,
      eveSessionId: handle.eveSessionId ?? null,
    },
  };
}

async function maybeBuildContextEnvelope(
  taskId: string,
  deps: ConductorActionDeps,
): Promise<ContextEnvelopeV0 | null> {
  try {
    const builder = deps.buildContextEnvelope ?? buildContextEnvelope;
    return await builder(taskId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('KernelDB not initialized')) return null;
    throw err;
  }
}

async function createArtifactFromDraft(
  cmd: (type: string, payload: Record<string, unknown>) => Promise<CommandResult>,
  task: TaskSnapshot,
  handle: WorkerHandle,
  draft: ReceiptDraft,
  args: Record<string, unknown>,
  derivedFrom: string[],
): Promise<CommandResult> {
  const attemptId = typeof args['attemptId'] === 'string' && args['attemptId'].trim()
    ? args['attemptId'].trim()
    : null;
  return cmd('kernel.artifact.create', {
    workflowId: task.workflowId,
    taskId: task.id,
    workerId: task.ownerWorkerId,
    tileId: handle.tileId,
    kind: draft.artifactKind ?? 'file',
    uri: draft.artifactFilePath,
    summary: draft.summary,
    contentHash: draft.contentHash ?? null,
    mediaType: draft.mediaType ?? null,
    sizeBytes: draft.sizeBytes ?? null,
    derivedFrom,
    correlationId: task.correlationId,
    metadata: attemptId ? { ...(draft.metadata ?? {}), attemptId } : draft.metadata ?? {},
  });
}
