/**
 * Evaluation layer types — v3 Goal 9.
 *
 * Evals are DERIVED ANALYSIS of Kernel evidence, never truth. Nothing here
 * mutates Kernel state; the evaluator is pure and the Kernel persists results in
 * the `evaluations` table. See docs/v3/EVALS_SPEC.md and KERNEL_CONSTITUTION.md.
 *
 * Kernel snapshot types are imported type-only so the evals layer never pulls in
 * Kernel runtime/database code.
 */

import type { WorkflowSnapshot } from '../kernel/conductor/index';
import type { TaskSnapshot } from '../kernel/tasks/index';
import type { ReceiptSnapshot, ArtifactSnapshot } from '../kernel/receipts/index';
import type { StateCardSnapshot } from '../kernel/state-cards/index';
import type { WorkflowRegion } from '../kernel/workflows/index';

export type {
  WorkflowSnapshot,
  TaskSnapshot,
  ReceiptSnapshot,
  ArtifactSnapshot,
  StateCardSnapshot,
  WorkflowRegion,
};

export type EvalType =
  | 'workflow_eval'
  | 'task_eval'
  | 'worker_eval'
  | 'conductor_decision_eval'
  | 'verification_eval';

export type EvalDimension =
  | 'task_completion_correctness'
  | 'verification_integrity'
  | 'evidence_completeness'
  | 'delegation_quality'
  | 'blocker_handling'
  | 'artifact_usefulness'
  | 'conductor_decision_quality'
  | 'workflow_efficiency';

/**
 * Result for one rubric dimension. `applicable=false` (with score null) is the
 * canonical `not_applicable` and is DISTINCT from score 0. Missing evidence for
 * a CLAIMED success is applicable with a low score — never not_applicable.
 */
export interface DimensionResult {
  dimension: EvalDimension;
  applicable: boolean;
  /** 0..4 when applicable; null when not_applicable. */
  score: number | null;
  /** 0.0..1.0, reported separately from score. */
  confidence: number;
  /** Cited Kernel ids (receipt/task/artifact/worker/state_card), sorted/stable. */
  evidenceRefs: string[];
  /** Plain-language justification; must reference evidence ids when applicable. */
  rationale: string;
  /** What was missing / uncertain / not evaluated. */
  limitations?: string;
}

/** One evaluation of one unit: a set of scored dimensions + the unit's refs. */
export interface EvaluationResult {
  evalType: EvalType;
  workflowId: string | null;
  taskId: string | null;
  workerId: string | null;
  receiptId: string | null;
  dimensions: DimensionResult[];
}

/** Confidence threshold below which an eval requires operator review (EVALS_SPEC §10). */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/** Workflow-wide evidence read once from the Kernel; evaluators slice from it. */
export interface EvalEvidence {
  workflow: WorkflowSnapshot | null;
  region: WorkflowRegion | null;
  tasks: TaskSnapshot[];
  /** All workflow receipts, oldest-first. */
  receipts: ReceiptSnapshot[];
  artifacts: ArtifactSnapshot[];
  stateCards: StateCardSnapshot[];
  /** Existing artifact ids, for detecting claimed-but-missing artifacts. */
  artifactIds: Set<string>;
}
