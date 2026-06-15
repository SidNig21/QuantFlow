/**
 * Evaluation layer (v3 Goal 9) — public surface.
 *
 * Pure derived analysis of Kernel evidence. Evals never mutate Kernel state and
 * no runtime behavior depends on eval results. Persistence lives in the Kernel
 * (`src/kernel/evals`, the `evaluations` table); this layer only reads + scores.
 * See docs/v3/EVALS_SPEC.md.
 */

export * from './types';
export { collectEvalEvidence } from './evidence';
export {
  evaluateTask,
  evaluateVerification,
  evaluateConductorDecision,
  evaluateWorker,
  evaluateWorkflow,
} from './evaluator';
