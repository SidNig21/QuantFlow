/**
 * smoke:run-template (R6) - named Scout/Research/Deep template proof.
 *
 * A run template is config only. This smoke drives the R6 runner over the real
 * R3 DAG scheduler, R4 sim harness delivery, and R5 checkpoint controller.
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleConnectionCommand } from '../../src/kernel/commands/connection-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleWorkflowCommand } from '../../src/kernel/commands/workflow-commands';
import { handleConductorCommand, queryConductorContext } from '../../src/kernel/conductor/index';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryRun } from '../../src/kernel/workflows/index';
import { queryWorkerForTile, queryWorkerGet, queryWorkerList, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createConductorLoop, type CheckpointRequest } from '../../src/main/conductor/conductor-loop';
import { readSchedulableTasks } from '../../src/main/conductor/dag-scheduler';
import { compileRunTemplate, createRunTemplateRunner, listRunTemplates, loadRunTemplate } from '../../src/main/conductor/run-template-runner';
import { createSimHarness } from '../../src/harness/sim/index';

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}
function expectOk(label: string, result: { ok: boolean; error?: string }): string {
  check(`${label} (ok)`, result.ok === true);
  if (!result.ok) console.error(`        ${result.error}`);
  return (result as { id?: string }).id ?? '';
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const templateDir = join(import.meta.dir, '..', '..', 'run-templates');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
for (const migration of [
  '001-v3-baseline.sql',
  '002-evaluations.sql',
  '003-r1-worker-task-binding.sql',
  '004-r3-workflow-instance.sql',
  '005-r4-runtime.sql',
  '006-r2-artifact-lineage.sql',
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-run-template-'));
seedHarnessRegistry(kdb);

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.tile.')) return handleTileCommand(kdb, type, payload);
  if (type.startsWith('kernel.connection.')) return handleConnectionCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  if (type.startsWith('kernel.workflow.')) return handleWorkflowCommand(kdb, type, payload);
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};

const sim = createSimHarness({ artifactRoot });
const actions = createConductorActions(dispatch, {
  getTask: (taskId) => queryTaskGet(kdb, taskId),
  getWorker: (workerId) => queryWorkerGet(kdb, workerId),
  getWorkerHarness: () => sim,
});

function candidateArtifact(workflowId: string, checkpointId: string, proposalToken: string) {
  return queryArtifactList(kdb, { workflowId }).find((artifact) =>
    artifact.kind === 'candidate'
    && artifact.metadata['checkpointId'] === checkpointId
    && artifact.metadata['proposalToken'] === proposalToken);
}

const loop = createConductorLoop({
  readContext: (workflowId) => queryConductorContext(kdb, { workflowId, receiptLimit: 1000 }),
  readRun: (workflowId) => queryRun(kdb, workflowId),
  setCheckpointState: (workflowId, checkpointState) =>
    dispatch('kernel.workflow.update', { id: workflowId, checkpointState }),
  createCandidateArtifact: async ({ workflowId, checkpoint, proposalToken }) => {
    const existing = candidateArtifact(workflowId!, checkpoint.checkpointId, proposalToken);
    if (existing) return { ok: true, id: existing.id, data: { artifactId: existing.id, idempotent: true } };
    return dispatch('kernel.artifact.create', {
      workflowId: workflowId ?? null,
      taskId: checkpoint.dependsOnTaskId ?? null,
      kind: 'candidate',
      summary: checkpoint.summary ?? `candidate set for ${checkpoint.checkpointId}`,
      metadata: {
        checkpointId: checkpoint.checkpointId,
        proposalToken,
        candidates: checkpoint.candidates,
      },
    });
  },
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
  propose: () => ({ kind: 'pause', risk: 'low', rationale: 'run-template smoke drives checkpoints explicitly' }),
  runAction: (action, args) => actions.runAction(action, args),
  hasPendingApproval: ({ workflowId, proposalToken }) => {
    const latestForToken = queryReceiptList(kdb, { workflowId, limit: 1000 }).find((receipt) =>
      receipt.type === 'planning' && receipt.metadata['proposalToken'] === proposalToken);
    return latestForToken?.metadata['phase'] === 'awaiting-selection'
      && latestForToken?.metadata['requestApproval'] === true;
  },
  postDecision: ({ workflowId, summary, phase, proposal, proposalToken, requestApproval }) =>
    dispatch('kernel.conductor.plan', {
      workflowId: workflowId ?? null,
      summary,
      phase,
      proposedAction: proposal.kind === 'action' ? proposal.action : 'pause',
      proposalToken: proposalToken ?? null,
      nextAction: proposal.rationale,
      requestApproval: requestApproval === true,
    }),
});

let schedulerCalls = 0;
const runner = createRunTemplateRunner({
  db: kdb,
  templateDir,
  dispatchKernel: dispatch,
  checkpointLoop: loop,
  scheduler: (kernelDb, workflowId) => {
    schedulerCalls += 1;
    return readSchedulableTasks(kernelDb, workflowId);
  },
  executeTask: async ({ workflowId, taskId, tileId, attemptId }) => {
    const assigned = await actions.runAction('assign_task', {
      taskId,
      tileId,
      deliver: true,
      harnessKind: 'mock',
      artifactRoot,
      attemptId,
    });
    if (!assigned.ok) return assigned;
    const verifierTile = queryWorkerList(kdb, { workflowId }).find((worker) => worker.tileId.endsWith('verifier'))?.tileId;
    const verifierWorkerId = verifierTile ? queryWorkerForTile(kdb, verifierTile) : null;
    return actions.runAction('verify_task', {
      taskId,
      verifierWorkerId,
      verdict: 'pass',
      artifactRoot,
      attemptId,
    });
  },
});

console.log('- templates load as config only -');
const templates = listRunTemplates(templateDir);
check('three named templates present', JSON.stringify(templates) === JSON.stringify(['deep', 'research', 'scout']));
for (const id of templates) {
  const template = loadRunTemplate(id, templateDir);
  const compiled = compileRunTemplate(template);
  check(`${id} compiles without unstocked roleIds`, compiled.taskPhases.length > 0 && compiled.checkpointPhases.length > 0);
}
const kernelTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%template%'").all() as unknown[];
check('no Kernel template table added', kernelTables.length === 0);

console.log('\n- Scout named invocation runs collect -> checkpoint -> deepen -');
const scout = await runner.invoke({
  templateId: 'scout',
  workflowId: 'wf-r6-scout',
  objective: 'Smoke Scout this topic',
  selections: [{ checkpointId: 'scout-pick-lead', selectedCandidateIds: ['market'] }],
});
check('scout invocation ok', scout.ok);
check('runner called shared DAG scheduler', schedulerCalls > 0 && scout.schedulerCalls > 0);
const scoutRun = queryRun(kdb, 'wf-r6-scout');
check('workflow mode set from template', scoutRun?.mode === 'scout');
check('budget stored on workflow', scoutRun?.budget['max_workers'] === 4);
check('run completed', scoutRun?.status === 'complete');
check('within declared worker budget', queryWorkerList(kdb, { workflowId: 'wf-r6-scout' }).length <= Number(scoutRun?.budget['max_workers']));
check('candidate artifact created', queryArtifactList(kdb, { workflowId: 'wf-r6-scout' }).some((artifact) => artifact.kind === 'candidate'));
check('human_decision receipt recorded', queryReceiptList(kdb, { workflowId: 'wf-r6-scout', limit: 1000 }).some((receipt) => receipt.type === 'human_decision'));
check('selected deepen task complete', queryTaskGet(kdb, 'wf-r6-scout-scout-pick-lead-deepen-market')?.status === 'complete');
check('unselected deepen task absent', queryTaskGet(kdb, 'wf-r6-scout-scout-pick-lead-deepen-sources') === null);
const scoutLowBatch = scout.executionLog.find((event) => event.kind === 'task-batch' && event.attention === 'low');
check('low-attention Scout collection ran as a parallel batch', (scoutLowBatch?.taskIds?.length ?? 0) >= 2);

console.log('\n- Deep proves high-attention serialization and multiple checkpoint reuse -');
const deep = await runner.invoke({
  templateId: 'deep',
  workflowId: 'wf-r6-deep',
  objective: 'Smoke Deep this topic',
  selections: [
    { checkpointId: 'deep-pick-branches', selectedCandidateIds: ['branch-a', 'branch-b'] },
    { checkpointId: 'deep-final-decision', selectedCandidateIds: ['final-brief'] },
  ],
});
check('deep invocation ok', deep.ok);
const highCheckpointEvents = deep.executionLog.filter((event) => event.kind === 'checkpoint' && event.attention === 'high');
check('high-attention checkpoint observed', highCheckpointEvents.length === 1);
check('no high-attention task batch exists', !deep.executionLog.some((event) => event.kind === 'task-batch' && event.attention === 'high'));
const deepLowBatches = deep.executionLog.filter((event) => event.kind === 'task-batch' && event.attention === 'low');
check('low-attention Deep work parallelized', deepLowBatches.some((event) => (event.taskIds?.length ?? 0) >= 2));
check('second checkpoint reused R5 controller after resumed state', queryReceiptList(kdb, { workflowId: 'wf-r6-deep', limit: 1000 }).filter((receipt) => receipt.type === 'human_decision').length === 2);
check('deep run completed', queryRun(kdb, 'wf-r6-deep')?.status === 'complete');

console.log('\n- no explicit selection does not auto-decide -');
const noSelection = await runner.invoke({
  templateId: 'scout',
  workflowId: 'wf-r6-no-selection',
  objective: 'Do not pick for me',
});
check('no selection returns clean blocker', noSelection.ok === false && /explicit human selection/.test(noSelection.error ?? ''));
check('no-selection run remains awaiting-selection', queryRun(kdb, 'wf-r6-no-selection')?.checkpointState === 'awaiting-selection');
check('no-selection did not spawn deepen task', queryTaskGet(kdb, 'wf-r6-no-selection-scout-pick-lead-deepen-market') === null);

console.log('\n- failed verify blocks workflow completion -');
const failRunner = createRunTemplateRunner({
  db: kdb,
  templateDir,
  dispatchKernel: dispatch,
  checkpointLoop: loop,
  scheduler: (kernelDb, workflowId) => readSchedulableTasks(kernelDb, workflowId),
  executeTask: async ({ taskId, tileId, attemptId }) => {
    const assigned = await actions.runAction('assign_task', {
      taskId,
      tileId,
      deliver: true,
      harnessKind: 'mock',
      artifactRoot,
      attemptId,
    });
    if (!assigned.ok) return assigned;
    const verifierTile = queryWorkerList(kdb, { workflowId: 'wf-r6-fail-verify' }).find((worker) => worker.tileId.endsWith('verifier'))?.tileId;
    const verifierWorkerId = verifierTile ? queryWorkerForTile(kdb, verifierTile) : null;
    return actions.runAction('verify_task', {
      taskId,
      verifierWorkerId,
      verdict: 'fail',
      artifactRoot,
      attemptId,
    });
  },
});
const failVerify = await failRunner.invoke({
  templateId: 'research',
  workflowId: 'wf-r6-fail-verify',
  objective: 'Structural verify failure must block completion',
});
check('failed verify invocation blocked', failVerify.ok === false);
check('failed-verify workflow not complete', queryRun(kdb, 'wf-r6-fail-verify')?.status !== 'complete');
check('failed-verify error names stuck tasks', /non-terminal or unverified|expected artifact kind/.test(failVerify.error ?? ''));

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
