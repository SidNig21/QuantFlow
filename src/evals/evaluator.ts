/**
 * Evaluator — v3 Goal 9.
 *
 * Pure: turns Kernel evidence into EvaluationResults per docs/v3/EVALS_SPEC.md.
 * No DB writes, no clock, no model calls in v1 (deterministic-first). The Kernel
 * persists the results separately (src/kernel/evals); nothing here is truth.
 */

import { receiptsForTask } from './evidence';
import {
  scoreArtifactUsefulness,
  scoreBlockerHandling,
  scoreConductorDecisionQuality,
  scoreDelegationQuality,
  scoreEvidenceCompleteness,
  scoreTaskCompletionCorrectness,
  scoreVerificationIntegrity,
  scoreWorkerArtifactUsefulness,
  scoreWorkflowBlockerHandling,
  scoreWorkflowEfficiency,
} from './rubrics/index';
import type { EvalEvidence, EvaluationResult } from './types';

/** Evaluate one task: completion, verification, evidence, blocker, artifacts. */
export function evaluateTask(evidence: EvalEvidence, taskId: string): EvaluationResult | null {
  const task = evidence.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const taskReceipts = receiptsForTask(evidence, taskId);
  return {
    evalType: 'task_eval',
    workflowId: task.workflowId,
    taskId: task.id,
    workerId: task.ownerWorkerId,
    receiptId: null,
    dimensions: [
      scoreTaskCompletionCorrectness(task, taskReceipts, evidence),
      scoreVerificationIntegrity(task, taskReceipts),
      scoreEvidenceCompleteness(task, taskReceipts),
      scoreBlockerHandling(task, taskReceipts),
      scoreArtifactUsefulness(task, taskReceipts, evidence),
    ],
  };
}

/** Evaluate the verification integrity of a task's completion. */
export function evaluateVerification(evidence: EvalEvidence, taskId: string): EvaluationResult | null {
  const task = evidence.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const taskReceipts = receiptsForTask(evidence, taskId);
  const passed = taskReceipts.find((r) => r.type === 'verification_passed') ?? null;
  const failed = taskReceipts.find((r) => r.type === 'verification_failed') ?? null;
  return {
    evalType: 'verification_eval',
    workflowId: task.workflowId,
    taskId: task.id,
    workerId: passed?.workerId ?? failed?.workerId ?? null,
    receiptId: passed?.id ?? failed?.id ?? null,
    dimensions: [
      scoreVerificationIntegrity(task, taskReceipts),
      scoreEvidenceCompleteness(task, taskReceipts),
    ],
  };
}

/** Evaluate one Conductor planning/decision receipt. */
export function evaluateConductorDecision(evidence: EvalEvidence, receiptId: string): EvaluationResult | null {
  const planning = evidence.receipts.find((r) => r.id === receiptId && r.type === 'planning');
  if (!planning) return null;
  return {
    evalType: 'conductor_decision_eval',
    workflowId: planning.workflowId,
    taskId: planning.taskId,
    workerId: null,
    receiptId: planning.id,
    dimensions: [scoreConductorDecisionQuality(planning), scoreDelegationQuality(evidence)],
  };
}

/** Evaluate one worker's output quality (v1: artifact usefulness proxy). */
export function evaluateWorker(evidence: EvalEvidence, workerId: string): EvaluationResult {
  return {
    evalType: 'worker_eval',
    workflowId: evidence.workflow?.id ?? null,
    taskId: null,
    workerId,
    receiptId: null,
    dimensions: [scoreWorkerArtifactUsefulness(workerId, evidence)],
  };
}

/** Evaluate the workflow as a whole (delegation, blockers, efficiency, artifacts). */
export function evaluateWorkflow(evidence: EvalEvidence): EvaluationResult | null {
  if (!evidence.workflow) return null;
  return {
    evalType: 'workflow_eval',
    workflowId: evidence.workflow.id,
    taskId: null,
    workerId: null,
    receiptId: null,
    dimensions: [
      scoreDelegationQuality(evidence),
      scoreWorkflowBlockerHandling(evidence),
      scoreWorkflowEfficiency(evidence),
    ],
  };
}
