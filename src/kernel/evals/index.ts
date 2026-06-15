/**
 * Kernel evaluations persistence — v3 Goal 9.
 *
 * The Kernel owns where evaluations are stored (the `evaluations` table), but an
 * evaluation is DERIVED ANALYSIS, not truth: this module only CREATES records
 * and QUERIES them. It never mutates task/worker/receipt/State-Card state, and
 * no runtime path reads evaluations to decide Kernel state.
 *
 * One DB row per scored rubric dimension; rows sharing `eval_id` belong to one
 * evaluation of one unit. `applicable = 0` (NULL score) is `not_applicable`,
 * distinct from score 0. See docs/v3/EVALS_SPEC.md.
 */

import { randomUUID } from 'node:crypto';
import type { KernelDB } from '../database';
import type { CommandResult } from '../commands/types';
import { emitKernelEvent } from '../events/index';

export interface EvaluationDimensionInput {
  dimension: string;
  applicable: boolean;
  score: number | null;
  confidence: number;
  evidenceRefs: string[];
  rationale: string;
  limitations?: string;
}

export interface CreateEvaluationInput {
  evalType: string;
  workflowId?: string | null;
  taskId?: string | null;
  workerId?: string | null;
  receiptId?: string | null;
  dimensions: EvaluationDimensionInput[];
  /** Optional caller-supplied eval id (stable grouping); generated when absent. */
  evalId?: string;
}

const VALID_EVAL_TYPES = new Set([
  'workflow_eval',
  'task_eval',
  'worker_eval',
  'conductor_decision_eval',
  'verification_eval',
]);

const VALID_DIMENSIONS = new Set([
  'task_completion_correctness',
  'verification_integrity',
  'evidence_completeness',
  'delegation_quality',
  'blocker_handling',
  'artifact_usefulness',
  'conductor_decision_quality',
  'workflow_efficiency',
]);

export function handleEvalCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  if (type !== 'kernel.eval.create') {
    return { ok: false, error: `Unhandled eval command: ${type}` };
  }
  return evalCreate(db, payload as unknown as CreateEvaluationInput);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateDimension(d: EvaluationDimensionInput, index: number): string | null {
  const prefix = `eval.create: dimension[${index}]`;
  if (!d || typeof d !== 'object') return `${prefix} must be an object`;
  if (!VALID_DIMENSIONS.has(d.dimension)) return `${prefix}.dimension unknown: ${d.dimension}`;
  if (typeof d.applicable !== 'boolean') return `${prefix}.applicable must be boolean`;
  if (!isFiniteNumber(d.confidence) || d.confidence < 0 || d.confidence > 1) {
    return `${prefix}.confidence must be between 0.0 and 1.0`;
  }
  if (!isNonEmptyString(d.rationale)) return `${prefix}.rationale required`;

  if (!d.applicable) {
    if (d.score !== null && d.score !== undefined) {
      return `${prefix}.score must be null when not_applicable`;
    }
    return null;
  }

  if (!Number.isInteger(d.score) || d.score < 0 || d.score > 4) {
    return `${prefix}.score must be an integer 0..4`;
  }
  if (
    !Array.isArray(d.evidenceRefs) ||
    d.evidenceRefs.length === 0 ||
    d.evidenceRefs.some((ref) => !isNonEmptyString(ref))
  ) {
    return `${prefix}.evidenceRefs must contain at least one Kernel id`;
  }
  return null;
}

function validateEvaluationInput(input: CreateEvaluationInput): string | null {
  if (!input || typeof input.evalType !== 'string' || !input.evalType) {
    return 'eval.create: evalType required';
  }
  if (!VALID_EVAL_TYPES.has(input.evalType)) {
    return `eval.create: evalType unknown: ${input.evalType}`;
  }
  if (!Array.isArray(input.dimensions) || input.dimensions.length === 0) {
    return 'eval.create: at least one dimension required';
  }
  for (let i = 0; i < input.dimensions.length; i += 1) {
    const error = validateDimension(input.dimensions[i], i);
    if (error) return error;
  }
  return null;
}

/**
 * Persist one evaluation as a set of per-dimension rows. Create-only: there is
 * no update/delete path (evals are append-only derived records in v1). Returns
 * the shared `eval_id`.
 */
function evalCreate(db: KernelDB, input: CreateEvaluationInput): CommandResult {
  const validationError = validateEvaluationInput(input);
  if (validationError) return { ok: false, error: validationError };

  const evalId = input.evalId ?? randomUUID();
  const now = Date.now();
  try {
    const insert = db.prepare(`
      INSERT INTO evaluations
        (id, eval_id, eval_type, workflow_id, task_id, worker_id, receipt_id,
         dimension, score, applicable, confidence, evidence_refs_json, rationale,
         limitations, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((dims: EvaluationDimensionInput[]) => {
      for (const d of dims) {
        const applicable = d.applicable ? 1 : 0;
        insert.run(
          randomUUID(),
          evalId,
          input.evalType,
          input.workflowId ?? null,
          input.taskId ?? null,
          input.workerId ?? null,
          input.receiptId ?? null,
          d.dimension,
          // not_applicable stores NULL score (distinct from score 0).
          d.applicable ? d.score ?? null : null,
          applicable,
          d.confidence,
          JSON.stringify(d.evidenceRefs ?? []),
          d.rationale ?? '',
          d.limitations ?? null,
          now,
          '{}',
        );
      }
    });
    tx(input.dimensions);

    emitKernelEvent({
      kind: 'evaluation.created',
      workflowId: input.workflowId ?? undefined,
      taskId: input.taskId ?? undefined,
      data: { evalId, evalType: input.evalType, dimensions: input.dimensions.length },
    });
    return { ok: true, id: evalId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface EvaluationRowSnapshot {
  id: string;
  evalId: string;
  evalType: string;
  workflowId: string | null;
  taskId: string | null;
  workerId: string | null;
  receiptId: string | null;
  dimension: string;
  score: number | null;
  applicable: boolean;
  confidence: number;
  evidenceRefs: string[];
  rationale: string;
  limitations: string | null;
  createdAt: number;
}

function rowToEval(r: Record<string, unknown>): EvaluationRowSnapshot {
  let refs: string[] = [];
  try {
    const parsed = JSON.parse((r['evidence_refs_json'] as string) ?? '[]');
    refs = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    refs = [];
  }
  return {
    id: r['id'] as string,
    evalId: r['eval_id'] as string,
    evalType: r['eval_type'] as string,
    workflowId: (r['workflow_id'] as string | null) ?? null,
    taskId: (r['task_id'] as string | null) ?? null,
    workerId: (r['worker_id'] as string | null) ?? null,
    receiptId: (r['receipt_id'] as string | null) ?? null,
    dimension: r['dimension'] as string,
    score: (r['score'] as number | null) ?? null,
    applicable: (r['applicable'] as number) === 1,
    confidence: r['confidence'] as number,
    evidenceRefs: refs,
    rationale: r['rationale'] as string,
    limitations: (r['limitations'] as string | null) ?? null,
    createdAt: r['created_at'] as number,
  };
}

/**
 * List evaluation rows by scope (workflow/task/worker/receipt/eval_id). Ordered
 * deterministically (created_at, then eval_id, then dimension). Read-only.
 */
export function queryEvaluationList(
  db: KernelDB,
  params: { workflowId?: string; taskId?: string; workerId?: string; receiptId?: string; evalId?: string } = {},
): EvaluationRowSnapshot[] {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (params.workflowId) { clauses.push('workflow_id = ?'); args.push(params.workflowId); }
  if (params.taskId) { clauses.push('task_id = ?'); args.push(params.taskId); }
  if (params.workerId) { clauses.push('worker_id = ?'); args.push(params.workerId); }
  if (params.receiptId) { clauses.push('receipt_id = ?'); args.push(params.receiptId); }
  if (params.evalId) { clauses.push('eval_id = ?'); args.push(params.evalId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM evaluations ${where} ORDER BY created_at ASC, eval_id ASC, dimension ASC`)
    .all(...args) as Record<string, unknown>[];
  return rows.map(rowToEval);
}

/** All rows for a single evaluation (one unit), ordered by dimension. */
export function queryEvaluationGet(db: KernelDB, evalId: string): EvaluationRowSnapshot[] {
  return queryEvaluationList(db, { evalId });
}
