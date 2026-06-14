/**
 * Kernel State Cards — v3 (Goal 4).
 *
 * A State Card is the compressed *current* reality of a tile/worker — not a
 * history, not a chat log. There is exactly one row per tile (`state_cards`
 * has a UNIQUE tile_id). State Cards are Kernel-owned truth; the renderer
 * projects them (tile flip) but never stores them.
 *
 * This module owns:
 *  - upsertStateCard: the single write path (insert-or-patch by tile_id).
 *  - kernel.state_card.update command handler.
 *  - state-card queries (kernel.state_card.list / get).
 *
 * The State Card watcher (../watchers) calls upsertStateCard in response to
 * task/receipt/tile events. See docs/v3/AUTHORITY_RULES.md ("State Card Rules").
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import type { StateCardRow, StateCardStatus } from '../schema/types';
import { emitKernelEvent } from '../events/index';
import type { CommandResult } from '../commands/types';

/** Columns a caller/watcher may patch. tile_id is the identity, never patched. */
export interface StateCardPatch {
  workerId?: string | null;
  workflowId?: string | null;
  currentTaskId?: string | null;
  status?: StateCardStatus;
  blocker?: string | null;
  lastMeaningfulUpdate?: string | null;
  nextAction?: string | null;
  artifacts?: unknown[];
  lastReceiptId?: string | null;
  cavemanSummary?: string | null;
  metadata?: Record<string, unknown>;
}

const COLUMN_MAP: Record<keyof StateCardPatch, string> = {
  workerId: 'worker_id',
  workflowId: 'workflow_id',
  currentTaskId: 'current_task_id',
  status: 'status',
  blocker: 'blocker',
  lastMeaningfulUpdate: 'last_meaningful_update',
  nextAction: 'next_action',
  artifacts: 'artifacts_json',
  lastReceiptId: 'last_receipt_id',
  cavemanSummary: 'caveman_summary',
  metadata: 'metadata_json',
};

function encode(key: keyof StateCardPatch, value: unknown): string | number | null {
  if (key === 'artifacts') return JSON.stringify(value ?? []);
  if (key === 'metadata') return JSON.stringify(value ?? {});
  return (value as string | number | null) ?? null;
}

/**
 * Insert-or-patch the single State Card for a tile. Only the fields present in
 * `patch` are written; the rest are preserved. Always bumps updated_at and
 * emits a `state_card.updated` Kernel event so renderers reconcile.
 */
export function upsertStateCard(db: KernelDB, tileId: string, patch: StateCardPatch): string {
  const now = Date.now();
  const existing = db
    .prepare('SELECT id FROM state_cards WHERE tile_id = ?')
    .get(tileId) as { id: string } | undefined;

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof StateCardPatch,
    unknown,
  ][];

  let id: string;
  if (existing) {
    id = existing.id;
    const sets = entries.map(([k]) => `${COLUMN_MAP[k]} = ?`);
    const vals = entries.map(([k, v]) => encode(k, v));
    sets.push('updated_at = ?');
    vals.push(now);
    vals.push(tileId);
    db.prepare(`UPDATE state_cards SET ${sets.join(', ')} WHERE tile_id = ?`).run(...vals);
  } else {
    id = randomUUID();
    db.prepare(
      `INSERT INTO state_cards
         (id, tile_id, worker_id, workflow_id, current_task_id, status, blocker,
          last_meaningful_update, next_action, artifacts_json, last_receipt_id,
          caveman_summary, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      tileId,
      (patch.workerId as string | null) ?? null,
      (patch.workflowId as string | null) ?? null,
      (patch.currentTaskId as string | null) ?? null,
      patch.status ?? 'idle',
      (patch.blocker as string | null) ?? null,
      (patch.lastMeaningfulUpdate as string | null) ?? null,
      (patch.nextAction as string | null) ?? null,
      JSON.stringify(patch.artifacts ?? []),
      (patch.lastReceiptId as string | null) ?? null,
      (patch.cavemanSummary as string | null) ?? null,
      now,
      JSON.stringify(patch.metadata ?? {}),
    );
  }

  emitKernelEvent({
    kind: 'state_card.updated',
    tileId,
    workflowId: patch.workflowId ?? undefined,
    data: { tileId, status: patch.status },
  });
  return id;
}

export function handleStateCardCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  if (type !== 'kernel.state_card.update') {
    return { ok: false, error: `Unhandled state_card command: ${type}` };
  }
  const tileId = payload['tileId'] as string | undefined;
  if (!tileId) return { ok: false, error: 'state_card.update: tileId required' };
  try {
    const id = upsertStateCard(db, tileId, {
      workerId: payload['workerId'] as string | null | undefined,
      workflowId: payload['workflowId'] as string | null | undefined,
      currentTaskId: payload['currentTaskId'] as string | null | undefined,
      status: payload['status'] as StateCardStatus | undefined,
      blocker: payload['blocker'] as string | null | undefined,
      lastMeaningfulUpdate: payload['lastMeaningfulUpdate'] as string | null | undefined,
      nextAction: payload['nextAction'] as string | null | undefined,
      artifacts: payload['artifacts'] as unknown[] | undefined,
      lastReceiptId: payload['lastReceiptId'] as string | null | undefined,
      cavemanSummary: payload['cavemanSummary'] as string | null | undefined,
      metadata: payload['metadata'] as Record<string, unknown> | undefined,
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface StateCardSnapshot {
  tileId: string;
  workerId: string | null;
  workflowId: string | null;
  currentTaskId: string | null;
  status: StateCardStatus;
  blocker: string | null;
  lastMeaningfulUpdate: string | null;
  nextAction: string | null;
  artifacts: unknown[];
  lastReceiptId: string | null;
  cavemanSummary: string | null;
  updatedAt: number;
}

function rowToCard(r: StateCardRow): StateCardSnapshot {
  return {
    tileId: r.tile_id,
    workerId: r.worker_id,
    workflowId: r.workflow_id,
    currentTaskId: r.current_task_id,
    status: r.status,
    blocker: r.blocker,
    lastMeaningfulUpdate: r.last_meaningful_update,
    nextAction: r.next_action,
    artifacts: safeJsonArray(r.artifacts_json),
    lastReceiptId: r.last_receipt_id,
    cavemanSummary: r.caveman_summary,
    updatedAt: r.updated_at,
  };
}

export function queryStateCardList(
  db: KernelDB,
  params: { workflowId?: string } = {},
): StateCardSnapshot[] {
  const rows = params.workflowId
    ? (db
        .prepare('SELECT * FROM state_cards WHERE workflow_id = ? ORDER BY updated_at DESC')
        .all(params.workflowId) as StateCardRow[])
    : (db.prepare('SELECT * FROM state_cards ORDER BY updated_at DESC').all() as StateCardRow[]);
  return rows.map(rowToCard);
}

export function queryStateCardGet(db: KernelDB, tileId: string): StateCardSnapshot | null {
  const row = db.prepare('SELECT * FROM state_cards WHERE tile_id = ?').get(tileId) as
    | StateCardRow
    | undefined;
  return row ? rowToCard(row) : null;
}

function safeJsonArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
