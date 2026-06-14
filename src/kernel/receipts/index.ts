/**
 * Kernel Receipts — v3
 *
 * Receipts are the append-only evidence layer. Every meaningful task state
 * transition produces a receipt; receipts are never updated or deleted.
 *
 * This module owns:
 *  - postReceipt: the single insert path used by task handlers and the
 *    `kernel.receipt.post` command.
 *  - kernel.receipt.post / kernel.artifact.create command handlers.
 *  - receipt-chain queries (kernel.receipt.list).
 *
 * See docs/v3/AUTHORITY_RULES.md ("Receipt Rules") and KERNEL_CONSTITUTION.md.
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import type { ReceiptRow, ReceiptType } from '../schema/types';
import { emitKernelEvent } from '../events/index';
import type { CommandResult } from '../commands/types';

export interface PostReceiptInput {
  type: ReceiptType;
  taskId?: string | null;
  workflowId?: string | null;
  workerId?: string | null;
  tileId?: string | null;
  summary?: string;
  artifactRefs?: unknown[];
  parentReceiptId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append a receipt. This is the only write path into the receipts table.
 * Receipts are immutable once written.
 */
export function postReceipt(db: KernelDB, input: PostReceiptInput): string {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO receipts
       (id, workflow_id, task_id, worker_id, tile_id, type, summary,
        artifact_refs_json, parent_receipt_id, correlation_id, created_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workflowId ?? null,
    input.taskId ?? null,
    input.workerId ?? null,
    input.tileId ?? null,
    input.type,
    input.summary ?? '',
    JSON.stringify(input.artifactRefs ?? []),
    input.parentReceiptId ?? null,
    input.correlationId ?? null,
    now,
    JSON.stringify(input.metadata ?? {}),
  );
  emitKernelEvent({
    kind: 'receipt.posted',
    taskId: input.taskId ?? undefined,
    workflowId: input.workflowId ?? undefined,
    data: { id, type: input.type, summary: input.summary ?? '' },
  });
  return id;
}

export function handleReceiptCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.receipt.post':
      return receiptPost(db, payload);
    default:
      return { ok: false, error: `Unhandled receipt command: ${type}` };
  }
}

function receiptPost(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const receiptType = payload['type'] as ReceiptType | undefined;
  if (!receiptType) return { ok: false, error: 'receipt.post: type required' };
  try {
    const id = postReceipt(db, {
      type: receiptType,
      taskId: (payload['taskId'] as string | null) ?? null,
      workflowId: (payload['workflowId'] as string | null) ?? null,
      workerId: (payload['workerId'] as string | null) ?? null,
      tileId: (payload['tileId'] as string | null) ?? null,
      summary: (payload['summary'] as string | undefined) ?? '',
      artifactRefs: (payload['artifactRefs'] as unknown[] | undefined) ?? [],
      parentReceiptId: (payload['parentReceiptId'] as string | null) ?? null,
      correlationId: (payload['correlationId'] as string | null) ?? null,
      metadata: (payload['metadata'] as Record<string, unknown> | undefined) ?? {},
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * kernel.artifact.create — record a durable artifact and post the matching
 * `artifact_created` receipt that references it. Used for "attach/post artifact
 * receipt" in the task lifecycle.
 */
export function handleArtifactCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  if (type !== 'kernel.artifact.create') {
    return { ok: false, error: `Unhandled artifact command: ${type}` };
  }
  const kind = payload['kind'] as string | undefined;
  if (!kind) return { ok: false, error: 'artifact.create: kind required' };
  const id = randomUUID();
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO artifacts
         (id, workflow_id, task_id, worker_id, tile_id, receipt_id, kind, uri,
          summary, content_hash, media_type, size_bytes, created_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      (payload['workflowId'] as string | null) ?? null,
      (payload['taskId'] as string | null) ?? null,
      (payload['workerId'] as string | null) ?? null,
      (payload['tileId'] as string | null) ?? null,
      null, // receipt_id backfilled below via the artifact_created receipt
      kind,
      (payload['uri'] as string | null) ?? null,
      (payload['summary'] as string | null) ?? null,
      (payload['contentHash'] as string | null) ?? null,
      (payload['mediaType'] as string | null) ?? null,
      (payload['sizeBytes'] as number | null) ?? null,
      now,
      JSON.stringify((payload['metadata'] as Record<string, unknown> | undefined) ?? {}),
    );

    const receiptId = postReceipt(db, {
      type: 'artifact_created',
      taskId: (payload['taskId'] as string | null) ?? null,
      workflowId: (payload['workflowId'] as string | null) ?? null,
      workerId: (payload['workerId'] as string | null) ?? null,
      tileId: (payload['tileId'] as string | null) ?? null,
      summary: (payload['summary'] as string | undefined) ?? `artifact: ${kind}`,
      artifactRefs: [id],
      correlationId: (payload['correlationId'] as string | null) ?? null,
      metadata: { artifactId: id, kind },
    });
    db.prepare('UPDATE artifacts SET receipt_id = ? WHERE id = ?').run(receiptId, id);

    return { ok: true, id, data: { artifactId: id, receiptId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ReceiptSnapshot {
  id: string;
  type: string;
  taskId: string | null;
  workflowId: string | null;
  workerId: string | null;
  tileId: string | null;
  summary: string;
  artifactRefs: unknown[];
  parentReceiptId: string | null;
  correlationId: string | null;
  createdAt: number;
  metadata: Record<string, unknown>;
}

function rowToReceipt(r: ReceiptRow): ReceiptSnapshot {
  return {
    id: r.id,
    type: r.type,
    taskId: r.task_id,
    workflowId: r.workflow_id,
    workerId: r.worker_id,
    tileId: r.tile_id,
    summary: r.summary,
    artifactRefs: safeJsonArray(r.artifact_refs_json),
    parentReceiptId: r.parent_receipt_id,
    correlationId: r.correlation_id,
    createdAt: r.created_at,
    metadata: safeJsonObject(r.metadata_json),
  };
}

/**
 * The receipt chain for a task or correlation id, oldest first. This is the
 * "inspect the receipt chain" surface from the Goal 3 acceptance test.
 */
export function queryReceiptList(
  db: KernelDB,
  params: { taskId?: string; correlationId?: string; limit?: number } = {},
): ReceiptSnapshot[] {
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 200;
  let rows: ReceiptRow[];
  if (params.taskId) {
    rows = db
      .prepare('SELECT * FROM receipts WHERE task_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?')
      .all(params.taskId, limit) as ReceiptRow[];
  } else if (params.correlationId) {
    rows = db
      .prepare('SELECT * FROM receipts WHERE correlation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ?')
      .all(params.correlationId, limit) as ReceiptRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM receipts ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(limit) as ReceiptRow[];
  }
  return rows.map(rowToReceipt);
}

function safeJsonArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeJsonObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
