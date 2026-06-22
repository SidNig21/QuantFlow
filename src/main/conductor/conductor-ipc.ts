/**
 * Conductor IPC — v3 Goal 5A / 5C / 5D.
 *
 * Bridges the renderer Conductor tile to the embedded main-process Conductor.
 *  - conductor:read-view  → read + assemble the view (no write). (5A)
 *  - conductor:run        → read + plan + append one planning receipt. (5A)
 *  - conductor:action     → one operator-triggered native action. (5C)
 *  - conductor:loop-step  → one approval-gated loop step. (5D)
 */

import { ipcMain } from 'electron';
import { readConductorView, runConductorPlan } from './conductor-reader';
import { createConductorActions, type ConductorSpawnRole } from './conductor-actions';
import { createConductorLoop, proposeNextAction, type CheckpointRequest } from './conductor-loop';
import { dispatchKernelCommand } from '../../kernel/commands/index';
import { queryArtifactList, queryConductorContext, queryReceiptList } from '../../kernel/queries/index';
import { getKernelDb } from '../../kernel/database';
import { queryRun } from '../../kernel/workflows/index';

export interface ConductorIpcOptions {
  /** Approved shell role-spawn binding (starts runtime; gated by kernel.worker.spawn). */
  spawnRole?: ConductorSpawnRole;
}

export function registerConductorIpc(options: ConductorIpcOptions = {}): void {
  ipcMain.handle(
    'conductor:read-view',
    async (_event, params: { workflowId?: string } = {}) =>
      readConductorView(params?.workflowId),
  );

  ipcMain.handle(
    'conductor:run',
    async (_event, params: { workflowId?: string } = {}) =>
      runConductorPlan(params?.workflowId),
  );

  // Goal 5C: operator-triggered single Conductor action (one at a time).
  // spawnRole routes to the approved shell role-spawn path (runtime + 6A gate).
  const actions = createConductorActions(undefined, { spawnRole: options.spawnRole });
  ipcMain.handle(
    'conductor:action',
    async (_event, payload: { action: string; args?: Record<string, unknown> } = { action: '' }) =>
      actions.runAction(payload?.action, payload?.args ?? {}),
  );

  // Goal 5D: approval-gated, operator-advanced loop. One step per call; the
  // operator approves/denies high-risk proposals. Stateless — reads the Kernel
  // each step and posts a decision receipt for every step.
  const loop = createConductorLoop({
    readContext: (workflowId) => queryConductorContext(workflowId ? { workflowId } : {}),
    readRun: (workflowId) => queryRun(getKernelDb(), workflowId),
    pauseRun: (workflowId, reason) =>
      dispatchKernelCommand('kernel.workflow.update', { id: workflowId, status: 'paused', reason }, 'conductor'),
    setCheckpointState: (workflowId, checkpointState) =>
      dispatchKernelCommand('kernel.workflow.update', { id: workflowId, checkpointState }, 'conductor'),
    createCandidateArtifact: async ({ workflowId, checkpoint, proposalToken }) => {
      const existing = queryArtifactList(workflowId ? { workflowId } : {})
        .find((artifact) =>
          artifact.kind === 'candidate'
          && artifact.metadata?.['checkpointId'] === checkpoint.checkpointId
          && artifact.metadata?.['proposalToken'] === proposalToken);
      if (existing) return { ok: true, id: existing.id, data: { artifactId: existing.id, idempotent: true } };
      return dispatchKernelCommand('kernel.artifact.create', {
        workflowId: workflowId ?? null,
        kind: 'candidate',
        summary: checkpoint.summary ?? `candidate set for ${checkpoint.checkpointId}`,
        metadata: {
          checkpointId: checkpoint.checkpointId,
          proposalToken,
          candidates: checkpoint.candidates,
        },
      }, 'conductor');
    },
    linkTaskDependency: ({ taskId, dependsOnTaskId, kind }) =>
      dispatchKernelCommand('kernel.task.depend', { taskId, dependsOnTaskId, kind }, 'conductor'),
    postHumanDecision: ({ workflowId, checkpoint, candidateArtifactId, selectedCandidateIds, proposalToken }) =>
      dispatchKernelCommand('kernel.receipt.post', {
        workflowId: workflowId ?? null,
        type: 'human_decision',
        summary: `selected ${selectedCandidateIds.join(', ')} at checkpoint ${checkpoint.checkpointId}`,
        artifactRefs: [candidateArtifactId],
        metadata: {
          checkpointId: checkpoint.checkpointId,
          candidateArtifactId,
          selectedCandidateIds,
          proposalToken,
        },
      }, 'conductor'),
    propose: proposeNextAction,
    runAction: (action, args) => actions.runAction(action, args),
    hasPendingApproval: ({ workflowId, proposalToken }) => {
      const receipts = queryReceiptList(workflowId ? { workflowId, limit: 100 } : { limit: 100 });
      const latestForToken = receipts.find(
        (r) => r.type === 'planning' && r.metadata?.['proposalToken'] === proposalToken,
      );
      return (latestForToken?.metadata?.['phase'] === 'awaiting-approval'
          || latestForToken?.metadata?.['phase'] === 'awaiting-selection')
        && latestForToken?.metadata?.['requestApproval'] === true;
    },
    postDecision: ({ workflowId, summary, phase, proposal, proposalToken, requestApproval }) =>
      dispatchKernelCommand(
        'kernel.conductor.plan',
        {
          workflowId: workflowId ?? null,
          summary,
          phase,
          proposedAction: proposal.kind === 'action' ? proposal.action : 'pause',
          proposalToken: proposalToken ?? null,
          nextAction: proposal.rationale,
          requestApproval: requestApproval === true,
        },
        'conductor',
      ),
  });
  ipcMain.handle(
    'conductor:loop-step',
    async (
      _event,
      input: {
        workflowId?: string;
        approve?: boolean;
        proposalToken?: string;
        checkpoint?: CheckpointRequest;
        selectedCandidateIds?: string[];
      } = {},
    ) => loop.step(input),
  );
}
