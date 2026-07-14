/**
 * smoke:checkpoint (R5) - human checkpoint / deepen loop proof.
 *
 * Uses the R4 sim harness for deterministic upstream work, then drives the R5
 * Conductor loop checkpoint path: candidate artifact, token-bound selection,
 * human_decision receipt, selected-only deepening task, and checkpoint resume.
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleWorkflowCommand } from '../../src/kernel/commands/workflow-commands';
import { handleConductorCommand, queryConductorContext } from '../../src/kernel/conductor/index';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryRun } from '../../src/kernel/workflows/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createConductorLoop, type CheckpointRequest } from '../../src/main/conductor/conductor-loop';
import { createSimHarness } from '../../src/harness/sim/index';

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}
function expectOk(label: string, result: { ok: boolean; error?: string }): string {
  check(`${label} (ok)`, result.ok === true);
  if (!result.ok) console.error(`        ${result.error}`);
  return result.id as string;
}

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
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-checkpoint-'));
const now = Date.now();

db.prepare(
  `INSERT INTO workflows
     (id, name, objective, status, mode, budget_json, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R5 Checkpoint', 'Prove human steering loop', 'active', 'sim', '{}', ?, ?, ?)`,
).run(artifactRoot, now, now);
seedHarnessRegistry(kdb);

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.tile.')) return handleTileCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  if (type.startsWith('kernel.workflow.')) return handleWorkflowCommand(kdb, type, payload);
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};

function createWorker(tileId: string, roleName: string): string {
  expectOk(`tile ${tileId}`, handleTileCommand(kdb, 'kernel.tile.create', {
    id: tileId,
    workflowId: 'wf1',
    displayName: roleName,
    tileKind: 'worker',
  }));
  expectOk(`spawn ${tileId}`, handleWorkerCommand(kdb, 'kernel.worker.spawn', {
    tileId,
    workflowId: 'wf1',
    harnessKind: 'mock',
    roleName,
  }));
  expectOk(`active ${tileId}`, handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId, status: 'active', lastSeen: now }));
  return queryWorkerForTile(kdb, tileId)!;
}

createWorker('tile_w', 'Collector');
const verifierWorkerId = createWorker('tile_v', 'Verifier');

const sim = createSimHarness({ artifactRoot });
const actions = createConductorActions(dispatch, {
  getTask: (taskId) => queryTaskGet(kdb, taskId),
  getWorker: (workerId) => queryWorkerGet(kdb, workerId),
  getWorkerHarness: () => sim,
});

async function runNode(id: string, title: string): Promise<void> {
  expectOk(`create ${id}`, handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr-${id}`,
    title,
    objective: `${title} objective`,
  }));
  expectOk(`assign ${id}`, await actions.runAction('assign_task', {
    taskId: id,
    tileId: 'tile_w',
    deliver: true,
    harnessKind: 'mock',
    artifactRoot,
    attemptId: `att-${id}`,
  }));
  expectOk(`verify ${id}`, await actions.runAction('verify_task', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
    attemptId: `att-${id}`,
  }));
  check(`${id} complete`, queryTaskGet(kdb, id)?.status === 'complete');
}

function candidateArtifact(checkpointId: string, proposalToken: string) {
  return queryArtifactList(kdb, { workflowId: 'wf1' }).find((artifact) =>
    artifact.kind === 'candidate'
    && artifact.metadata['checkpointId'] === checkpointId
    && artifact.metadata['proposalToken'] === proposalToken);
}

const checkpoint: CheckpointRequest = {
  checkpointId: 'cp1',
  summary: 'Pick one lead to deepen',
  dependsOnTaskId: 'collect',
  candidates: [
    { id: 'alpha', title: 'Alpha lead', objective: 'Deepen the alpha lead.', dependsOnTaskId: 'collect' },
    { id: 'beta', title: 'Beta lead', objective: 'Deepen the beta lead.', dependsOnTaskId: 'collect' },
  ],
};
const driftedCheckpoint: CheckpointRequest = {
  ...checkpoint,
  candidates: [
    { id: 'alpha', title: 'Alpha lead drifted', objective: 'Changed candidate payload.', dependsOnTaskId: 'collect' },
    checkpoint.candidates[1]!,
  ],
};

const loop = createConductorLoop({
  readContext: () => queryConductorContext(kdb, { workflowId: 'wf1', receiptLimit: 500 }),
  readWorkflowProjection: () => queryRun(kdb, 'wf1'),
  setCheckpointState: (workflowId, checkpointState) =>
    dispatch('kernel.workflow.update', { id: workflowId, checkpointState }),
  createCandidateArtifact: async ({ workflowId, checkpoint, proposalToken }) => {
    const existing = candidateArtifact(checkpoint.checkpointId, proposalToken);
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
  propose: () => ({ kind: 'await_operator', risk: 'low', rationale: 'checkpoint smoke controls the next step' }),
  runAction: (action, args) => actions.runAction(action, args),
  hasPendingApproval: ({ workflowId, proposalToken }) => {
    const latestForToken = queryReceiptList(kdb, { workflowId, limit: 500 }).find((receipt) =>
      receipt.type === 'planning' && receipt.metadata['proposalToken'] === proposalToken);
    return latestForToken?.metadata['phase'] === 'awaiting-selection'
      && latestForToken?.metadata['requestApproval'] === true;
  },
  postDecision: ({ workflowId, summary, phase, proposal, proposalToken, requestApproval }) =>
    dispatch('kernel.conductor.plan', {
      workflowId: workflowId ?? null,
      summary,
      phase,
      proposedAction: proposal.kind === 'action' ? proposal.action : 'await_operator',
      proposalToken: proposalToken ?? null,
      nextAction: proposal.rationale,
      requestApproval: requestApproval === true,
    }),
});

console.log('- upstream sim task completes before checkpoint -');
await runNode('collect', 'Collect candidates');

console.log('\n- checkpoint pauses and surfaces candidate artifact -');
let result = await loop.step({ workflowId: 'wf1', checkpoint });
check('run pauses awaiting selection', result.status === 'awaiting-selection');
check('checkpoint_state awaiting-selection', queryRun(kdb, 'wf1')?.checkpointState === 'awaiting-selection');
const token = result.proposalToken!;
check('selection token returned', typeof token === 'string' && token.length > 0);
const candidates = queryArtifactList(kdb, { workflowId: 'wf1' }).filter((artifact) => artifact.kind === 'candidate');
check('candidate artifact surfaced', candidates.length === 1);
check('candidate artifact stores options', Array.isArray(candidates[0]?.metadata['candidates'])
  && (candidates[0]!.metadata['candidates'] as unknown[]).length === 2);
check('no deepening task before selection', queryTaskGet(kdb, 'cp1-deepen-alpha') === null && queryTaskGet(kdb, 'cp1-deepen-beta') === null);

console.log('\n- no selection keeps run paused; no auto-pick -');
result = await loop.step({ workflowId: 'wf1', checkpoint });
check('still awaiting selection', result.status === 'awaiting-selection');
check('still one candidate artifact', queryArtifactList(kdb, { workflowId: 'wf1' }).filter((artifact) => artifact.kind === 'candidate').length === 1);
check('still no deepening task', queryTaskGet(kdb, 'cp1-deepen-alpha') === null && queryTaskGet(kdb, 'cp1-deepen-beta') === null);

console.log('\n- forged and drifted tokens are refused -');
result = await loop.step({ workflowId: 'wf1', checkpoint, selectedCandidateIds: ['alpha'], proposalToken: 'forged-token' });
check('forged token stale', result.status === 'stale');
check('forged token spawned nothing', queryTaskGet(kdb, 'cp1-deepen-alpha') === null);
result = await loop.step({ workflowId: 'wf1', checkpoint: driftedCheckpoint, selectedCandidateIds: ['alpha'], proposalToken: token });
check('drifted candidate set stale', result.status === 'stale');
check('drifted candidate set spawned nothing', queryTaskGet(kdb, 'cp1-deepen-alpha') === null);
result = await loop.step({ workflowId: 'wf1', checkpoint });
check('candidate set can be refreshed after stale decision', result.status === 'awaiting-selection');
const refreshedToken = result.proposalToken!;

console.log('\n- valid token-bound selection spawns selected deepening task only -');
result = await loop.step({ workflowId: 'wf1', checkpoint, selectedCandidateIds: ['alpha'], proposalToken: refreshedToken });
check('selection accepted', result.status === 'selected');
check('checkpoint_state resumed', queryRun(kdb, 'wf1')?.checkpointState === 'resumed');
const decision = queryReceiptList(kdb, { workflowId: 'wf1', limit: 500 }).find((receipt) => receipt.type === 'human_decision');
check('human_decision receipt recorded', Boolean(decision));
check('human_decision references candidate artifact', decision?.artifactRefs.includes(candidates[0]!.id) === true);
check('selected task spawned', queryTaskGet(kdb, 'cp1-deepen-alpha')?.status === 'open');
check('unselected task not spawned', queryTaskGet(kdb, 'cp1-deepen-beta') === null);
const dep = db.prepare(
  "SELECT kind FROM task_dependencies WHERE task_id = 'cp1-deepen-alpha' AND depends_on_task_id = 'collect'",
).get() as { kind: string } | undefined;
check('selected task linked via context_from dependency', dep?.kind === 'context_from');

result = await loop.step({ workflowId: 'wf1', checkpoint, selectedCandidateIds: ['alpha'], proposalToken: refreshedToken });
check('replayed selection token stale', result.status === 'stale');
const duplicateRows = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id = 'cp1-deepen-alpha'").get() as { n: number };
check('no duplicate deepening task', duplicateRows.n === 1);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
