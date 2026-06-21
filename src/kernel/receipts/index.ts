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

function safeJsonObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function hasArtifactColumn(db: KernelDB, name: string): boolean {
  const rows = db.prepare("PRAGMA table_info('artifacts')").all() as Array<{ name: string }>;
  return rows.some((row) => row.name === name);
}

function normalizeStringArray(value: unknown): string[] {
  const raw = typeof value === 'string'
    ? safeJsonArray(value)
    : Array.isArray(value)
      ? value
      : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim());
  }
  return [...new Set(out)];
}

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
  const metadata = (payload['metadata'] as Record<string, unknown> | undefined) ?? {};
  const derivedFrom = normalizeStringArray(payload['derivedFrom'] ?? payload['derived_from']);
  const attemptId = typeof metadata['attemptId'] === 'string' && metadata['attemptId'].trim()
    ? metadata['attemptId'].trim()
    : null;
  const taskId = (payload['taskId'] as string | null) ?? null;
  const workerId = (payload['workerId'] as string | null) ?? null;
  if (attemptId && taskId) {
    const rows = db
      .prepare(
        `SELECT id, receipt_id, metadata_json FROM artifacts
         WHERE task_id = ? AND worker_id IS ? AND kind = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(taskId, workerId, kind) as Array<{ id: string; receipt_id: string | null; metadata_json: string }>;
    const existing = rows.find((row) => safeJsonObject(row.metadata_json)['attemptId'] === attemptId);
    if (existing) {
      return {
        ok: true,
        id: existing.id,
        data: { artifactId: existing.id, receiptId: existing.receipt_id, idempotent: true },
      };
    }
  }
  const id = randomUUID();
  const now = Date.now();
  try {
    if (hasArtifactColumn(db, 'derived_from')) {
      db.prepare(
        `INSERT INTO artifacts
           (id, workflow_id, task_id, worker_id, tile_id, receipt_id, kind, uri,
            summary, content_hash, media_type, size_bytes, derived_from, created_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        (payload['workflowId'] as string | null) ?? null,
        taskId,
        (payload['workerId'] as string | null) ?? null,
        (payload['tileId'] as string | null) ?? null,
        null, // receipt_id backfilled below via the artifact_created receipt
        kind,
        (payload['uri'] as string | null) ?? null,
        (payload['summary'] as string | null) ?? null,
        (payload['contentHash'] as string | null) ?? null,
        (payload['mediaType'] as string | null) ?? null,
        (payload['sizeBytes'] as number | null) ?? null,
        JSON.stringify(derivedFrom),
        now,
        JSON.stringify(metadata),
      );
    } else {
      db.prepare(
        `INSERT INTO artifacts
           (id, workflow_id, task_id, worker_id, tile_id, receipt_id, kind, uri,
            summary, content_hash, media_type, size_bytes, created_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        (payload['workflowId'] as string | null) ?? null,
        taskId,
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
        JSON.stringify(metadata),
      );
    }

    const receiptId = postReceipt(db, {
      type: 'artifact_created',
      taskId,
      workflowId: (payload['workflowId'] as string | null) ?? null,
      workerId: (payload['workerId'] as string | null) ?? null,
      tileId: (payload['tileId'] as string | null) ?? null,
      summary: (payload['summary'] as string | undefined) ?? `artifact: ${kind}`,
      artifactRefs: [id],
      correlationId: (payload['correlationId'] as string | null) ?? null,
      metadata: { ...metadata, artifactId: id, kind, derivedFrom },
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
 * The receipt chain for a task, correlation id, or workflow, oldest first
 * (newest first for the unscoped list). This is the "inspect the receipt chain"
 * surface from the Goal 3 acceptance test. A `workflowId` keeps a workflow-scoped
 * reader (e.g. the Conductor) from seeing receipts in other workflows.
 */
export function queryReceiptList(
  db: KernelDB,
  params: { taskId?: string; correlationId?: string; workflowId?: string; limit?: number } = {},
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
  } else if (params.workflowId) {
    rows = db
      .prepare('SELECT * FROM receipts WHERE workflow_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(params.workflowId, limit) as ReceiptRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM receipts ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(limit) as ReceiptRow[];
  }
  return rows.map(rowToReceipt);
}

// ---------------------------------------------------------------------------
// Artifact queries (Goal 8 vault export reads these; artifacts are owned here)
// ---------------------------------------------------------------------------

export interface ArtifactSnapshot {
  id: string;
  workflowId: string | null;
  taskId: string | null;
  workerId: string | null;
  tileId: string | null;
  receiptId: string | null;
  kind: string;
  uri: string | null;
  summary: string | null;
  contentHash: string | null;
  mediaType: string | null;
  sizeBytes: number | null;
  derivedFrom: string[];
  createdAt: number;
  metadata: Record<string, unknown>;
}

function rowToArtifact(r: Record<string, unknown>): ArtifactSnapshot {
  return {
    id: r['id'] as string,
    workflowId: (r['workflow_id'] as string | null) ?? null,
    taskId: (r['task_id'] as string | null) ?? null,
    workerId: (r['worker_id'] as string | null) ?? null,
    tileId: (r['tile_id'] as string | null) ?? null,
    receiptId: (r['receipt_id'] as string | null) ?? null,
    kind: r['kind'] as string,
    uri: (r['uri'] as string | null) ?? null,
    summary: (r['summary'] as string | null) ?? null,
    contentHash: (r['content_hash'] as string | null) ?? null,
    mediaType: (r['media_type'] as string | null) ?? null,
    sizeBytes: (r['size_bytes'] as number | null) ?? null,
    derivedFrom: normalizeStringArray(r['derived_from'] ?? []),
    createdAt: r['created_at'] as number,
    metadata: safeJsonObject((r['metadata_json'] as string) ?? '{}'),
  };
}

/**
 * Artifacts for a workflow or task, oldest first (deterministic: created_at then
 * rowid). Read-only; the vault exporter consumes this.
 */
export function queryArtifactList(
  db: KernelDB,
  params: { workflowId?: string; taskId?: string } = {},
): ArtifactSnapshot[] {
  let rows: Record<string, unknown>[];
  if (params.taskId) {
    rows = db
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(params.taskId) as Record<string, unknown>[];
  } else if (params.workflowId) {
    rows = db
      .prepare('SELECT * FROM artifacts WHERE workflow_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(params.workflowId) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare('SELECT * FROM artifacts ORDER BY created_at ASC, rowid ASC')
      .all() as Record<string, unknown>[];
  }
  return rows.map(rowToArtifact);
}

function safeJsonArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
