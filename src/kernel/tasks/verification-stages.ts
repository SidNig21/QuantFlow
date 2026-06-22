/**
 * R7 task verification stages.
 *
 * `taskVerify` calls this module instead of inlining structural + semantic
 * checks. Stages return evidence; the task command decides how to record the
 * verification receipt and state transition.
 */

import type { KernelDB } from '../database';
import { verifyTaskArtifacts } from '../artifacts/verify';
import { runSemanticVerificationStage } from '../../evals/semantic-verification';

export interface TaskVerificationStagesInput {
  taskId: string;
  artifactRefs: string[];
  artifactRoot?: string | null;
}

export function runTaskVerificationStages(
  db: KernelDB,
  input: TaskVerificationStagesInput,
) {
  const structural = verifyTaskArtifacts(db, {
    taskId: input.taskId,
    artifactRefs: input.artifactRefs,
    artifactRoot: input.artifactRoot ?? null,
  });
  const semantic = runSemanticVerificationStage({
    taskId: input.taskId,
    artifactRefs: input.artifactRefs,
    structural,
  });
  return { structural, semantic };
}
