/**
 * ACP session/update → milestone ReceiptDraft translator.
 *
 * Milestones only — never a receipt per agent_message_chunk. Chunks may coalesce
 * into at most one transcript-summary progress receipt per turn. Receipt types
 * use the frozen ReceiptType vocabulary; milestone detail lives in metadata.
 */
import type { ReceiptDraft } from '../types';

export type AcpMilestone =
  | 'session.start'
  | 'turn.start'
  | 'turn.complete'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'transcript.summary'
  | 'approval.requested'
  | 'approval.granted';

export interface AcpTranslatorContext {
  taskId?: string | null;
  workflowId?: string | null;
  harnessKind?: string;
}

export interface AcpTranslatorState {
  sessionStarted: boolean;
  turnStarted: boolean;
  turnComplete: boolean;
  transcriptBuffer: string;
  transcriptReceiptEmitted: boolean;
  toolCalls: Map<string, {
    started: boolean;
    completed: boolean;
    failed: boolean;
    title?: string;
    kind?: string;
  }>;
}

export function createAcpTranslatorState(): AcpTranslatorState {
  return {
    sessionStarted: false,
    turnStarted: false,
    turnComplete: false,
    transcriptBuffer: '',
    transcriptReceiptEmitted: false,
    toolCalls: new Map(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function extractUpdate(event: unknown): Record<string, unknown> | null {
  const root = asRecord(event);
  if (!root) return null;
  const params = asRecord(root['params']);
  return asRecord(params?.['update']);
}

function receiptTypeForMilestone(milestone: AcpMilestone): string {
  switch (milestone) {
    case 'session.start':
    case 'turn.start':
      return 'task_started';
    case 'turn.complete':
      return 'task_completed';
    case 'approval.granted':
      return 'human_decision';
    case 'transcript.summary':
    case 'tool.started':
    case 'tool.completed':
    case 'tool.failed':
    case 'approval.requested':
      return 'progress';
    default:
      return 'progress';
  }
}

function buildDraft(
  milestone: AcpMilestone,
  summary: string,
  ctx: AcpTranslatorContext,
  extraMetadata: Record<string, unknown> = {},
): ReceiptDraft {
  return {
    type: receiptTypeForMilestone(milestone),
    summary,
    taskId: ctx.taskId ?? null,
    metadata: {
      harnessKind: ctx.harnessKind ?? 'agentos',
      milestone,
      ...extraMetadata,
    },
  };
}

function maybeEmitSessionStart(
  state: AcpTranslatorState,
  ctx: AcpTranslatorContext,
): ReceiptDraft[] {
  if (state.sessionStarted) return [];
  state.sessionStarted = true;
  state.turnStarted = true;
  return [buildDraft('session.start', 'AgentOS session started', ctx)];
}

function maybeEmitTurnStart(
  state: AcpTranslatorState,
  ctx: AcpTranslatorContext,
): ReceiptDraft[] {
  if (state.turnStarted) return [];
  state.turnStarted = true;
  return [buildDraft('turn.start', 'AgentOS turn started', ctx)];
}

export function translateSessionUpdate(
  event: unknown,
  state: AcpTranslatorState,
  ctx: AcpTranslatorContext = {},
): ReceiptDraft[] {
  const drafts: ReceiptDraft[] = [];
  const update = extractUpdate(event);
  if (!update) return drafts;

  const sessionUpdate = stringField(update, 'sessionUpdate');
  if (!sessionUpdate) return drafts;

  if (sessionUpdate === 'agent_message_chunk') {
    drafts.push(...maybeEmitSessionStart(state, ctx));
    const content = asRecord(update['content']);
    const text = stringField(content, 'text');
    if (text) state.transcriptBuffer += text;
    return drafts;
  }

  if (sessionUpdate === 'tool_call' || sessionUpdate === 'tool_call_update') {
    drafts.push(...maybeEmitSessionStart(state, ctx));
    drafts.push(...maybeEmitTurnStart(state, ctx));

    const toolCallId = stringField(update, 'toolCallId');
    const status = stringField(update, 'status');
    if (!toolCallId || !status) return drafts;

    let tracked = state.toolCalls.get(toolCallId);
    if (!tracked) {
      tracked = { started: false, completed: false, failed: false };
      state.toolCalls.set(toolCallId, tracked);
    }
    if (update['title']) tracked.title = stringField(update, 'title') ?? tracked.title;
    if (update['kind']) tracked.kind = stringField(update, 'kind') ?? tracked.kind;

    if (status === 'in_progress' && !tracked.started) {
      tracked.started = true;
      drafts.push(buildDraft(
        'tool.started',
        `Tool started: ${tracked.title ?? toolCallId}`,
        ctx,
        { toolCallId, title: tracked.title ?? null, kind: tracked.kind ?? null },
      ));
    }

    if (status === 'completed' && tracked.started && !tracked.completed) {
      tracked.completed = true;
      drafts.push(buildDraft(
        'tool.completed',
        `Tool completed: ${tracked.title ?? toolCallId}`,
        ctx,
        { toolCallId, title: tracked.title ?? null, kind: tracked.kind ?? null },
      ));
    }

    if (status === 'failed' && tracked.started && !tracked.failed) {
      tracked.failed = true;
      drafts.push(buildDraft(
        'tool.failed',
        `Tool failed: ${tracked.title ?? toolCallId}`,
        ctx,
        { toolCallId, title: tracked.title ?? null, kind: tracked.kind ?? null },
      ));
    }

    return drafts;
  }

  return drafts;
}

export function translateTurnComplete(
  state: AcpTranslatorState,
  ctx: AcpTranslatorContext = {},
): ReceiptDraft[] {
  if (state.turnComplete) return [];
  state.turnComplete = true;
  const drafts: ReceiptDraft[] = [];

  if (state.transcriptBuffer.trim() && !state.transcriptReceiptEmitted) {
    state.transcriptReceiptEmitted = true;
    const snippet = state.transcriptBuffer.trim().slice(0, 240);
    drafts.push(buildDraft(
      'transcript.summary',
      `Turn transcript (${state.transcriptBuffer.length} chars)`,
      ctx,
      { transcriptChars: state.transcriptBuffer.length, transcriptSnippet: snippet },
    ));
  }

  drafts.push(buildDraft('turn.complete', 'AgentOS turn completed', ctx));
  return drafts;
}

export function translateApprovalRequested(
  action: string,
  ctx: AcpTranslatorContext,
  extra: Record<string, unknown> = {},
): ReceiptDraft {
  return buildDraft(
    'approval.requested',
    `Approval requested: ${action}`,
    ctx,
    { action, ...extra },
  );
}

export function translateApprovalGranted(
  action: string,
  blockedMs: number,
  ctx: AcpTranslatorContext,
  extra: Record<string, unknown> = {},
): ReceiptDraft {
  return buildDraft(
    'approval.granted',
    `Approval granted: ${action}`,
    ctx,
    { action, blockedMs, approved: true, ...extra },
  );
}

/** Count milestone receipts that would be emitted for a batch of events (chunk coalescing proof). */
export function countMilestoneReceiptsForEvents(
  events: unknown[],
  ctx: AcpTranslatorContext = {},
): number {
  const state = createAcpTranslatorState();
  let count = 0;
  for (const event of events) {
    count += translateSessionUpdate(event, state, ctx).length;
  }
  count += translateTurnComplete(state, ctx).length;
  return count;
}
