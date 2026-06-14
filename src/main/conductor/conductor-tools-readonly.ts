/**
 * Conductor native tool surface — v3 Goal 5A (read-only).
 *
 * In-process tools the embedded Conductor calls directly against the Kernel —
 * NOT through MCP (the constitution forbids the Conductor depending on MCP for
 * native control). Every tool here is read-only except `postPlanningReceipt`,
 * which appends a `planning` receipt and nothing else.
 *
 * Spawn/assign/verify/block tools are intentionally absent until Goal 6A/5C.
 */

import { dispatchKernelCommand } from '../../kernel/commands/index';
import {
  queryCanvasSnapshot,
  queryConductorContext,
  queryWorkflowSnapshot,
  queryStateCardList,
  queryTaskList,
  queryReceiptList,
} from '../../kernel/queries/index';
import { emitKernelEvent } from '../../kernel/events/index';

export interface ToolCall {
  tool: string;
  at: number;
}

export interface ConductorTools {
  readonly calls: ToolCall[];
  getCanvasSnapshot(workflowId?: string): unknown;
  getWorkflowSnapshot(workflowId: string): unknown;
  getStateCards(workflowId?: string): unknown;
  getTaskList(workflowId?: string): unknown;
  getReceiptChain(params?: { taskId?: string; correlationId?: string; limit?: number }): unknown;
  getContext(workflowId?: string): ReturnType<typeof queryConductorContext>;
  postPlanningReceipt(input: Record<string, unknown>): Promise<unknown>;
  focusTile(tileIds: string[]): { ok: true; tileIds: string[] };
  requestHumanApproval(input: { summary: string; workflowId?: string; taskId?: string }): Promise<unknown>;
}

/**
 * Build a fresh tool set with its own call log. The log feeds the "Tool Calls"
 * section of the Conductor tile so the read path is visible.
 */
export function createConductorTools(): ConductorTools {
  const calls: ToolCall[] = [];
  const record = <T>(tool: string, fn: () => T): T => {
    calls.push({ tool, at: Date.now() });
    return fn();
  };

  return {
    calls,
    getCanvasSnapshot: (workflowId) =>
      record('get_canvas_snapshot', () => queryCanvasSnapshot(workflowId)),
    getWorkflowSnapshot: (workflowId) =>
      record('get_workflow_snapshot', () => queryWorkflowSnapshot(workflowId)),
    getStateCards: (workflowId) =>
      record('get_state_cards', () => queryStateCardList(workflowId ? { workflowId } : {})),
    getTaskList: (workflowId) =>
      record('get_task_list', () => queryTaskList(workflowId ? { workflowId } : {})),
    getReceiptChain: (params = {}) =>
      record('get_receipt_chain', () => queryReceiptList(params)),
    getContext: (workflowId) =>
      record('get_context', () => queryConductorContext(workflowId ? { workflowId } : {})),

    // The only write the read-only Conductor may perform.
    postPlanningReceipt: (input) =>
      record('post_receipt', () => dispatchKernelCommand('kernel.conductor.plan', input, 'conductor')),

    // Navigation only — emits a request the renderer may honor. No Kernel write.
    focusTile: (tileIds) =>
      record('focus_tile', () => {
        emitKernelEvent({ kind: 'conductor.focus_requested', data: { tileIds } });
        return { ok: true as const, tileIds };
      }),

    // Human-in-the-loop: recorded as a planning receipt flagged for approval.
    requestHumanApproval: (input) =>
      record('request_human_approval', () =>
        dispatchKernelCommand(
          'kernel.conductor.plan',
          {
            summary: input.summary,
            workflowId: input.workflowId ?? null,
            taskId: input.taskId ?? null,
            requestApproval: true,
            nextAction: 'Await human approval',
          },
          'conductor',
        ),
      ),
  };
}
