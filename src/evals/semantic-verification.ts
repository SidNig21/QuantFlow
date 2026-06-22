/**
 * R7 semantic verification stage.
 *
 * This is deliberately pure: it consumes the structural verification result and
 * submitted artifact ids, then returns a judgment-shaped record. The Kernel
 * verification pipeline records the result on the verification receipt; eval
 * persistence is handled separately and remains non-authoritative.
 */

import type { StructuralArtifactResult } from '../kernel/artifacts/verify';

export interface SemanticVerificationInput {
  taskId: string;
  artifactRefs: string[];
  structural: StructuralArtifactResult;
}

export interface SemanticVerificationResult {
  ok: boolean;
  stage: 'semantic';
  confidence: number;
  evidenceRefs: string[];
  rationale: string;
  limitations?: string;
}

export function runSemanticVerificationStage(
  input: SemanticVerificationInput,
): SemanticVerificationResult {
  const evidenceRefs = [...new Set([input.taskId, ...input.artifactRefs])];
  if (!input.structural.ok) {
    return {
      ok: false,
      stage: 'semantic',
      confidence: 0.9,
      evidenceRefs,
      rationale: `Task ${input.taskId} cannot be semantically trusted because structural verification failed.`,
      limitations: 'Semantic judgment is blocked until artifact existence, root, size, and hash checks pass.',
    };
  }

  if (input.artifactRefs.length === 0) {
    return {
      ok: false,
      stage: 'semantic',
      confidence: 0.85,
      evidenceRefs: [input.taskId],
      rationale: `Task ${input.taskId} has no submitted artifacts to judge.`,
      limitations: 'No artifact refs were attached to the submitted task.',
    };
  }

  return {
    ok: true,
    stage: 'semantic',
    confidence: 0.65,
    evidenceRefs,
    rationale: `Task ${input.taskId} passed the R7 semantic stage over structurally verified artifact evidence.`,
    limitations: 'Deterministic scaffold only (v4 review C-02); real domain judgment deferred to eval/operator review.',
  };
}
