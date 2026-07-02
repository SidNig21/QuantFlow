/**
 * Rubric scorers — v3 Goal 9 (deterministic-first).
 *
 * Each scorer is a pure function over Kernel evidence snapshots that returns one
 * DimensionResult per docs/v3/EVALS_SPEC.md. Rules honored here:
 *  - `not_applicable` (applicable=false, score=null) is DISTINCT from score 0.
 *  - Missing evidence for a CLAIMED success lowers the score (never N/A).
 *  - Rationale references evidence ids; evidenceRefs are sorted for determinism.
 *  - Confidence is reported separately from score.
 */

import { claimedArtifactIds } from '../evidence';
import type {
  DimensionResult,
  EvalDimension,
  EvalEvidence,
  ReceiptSnapshot,
  TaskSnapshot,
} from '../types';

const TERMINAL = new Set(['complete', 'failed']);

function oneLine(value: unknown, max = 120): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sortedUnique(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))].sort();
}

function applicable(
  dimension: EvalDimension,
  score: number,
  confidence: number,
  evidenceRefs: Array<string | null | undefined>,
  rationale: string,
  limitations?: string,
): DimensionResult {
  return {
    dimension,
    applicable: true,
    score: Math.max(0, Math.min(4, score)),
    confidence,
    evidenceRefs: sortedUnique(evidenceRefs),
    rationale,
    ...(limitations ? { limitations } : {}),
  };
}

function notApplicable(dimension: EvalDimension, rationale: string, limitations?: string): DimensionResult {
  return {
    dimension,
    applicable: false,
    score: null,
    confidence: 1.0, // we are certain the dimension does not apply
    evidenceRefs: [],
    rationale,
    ...(limitations ? { limitations } : {}),
  };
}

// ── Task-scoped dimensions ─────────────────────────────────────────────────

export function scoreVerificationIntegrity(task: TaskSnapshot, taskReceipts: ReceiptSnapshot[]): DimensionResult {
  const completed = task.status === 'complete';
  const passed = taskReceipts.find((r) => r.type === 'verification_passed') ?? null;
  const failed = taskReceipts.find((r) => r.type === 'verification_failed') ?? null;
  const completedReceipt = taskReceipts.find((r) => r.type === 'task_completed') ?? null;
  const reachedVerify =
    completed || task.status === 'verifying' || taskReceipts.some((r) => r.type === 'verification_started');

  if (!completed && !reachedVerify) {
    return notApplicable(
      'verification_integrity',
      `Task ${task.id} has not reached verification.`,
      'No completion to verify yet.',
    );
  }

  if (completed && !passed) {
    const legacy = completedReceipt?.metadata?.['legacy'] === true;
    return applicable(
      'verification_integrity',
      0,
      0.95,
      [task.id, completedReceipt?.id],
      `Task ${task.id} reached complete (receipt ${completedReceipt?.id ?? 'n/a'}) with no verification_passed receipt.`,
      legacy ? 'Completed via legacy bypass; no independent verification.' : 'Completed without a verification_passed receipt.',
    );
  }

  if (passed) {
    const verifier = passed.workerId;
    const owner = task.ownerWorkerId;
    if (verifier && owner && verifier === owner) {
      return applicable(
        'verification_integrity',
        1,
        0.9,
        [passed.id, task.id],
        `verification_passed ${passed.id} was authored by the task owner (${owner}).`,
        'Self-verification: verifier identity equals owner; integrity capped.',
      );
    }
    return applicable(
      'verification_integrity',
      4,
      0.9,
      [passed.id],
      `Independent verification_passed ${passed.id}${verifier ? ` by worker ${verifier}` : ''}.`,
    );
  }

  if (failed) {
    return applicable(
      'verification_integrity',
      2,
      0.85,
      [failed.id],
      `Verification ran and failed (${failed.id}); task returned for rework.`,
      'No passing verification yet.',
    );
  }

  return applicable(
    'verification_integrity',
    2,
    0.6,
    [task.id],
    `Task ${task.id} entered verification but has no pass/fail outcome receipt.`,
    'Verification outcome pending.',
  );
}

export function scoreTaskCompletionCorrectness(
  task: TaskSnapshot,
  taskReceipts: ReceiptSnapshot[],
  evidence: EvalEvidence,
): DimensionResult {
  if (!TERMINAL.has(task.status)) {
    return notApplicable(
      'task_completion_correctness',
      `Task ${task.id} is ${task.status}, not terminal.`,
      'Task not yet complete or failed.',
    );
  }

  if (task.status === 'failed') {
    const failedReceipt = taskReceipts.find((r) => r.type === 'task_failed') ?? null;
    return applicable(
      'task_completion_correctness',
      0,
      0.9,
      [task.id, failedReceipt?.id],
      `Task ${task.id} ended in failed${failedReceipt ? ` (receipt ${failedReceipt.id})` : ''}.`,
    );
  }

  // complete
  const completedReceipt = taskReceipts.find((r) => r.type === 'task_completed') ?? null;
  const passed = taskReceipts.find((r) => r.type === 'verification_passed') ?? null;
  const claimed = claimedArtifactIds(taskReceipts);
  const missing = claimed.filter((id) => !evidence.artifactIds.has(id));
  const taskArtifacts = evidence.artifacts.filter((a) => a.taskId === task.id);

  let score = 4;
  const refs: Array<string | null | undefined> = [task.id, completedReceipt?.id];
  const limitations: string[] = [];

  if (!passed) {
    score = 1;
    limitations.push('completed without a verification_passed receipt');
  } else {
    refs.push(passed.id);
  }

  if (missing.length) {
    score = Math.min(score, 2);
    limitations.push(`claims artifact(s) with no Kernel row: ${missing.join(', ')}`);
  } else if (taskArtifacts.length) {
    refs.push(...taskArtifacts.map((a) => a.id));
  } else if (passed) {
    score = Math.min(score, 3);
    limitations.push('no artifacts produced');
  }

  return applicable(
    'task_completion_correctness',
    score,
    0.9,
    refs,
    `Task ${task.id} completed${passed ? ` with verification ${passed.id}` : ' without verification'}${
      taskArtifacts.length ? ` and ${taskArtifacts.length} artifact(s)` : ''
    }.`,
    limitations.length ? limitations.join('; ') : undefined,
  );
}

export function scoreEvidenceCompleteness(task: TaskSnapshot, taskReceipts: ReceiptSnapshot[]): DimensionResult {
  const present = new Set(taskReceipts.map((r) => r.type));
  const completedReceipt = taskReceipts.find((r) => r.type === 'task_completed') ?? null;
  const legacy = completedReceipt?.metadata?.['legacy'] === true;

  let expected: string[];
  if (task.status === 'complete') {
    expected = ['task_created', 'task_claimed', 'task_started', 'task_submitted', 'task_completed'];
    if (!legacy) expected.push('verification_passed');
  } else if (task.status === 'failed') {
    expected = ['task_created', 'task_failed'];
  } else if (task.status === 'blocked') {
    expected = ['task_created', 'task_claimed', 'task_started', 'task_blocked'];
  } else {
    // in-progress: minimal expectation is creation.
    expected = ['task_created'];
  }

  const found = expected.filter((t) => present.has(t));
  const missing = expected.filter((t) => !present.has(t));
  const ratio = expected.length ? found.length / expected.length : 1;
  const score = Math.round(ratio * 4);
  const refs = taskReceipts.filter((r) => expected.includes(r.type)).map((r) => r.id);

  return applicable(
    'evidence_completeness',
    score,
    0.85,
    [task.id, ...refs],
    `Task ${task.id}: ${found.length}/${expected.length} expected receipts for status '${task.status}'${
      legacy ? ' (legacy completion, verification not expected)' : ''
    }.`,
    missing.length ? `Missing expected receipts: ${missing.join(', ')}` : undefined,
  );
}

export function scoreBlockerHandling(task: TaskSnapshot, taskReceipts: ReceiptSnapshot[]): DimensionResult {
  const blocks = taskReceipts.filter((r) => r.type === 'task_blocked');
  if (!blocks.length) {
    return notApplicable('blocker_handling', `Task ${task.id} had no blockers.`);
  }
  const lastBlock = blocks[blocks.length - 1];
  if (task.status === 'blocked') {
    return applicable(
      'blocker_handling',
      1,
      0.85,
      [lastBlock.id, task.id],
      `Task ${task.id} is still blocked (receipt ${lastBlock.id}).`,
      `Unresolved blocker: ${oneLine(lastBlock.summary)}`,
    );
  }
  return applicable(
    'blocker_handling',
    3,
    0.8,
    [lastBlock.id, task.id],
    `Task ${task.id} was blocked (${lastBlock.id}) and later progressed to ${task.status}.`,
  );
}

export function scoreArtifactUsefulness(
  task: TaskSnapshot,
  taskReceipts: ReceiptSnapshot[],
  evidence: EvalEvidence,
): DimensionResult {
  const taskArtifacts = evidence.artifacts.filter((a) => a.taskId === task.id);
  const claimed = claimedArtifactIds(taskReceipts);
  const missing = claimed.filter((id) => !evidence.artifactIds.has(id));

  if (!taskArtifacts.length && !claimed.length) {
    return notApplicable('artifact_usefulness', `Task ${task.id} produced no artifacts.`);
  }
  if (missing.length) {
    return applicable(
      'artifact_usefulness',
      1,
      0.6,
      [task.id],
      `Task ${task.id} references artifact(s) absent from the Kernel.`,
      `Missing artifact row(s): ${missing.join(', ')}`,
    );
  }
  const receiptLinked = taskArtifacts.filter((a) => a.receiptId);
  return applicable(
    'artifact_usefulness',
    receiptLinked.length === taskArtifacts.length ? 3 : 2,
    0.4, // judgment dimension: low confidence in v1 (structural proxy, no model)
    taskArtifacts.map((a) => a.id),
    `Task ${task.id} produced ${taskArtifacts.length} artifact(s); ${receiptLinked.length} receipt-linked.`,
    'Structural proxy only; true usefulness needs human/model review.',
  );
}

// ── Conductor / workflow dimensions ────────────────────────────────────────

export function scoreConductorDecisionQuality(planning: ReceiptSnapshot): DimensionResult {
  const phase = String(planning.metadata?.['phase'] ?? '');
  const action = String(planning.metadata?.['proposedAction'] ?? 'unknown');
  if (phase === 'executed') {
    return applicable(
      'conductor_decision_quality',
      4,
      0.8,
      [planning.id],
      `Decision ${planning.id} (${action}) executed.`,
    );
  }
  if (phase === 'denied' || phase === 'stale' || phase === 'failed') {
    return applicable(
      'conductor_decision_quality',
      1,
      0.85,
      [planning.id],
      `Decision ${planning.id} (${action}) ended in '${phase}'.`,
      `Proposal did not execute (${phase}).`,
    );
  }
  if (phase === 'awaiting_operator') {
    return applicable(
      'conductor_decision_quality',
      2,
      0.7,
      [planning.id],
      `Decision ${planning.id} (${action}) paused for operator/ambiguity.`,
    );
  }
  return applicable(
    'conductor_decision_quality',
    2,
    0.6,
    [planning.id],
    `Decision ${planning.id} (${action}) has no recorded execution phase.`,
    'Decision outcome phase not recorded.',
  );
}

export function scoreDelegationQuality(evidence: EvalEvidence): DimensionResult {
  const planning = evidence.receipts.filter((r) => r.type === 'planning');
  if (!planning.length) {
    return notApplicable('delegation_quality', 'No Conductor delegation in this workflow.');
  }
  const denied = planning.filter((p) => ['denied', 'stale', 'failed'].includes(String(p.metadata?.['phase'] ?? '')));
  const failedTasks = evidence.tasks.filter((t) => t.status === 'failed').length;
  const completedTasks = evidence.tasks.filter((t) => t.status === 'complete').length;

  let score = 3;
  const limitations: string[] = [];
  if (denied.length) {
    score = Math.min(score, 1);
    limitations.push(`${denied.length} decision(s) denied/stale/failed`);
  }
  if (failedTasks > completedTasks) {
    score = Math.min(score, 1);
    limitations.push(`${failedTasks} failed vs ${completedTasks} completed task(s)`);
  }
  return applicable(
    'delegation_quality',
    score,
    0.75,
    planning.map((p) => p.id),
    `Workflow has ${planning.length} delegation decision(s); ${completedTasks} completed, ${failedTasks} failed.`,
    limitations.length ? limitations.join('; ') : undefined,
  );
}

export function scoreWorkflowBlockerHandling(evidence: EvalEvidence): DimensionResult {
  const blockedIds = evidence.region?.blockedTaskIds ?? [];
  const blockReceipts = evidence.receipts.filter((r) => r.type === 'task_blocked');
  if (!blockReceipts.length && blockedIds.length === 0) {
    return notApplicable('blocker_handling', 'No blockers in this workflow.');
  }
  if (blockedIds.length > 0) {
    const refs = [...blockedIds, ...blockReceipts.filter((r) => r.taskId && blockedIds.includes(r.taskId)).map((r) => r.id)];
    return applicable(
      'blocker_handling',
      1,
      0.85,
      refs,
      `Workflow has ${blockedIds.length} unresolved blocked task(s): ${blockedIds.join(', ')}.`,
      `Unresolved blocked tasks: ${blockedIds.join(', ')}`,
    );
  }
  return applicable(
    'blocker_handling',
    3,
    0.8,
    blockReceipts.map((r) => r.id),
    `All ${blockReceipts.length} blocking event(s) were resolved.`,
  );
}

export function scoreWorkflowEfficiency(evidence: EvalEvidence): DimensionResult {
  const region = evidence.region;
  const blocked = region?.blockedTaskCount ?? 0;
  const failed = evidence.tasks.filter((t) => t.status === 'failed').length;
  let score = 4;
  const penalties: string[] = [];
  if (blocked > 0) {
    score -= 2;
    penalties.push(`${blocked} blocked task(s)`);
  }
  if (failed > 0) {
    score -= 1;
    penalties.push(`${failed} failed task(s)`);
  }
  return applicable(
    'workflow_efficiency',
    score,
    0.75,
    [evidence.workflow?.id],
    `Workflow efficiency from ${evidence.tasks.length} task(s): ${penalties.length ? penalties.join(', ') : 'no blocked/failed tasks'}.`,
    penalties.length ? `Penalized for: ${penalties.join(', ')}` : undefined,
  );
}

export function scoreWorkerArtifactUsefulness(workerId: string, evidence: EvalEvidence): DimensionResult {
  const workerArtifacts = evidence.artifacts.filter((a) => a.workerId === workerId);
  if (!workerArtifacts.length) {
    return notApplicable('artifact_usefulness', `Worker ${workerId} produced no artifacts.`);
  }
  const receiptLinked = workerArtifacts.filter((a) => a.receiptId);
  return applicable(
    'artifact_usefulness',
    receiptLinked.length === workerArtifacts.length ? 3 : 2,
    0.4,
    workerArtifacts.map((a) => a.id),
    `Worker ${workerId} produced ${workerArtifacts.length} artifact(s); ${receiptLinked.length} receipt-linked.`,
    'Structural proxy only; true usefulness needs human/model review.',
  );
}
