import {
  queryReceiptList,
  queryRun,
  queryStateCardList,
  queryTaskGet,
  queryUpstreamArtifacts,
  queryWorkerGet,
} from '../queries/index';

export interface ContextEnvelopeArtifact {
  artifact_id: string;
  title: string;
  uri: string | null;
  kind: string;
  verification_status: 'verified';
  produced_by_task: string;
  content_hash: string | null;
  media_type: string | null;
  size_bytes: number | null;
}

export interface ContextEnvelopeV0 {
  version: 'context-envelope/v0';
  run: {
    run_id: string | null;
    mode: string | null;
    objective: string | null;
  };
  role: {
    worker_id: string | null;
    tile_id: string | null;
    role_id: string | null;
    harness_id: string | null;
    model_id: string | null;
  };
  task: {
    id: string;
    objective: string;
    acceptance_criteria: string | null;
    expected_artifact: string | null;
    verification_rule: string | null;
  };
  permissions: {
    summary: string;
  };
  upstream_artifacts: ContextEnvelopeArtifact[];
  relevant_state_cards: Array<{
    tile_id: string;
    worker_id: string | null;
    current_task_id: string | null;
    status: string;
    blocker: string | null;
    last_meaningful_update: string | null;
    next_action: string | null;
  }>;
  recent_receipts: Array<{
    id: string;
    type: string;
    task_id: string | null;
    summary: string;
    artifact_refs: unknown[];
    created_at: number;
  }>;
  instrumentation: {
    context_tokens_estimate: number;
    raw_receipt_count: number;
  };
}

export function buildContextEnvelope(taskId: string): ContextEnvelopeV0 {
  const task = queryTaskGet(taskId);
  if (!task) throw new Error(`context envelope: task not found: ${taskId}`);

  const run = task.workflowId ? queryRun(task.workflowId) : null;
  const worker = task.ownerWorkerId ? queryWorkerGet(task.ownerWorkerId) : null;
  const receipts = queryReceiptList(
    task.workflowId ? { workflowId: task.workflowId, limit: 20 } : { taskId, limit: 20 },
  );
  const stateCards = task.workflowId ? queryStateCardList({ workflowId: task.workflowId }) : [];
  const upstreamArtifacts = queryUpstreamArtifacts(taskId);

  const base = {
    version: 'context-envelope/v0' as const,
    run: {
      run_id: run?.runId ?? task.workflowId,
      mode: run?.mode ?? null,
      objective: run?.objective ?? null,
    },
    role: {
      worker_id: task.ownerWorkerId,
      tile_id: worker?.tileId ?? null,
      role_id: worker?.roleId ?? null,
      harness_id: worker?.harnessId ?? null,
      model_id: worker?.modelId ?? null,
    },
    task: {
      id: task.id,
      objective: task.objective,
      acceptance_criteria: null,
      expected_artifact: null,
      verification_rule: null,
    },
    permissions: {
      summary: 'Kernel-mediated task execution; upstream artifacts are references only.',
    },
    upstream_artifacts: upstreamArtifacts.map((artifact) => ({
      artifact_id: artifact.artifactId,
      title: artifact.title,
      uri: artifact.uri,
      kind: artifact.kind,
      verification_status: artifact.verificationStatus,
      produced_by_task: artifact.producedByTask,
      content_hash: artifact.contentHash,
      media_type: artifact.mediaType,
      size_bytes: artifact.sizeBytes,
    })),
    relevant_state_cards: stateCards.map((card) => ({
      tile_id: card.tileId,
      worker_id: card.workerId,
      current_task_id: card.currentTaskId,
      status: card.status,
      blocker: card.blocker,
      last_meaningful_update: card.lastMeaningfulUpdate,
      next_action: card.nextAction,
    })),
    recent_receipts: receipts.map((receipt) => ({
      id: receipt.id,
      type: receipt.type,
      task_id: receipt.taskId,
      summary: receipt.summary,
      artifact_refs: receipt.artifactRefs,
      created_at: receipt.createdAt,
    })),
  };

  return {
    ...base,
    instrumentation: {
      context_tokens_estimate: Math.ceil(JSON.stringify(base).length / 4),
      raw_receipt_count: receipts.length,
    },
  };
}
