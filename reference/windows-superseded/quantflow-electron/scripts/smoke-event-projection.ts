/**
 * smoke:event-projection (S0) - typed Kernel event projection proof.
 *
 * Drives the v4 transition set through existing Kernel seams and proves each
 * transition emits an ephemeral typed event that both onKernelEvent and a
 * subscribed WebContents receive. This does not persist an events table.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleWorkflowCommand } from '../../src/kernel/commands/workflow-commands';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleEvalCommand } from '../../src/kernel/evals/index';
import { onKernelEvent, subscribeWebContents, type KernelEventPayload } from '../../src/kernel/events/index';
import { createConductorLoop, type CheckpointRequest } from '../../src/main/conductor/conductor-loop';
import { queryConductorContext } from '../../src/kernel/conductor/index';
import { queryRun } from '../../src/kernel/workflows/index';
import { seedHarnessRegistry } from '../../src/kernel/worker-instances/index';

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}
function expectOk(label: string, result: { ok: boolean; error?: string; id?: string }): string {
  check(`${label} ok`, result.ok === true);
  if (!result.ok) console.error(`        ${result.error}`);
  return result.id as string;
}

const received: KernelEventPayload[] = [];
const forwarded: KernelEventPayload[] = [];
onKernelEvent((event) => received.push(event));
const unsubscribe = subscribeWebContents({
  isDestroyed: () => false,
  send: (channel: string, payload: KernelEventPayload) => {
    if (channel === 'kernel:event') forwarded.push(payload);
  },
} as never);

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const migration of [
  '001-v3-baseline.sql',
  '002-evaluations.sql',
  '003-r1-worker-task-binding.sql',
  '004-r3-workflow-instance.sql',
  '005-r4-runtime.sql',
  '006-r2-artifact-lineage.sql',
  '007-r7-typed-artifacts.sql',
  '008-d0-tile-extensions.sql',
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
const kdb = db as never;
seedHarnessRegistry(kdb);

const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-event-projection-'));
const outDir = join(artifactRoot, 'out');
mkdirSync(outDir, { recursive: true });

function artifactPath(name: string): string {
  const path = join(outDir, name);
  writeFileSync(path, `artifact ${name}\n`);
  return path;
}

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.workflow.')) return handleWorkflowCommand(kdb, type, payload);
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};

function saw(kind: string, predicate: (event: KernelEventPayload) => boolean = () => true): boolean {
  return received.some((event) => event.kind === kind && predicate(event));
}
function forwardedKind(kind: string): boolean {
  return forwarded.some((event) => event.kind === kind);
}

console.log('- drive v4 transition set -');
expectOk('workflow create', handleWorkflowCommand(kdb, 'kernel.workflow.create', {
  id: 'wf_events',
  name: 'S0 Events',
  objective: 'Prove event projection',
  status: 'active',
  vaultPath: artifactRoot,
}));
expectOk('workflow update', handleWorkflowCommand(kdb, 'kernel.workflow.update', {
  id: 'wf_events',
  mode: 'sim',
}));
expectOk('tile worker', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile_worker',
  workflowId: 'wf_events',
  displayName: 'Worker',
  tileKind: 'worker',
}));
expectOk('tile verifier', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile_verifier',
  workflowId: 'wf_events',
  displayName: 'Verifier',
  tileKind: 'worker',
}));
const workerId = expectOk('worker spawn', handleWorkerCommand(kdb, 'kernel.worker.spawn', {
  tileId: 'tile_worker',
  workflowId: 'wf_events',
  harnessKind: 'mock',
  roleName: 'Coder',
}));
const verifierId = expectOk('verifier spawn', handleWorkerCommand(kdb, 'kernel.worker.spawn', {
  tileId: 'tile_verifier',
  workflowId: 'wf_events',
  harnessKind: 'mock',
  roleName: 'Verifier',
}));
expectOk('worker active', handleWorkerCommand(kdb, 'kernel.worker.status_update', {
  workerId,
  status: 'active',
}));

expectOk('task create', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_pass',
  workflowId: 'wf_events',
  correlationId: 'corr-pass',
  title: 'Pass task',
  objective: 'Produce a valid artifact',
}));
expectOk('task claim', handleTaskCommand(kdb, 'kernel.task.claim', {
  taskId: 'task_pass',
  ownerWorkerId: workerId,
}));
expectOk('task start', handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_pass' }));
const passArtifact = expectOk('artifact create', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  id: 'artifact_pass',
  workflowId: 'wf_events',
  taskId: 'task_pass',
  workerId,
  tileId: 'tile_worker',
  kind: 'file',
  uri: artifactPath('pass.md'),
  summary: 'pass artifact',
}));
expectOk('task submit', handleTaskCommand(kdb, 'kernel.task.submit', {
  taskId: 'task_pass',
  artifactId: passArtifact,
  attemptId: 'att-pass',
}));
expectOk('task verify pass', handleTaskCommand(kdb, 'kernel.task.verify', {
  taskId: 'task_pass',
  verifierWorkerId: verifierId,
  artifactRoot,
  attemptId: 'att-pass',
}));
check('pass task complete', queryTaskGet(kdb, 'task_pass')?.status === 'complete');

expectOk('fail task create', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_fail',
  workflowId: 'wf_events',
  correlationId: 'corr-fail',
  title: 'Fail task',
  objective: 'Produce a rejected artifact',
}));
expectOk('fail task claim', handleTaskCommand(kdb, 'kernel.task.claim', {
  taskId: 'task_fail',
  ownerWorkerId: workerId,
}));
expectOk('fail task start', handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_fail' }));
const failArtifact = expectOk('fail artifact create', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  id: 'artifact_fail',
  workflowId: 'wf_events',
  taskId: 'task_fail',
  workerId,
  tileId: 'tile_worker',
  kind: 'file',
  uri: artifactPath('fail.md'),
  summary: 'fail artifact',
}));
expectOk('fail task submit', handleTaskCommand(kdb, 'kernel.task.submit', {
  taskId: 'task_fail',
  artifactId: failArtifact,
  attemptId: 'att-fail',
}));
expectOk('task verify fail', handleTaskCommand(kdb, 'kernel.task.verify', {
  taskId: 'task_fail',
  verifierWorkerId: verifierId,
  artifactRoot,
  verdict: 'fail',
  attemptId: 'att-fail',
}));

const checkpoint: CheckpointRequest = {
  checkpointId: 'cp-events',
  summary: 'Choose a branch',
  dependsOnTaskId: 'task_pass',
  candidates: [
    { id: 'alpha', title: 'Alpha', objective: 'Deepen alpha', dependsOnTaskId: 'task_pass' },
  ],
};
const loop = createConductorLoop({
  readContext: () => queryConductorContext(kdb, { workflowId: 'wf_events', receiptLimit: 500 }),
  readWorkflowProjection: () => queryRun(kdb, 'wf_events'),
  setCheckpointState: (workflowId, checkpointState) =>
    dispatch('kernel.workflow.update', { id: workflowId, checkpointState }),
  createCandidateArtifact: async ({ workflowId, checkpoint, proposalToken }) =>
    dispatch('kernel.artifact.create', {
      workflowId: workflowId ?? null,
      taskId: checkpoint.dependsOnTaskId ?? null,
      kind: 'candidate',
      summary: checkpoint.summary ?? `candidate set for ${checkpoint.checkpointId}`,
      metadata: { checkpointId: checkpoint.checkpointId, proposalToken, candidates: checkpoint.candidates },
    }),
  linkTaskDependency: ({ taskId, dependsOnTaskId, kind }) =>
    dispatch('kernel.task.depend', { taskId, dependsOnTaskId, kind }),
  postHumanDecision: ({ workflowId, checkpoint, candidateArtifactId, selectedCandidateIds, proposalToken }) =>
    dispatch('kernel.receipt.post', {
      workflowId: workflowId ?? null,
      type: 'human_decision',
      summary: `selected ${selectedCandidateIds.join(', ')} at checkpoint ${checkpoint.checkpointId}`,
      artifactRefs: [candidateArtifactId],
      metadata: { checkpointId: checkpoint.checkpointId, candidateArtifactId, selectedCandidateIds, proposalToken },
    }),
  propose: () => ({ kind: 'await_operator', risk: 'low', rationale: 'event smoke controls checkpoint' }),
  runAction: async (action, args) => {
    if (action === 'create_task') {
      return handleTaskCommand(kdb, 'kernel.task.create', args);
    }
    return { ok: true };
  },
  hasPendingApproval: ({ workflowId, proposalToken }) => {
    const latest = queryReceiptList(kdb, { workflowId, limit: 500 }).find((receipt) =>
      receipt.type === 'planning' && receipt.metadata['proposalToken'] === proposalToken);
    return latest?.metadata['phase'] === 'awaiting-selection'
      && latest.metadata['requestApproval'] === true;
  },
  postDecision: ({ workflowId, summary, phase, proposal, proposalToken, requestApproval }) =>
    dispatch('kernel.receipt.post', {
      workflowId: workflowId ?? null,
      type: 'planning',
      summary,
      metadata: {
        phase,
        proposal,
        proposalToken: proposalToken ?? null,
        requestApproval: requestApproval === true,
      },
    }),
});
let checkpointResult = await loop.step({ workflowId: 'wf_events', checkpoint });
check('checkpoint awaits selection', checkpointResult.status === 'awaiting-selection');
const token = checkpointResult.proposalToken!;
const candidateArtifact = queryArtifactList(kdb, { workflowId: 'wf_events' })
  .find((artifact) => artifact.kind === 'candidate' && artifact.metadata['proposalToken'] === token);
check('candidate artifact exists', Boolean(candidateArtifact));
checkpointResult = await loop.step({
  workflowId: 'wf_events',
  checkpoint,
  proposalToken: token,
  selectedCandidateIds: ['alpha'],
});
check('checkpoint selection accepted', checkpointResult.status === 'selected');

expectOk('manual eval create', handleEvalCommand(kdb, 'kernel.eval.create', {
  evalType: 'task_eval',
  workflowId: 'wf_events',
  taskId: 'task_pass',
  dimensions: [{
    dimension: 'task_completion_correctness',
    applicable: true,
    score: 4,
    confidence: 1,
    evidenceRefs: ['task_pass'],
    rationale: 'event smoke evaluation',
  }],
}));
expectOk('workflow complete', handleWorkflowCommand(kdb, 'kernel.workflow.update', {
  id: 'wf_events',
  status: 'complete',
}));

console.log('\n- assert typed event coverage -');
const expectedKinds = [
  'workflow.created',
  'workflow.updated',
  'worker.status_updated',
  'task.created',
  'task.claimed',
  'task.started',
  'artifact.created',
  'task.submitted',
  'task.verifying',
  'task.verification_passed',
  'task.verification_failed',
  'task.completed',
  'checkpoint.awaiting-selection',
  'human_decision',
  'evaluation.created',
];
for (const kind of expectedKinds) {
  check(`${kind} emitted`, saw(kind));
  check(`${kind} forwarded`, forwardedKind(kind));
}
check('artifact.created carries artifact id', saw('artifact.created', (event) =>
  (event.data as Record<string, unknown> | undefined)?.['artifactId'] === passArtifact));
check('checkpoint event carries proposal token', saw('checkpoint.awaiting-selection', (event) =>
  (event.data as Record<string, unknown> | undefined)?.['proposalToken'] === token));
check('human_decision carries selected ids', saw('human_decision', (event) =>
  Array.isArray(((event.data as Record<string, unknown> | undefined)?.['metadata'] as Record<string, unknown> | undefined)?.['selectedCandidateIds'])));
check('ephemeral events did not write events table rows', (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n === 0);

unsubscribe();
console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
