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
 *   spawn_role    -> kernel.worker.spawn (the approved Goal 6A authority gate)
 *   connect_tiles -> kernel.connection.create
 *
 * assign_task = claim + start: it both assigns the task to a worker/tile and
 * activates it (claimed → working), so the worker can then submit. Completion is
 * never exposed raw — verify_task drives the verified path (verification_passed
 * → task_completed), so a task can't complete without verification evidence.
 */

import { dispatchKernelCommand, type CommandResult } from '../../kernel/commands/index';

export type ConductorActionDispatch = (
  type: string,
  payload: Record<string, unknown>,
  requestedBy?: string,
) => Promise<CommandResult>;

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

export interface ConductorActions {
  runAction(action: string, args?: Record<string, unknown>): Promise<CommandResult>;
}

/**
 * Build the Conductor action surface. `dispatch` is injectable for testing;
 * it defaults to the live in-process Kernel command dispatcher.
 */
export function createConductorActions(
  dispatch: ConductorActionDispatch = dispatchKernelCommand,
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
        return cmd('kernel.task.start', { taskId: args['taskId'] });
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
        // Authority gate only (Goal 6A). The shipped terminal/agent runtime is
        // still started by the renderer role-spawn path (which is itself gated
        // by kernel.worker.spawn); full harness send/read is Goal 6.
        return cmd('kernel.worker.spawn', args);

      case 'connect_tiles':
        return cmd('kernel.connection.create', args);

      default:
        return { ok: false, error: `Unknown conductor action: ${action}` };
    }
  }

  return { runAction };
}
