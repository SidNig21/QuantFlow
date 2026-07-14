/**
 * smoke:pod (R4) - deterministic durable pod runtime proof.
 *
 * Runs under bun with an in-memory Kernel DB. Uses the R3 DAG scheduler, R4 sim
 * harness, R4 runtime-manager, and the normal conductor action atom.
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
import { queryWorkerGet, queryWorkerList, queryWorkerForTile, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createConductorLoop } from '../../src/main/conductor/conductor-loop';
import { readSchedulableTasks } from '../../src/main/conductor/dag-scheduler';
import { createRuntimeManager } from '../../src/harness/runtime-manager/index';
import { createSimHarness, type SimScenario } from '../../src/harness/sim/index';

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}
function expectOk(label: string, result: { ok: boolean; error?: string }): void {
  check(`${label} (ok)`, result.ok === true);
  if (!result.ok) console.error(`        ${result.error}`);
}
function expectRejected(label: string, result: { ok: boolean }): void {
  check(`${label} (rejected)`, result.ok === false);
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
for (const migration of [
  '001-v3-baseline.sql',
  '002-evaluations.sql',
  '003-r1-worker-task-binding.sql',
  '004-r3-workflow-instance.sql',
  '005-r4-runtime.sql',
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-pod-'));
const now = Date.now();

db.prepare(
  `INSERT INTO workflows (id, name, objective, status, mode, budget_json, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R4 Pod', 'Prove durable pod runtime', 'active', 'sim', '{}', ?, ?, ?)`,
).run(artifactRoot, now, now);
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);

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
  expectOk(`active ${tileId}`, handleWorkerCommand(kdb, 'kernel.worker.status_update', {
    tileId,
    status: 'active',
    lastSeen: now,
  }));
  return queryWorkerForTile(kdb, tileId)!;
}

const workerA = createWorker('tile_a', 'Coder A');
const workerB = createWorker('tile_b', 'Coder B');
const verifierWorkerId = createWorker('tile_v', 'Verifier');

const attempts = new Map<string, number>();
function scenarioForTask(taskId: string | null): SimScenario {
  if (taskId === 'timeout') {
    const n = attempts.get(taskId) ?? 0;
    attempts.set(taskId, n + 1);
    return n === 0 ? 'timeout' : 'succeeds';
  }
  if (taskId === 'bad') return 'bad-artifact';
  if (taskId === 'missing') return 'downstream-missing-artifact';
  if (taskId === 'rate') return 'rate-limited';
  if (taskId === 'hitl') return 'human-checkpoint';
  if (taskId === 'reload') return 'reload-mid-run';
  return 'succeeds';
}

const sim = createSimHarness({
  artifactRoot,
  scenarioForMessage: (message) => scenarioForTask(message.taskId ?? null),
});
const actions = createConductorActions(dispatch, {
  getTask: (taskId) => queryTaskGet(kdb, taskId),
  getWorker: (workerId) => queryWorkerGet(kdb, workerId),
  getWorkerHarness: () => sim,
});

async function createTask(id: string, title = id): Promise<void> {
  expectOk(`create ${id}`, handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr-${id}`,
    title,
    objective: `${title} objective`,
  }));
}

async function runNode(id: string, tileId: string, attemptId = `att-${id}`): Promise<void> {
  const delivered = await actions.runAction('assign_task', {
    taskId: id,
    tileId,
    deliver: true,
    harnessKind: 'mock',
    artifactRoot,
    attemptId,
  });
  expectOk(`assign+deliver ${id}`, delivered);
  const verified = await actions.runAction('verify_task', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
    attemptId,
  });
  expectOk(`verify ${id}`, verified);
  check(`${id} complete`, queryTaskGet(kdb, id)?.status === 'complete');
}

console.log('- DAG pod run with multiple sim workers -');
for (const id of ['collect', 'analyze', 'extract', 'synthesize']) await createTask(id);
expectOk('depend analyze<-collect', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'analyze', dependsOnTaskId: 'collect' }));
expectOk('depend extract<-collect', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'extract', dependsOnTaskId: 'collect' }));
expectOk('depend synthesize<-analyze', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'synthesize', dependsOnTaskId: 'analyze' }));
expectOk('depend synthesize<-extract', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'synthesize', dependsOnTaskId: 'extract' }));
check('only collect schedulable first', JSON.stringify(readSchedulableTasks(kdb, 'wf1')) === JSON.stringify(['collect']));
await runNode('collect', 'tile_a');
check('reload mid-run keeps DAG eligibility', JSON.stringify([...readSchedulableTasks(kdb, 'wf1')].sort()) === JSON.stringify(['analyze', 'extract']));
check('queryRun survives reload-shaped reread', queryRun(kdb, 'wf1')?.taskIds.includes('collect') === true);
await runNode('analyze', 'tile_a');
await runNode('extract', 'tile_b');
check('synthesize eligible after both branches', JSON.stringify(readSchedulableTasks(kdb, 'wf1')) === JSON.stringify(['synthesize']));
await runNode('synthesize', 'tile_b');
check('DAG complete', ['collect', 'analyze', 'extract', 'synthesize'].every((id) => queryTaskGet(kdb, id)?.status === 'complete'));

console.log('\n- timeout -> stale -> recover -> re-dispatch -');
await createTask('timeout', 'Timeout first, then recover');
const timeoutFirst = await actions.runAction('assign_task', {
  taskId: 'timeout',
  tileId: 'tile_a',
  deliver: true,
  harnessKind: 'mock',
  artifactRoot,
  attemptId: 'att-timeout-1',
});
expectRejected('timeout first delivery returns clean no-artifact error', timeoutFirst);
check('timeout task remains working before recovery', queryTaskGet(kdb, 'timeout')?.status === 'working');
db.prepare('UPDATE worker_instances SET last_seen = ? WHERE id = ?').run(now - 120_000, workerA);
const manager = createRuntimeManager({
  now: () => now,
  staleAfterMs: 60_000,
  readWorker: (workerId) => queryWorkerGet(kdb, workerId),
  readWorkers: () => queryWorkerList(kdb, { workflowId: 'wf1' }),
  dispatchKernel: dispatch,
  stopRuntime: () => undefined,
});
const swept = await manager.sweepStaleWorkers();
check('stale sweep recovered timeout task', swept.some((row) => row.recoveredTaskId === 'timeout'));
check('timeout task recovered to open', queryTaskGet(kdb, 'timeout')?.status === 'open');
expectOk('reactivate recovered worker', handleWorkerCommand(kdb, 'kernel.worker.status_update', { workerId: workerA, status: 'active', lastSeen: now }));
await runNode('timeout', 'tile_a', 'att-timeout-2');

console.log('\n- cancel stops worker -');
expectOk('cancel workerB', await manager.cancelWorker(workerB, 'smoke cancel'));
check('workerB stopped', queryWorkerGet(kdb, workerB)?.status === 'stopped');
expectOk('reactivate workerB', handleWorkerCommand(kdb, 'kernel.worker.status_update', { workerId: workerB, status: 'active', lastSeen: now }));

console.log('\n- failure catalog paths do not corrupt state -');
await createTask('bad', 'Bad artifact');
const badDelivered = await actions.runAction('assign_task', {
  taskId: 'bad',
  tileId: 'tile_b',
  deliver: true,
  harnessKind: 'mock',
  artifactRoot,
  attemptId: 'att-bad',
});
expectOk('bad artifact delivered', badDelivered);
expectOk('bad artifact rejected by structural verify', await actions.runAction('verify_task', {
  taskId: 'bad',
  verifierWorkerId,
  verdict: 'pass',
  artifactRoot,
  attemptId: 'att-bad',
}));
check('bad artifact returned to working', queryTaskGet(kdb, 'bad')?.status === 'working');
check('verification_failed receipt posted', queryReceiptList(kdb, { taskId: 'bad' }).some((r) => r.type === 'verification_failed'));

const rateHandle = await sim.spawn({ tileId: 'rate-tile', harnessKind: 'mock' });
await sim.send(rateHandle, { text: 'rate', taskId: 'rate', artifactRoot });
check('rate-limited catalog blocks without draft', (await sim.readState(rateHandle)).status === 'blocked' && (await sim.collectReceipts(rateHandle)).length === 0);
await sim.send(rateHandle, { text: 'hitl', taskId: 'hitl', artifactRoot });
check('human checkpoint catalog blocks', /checkpoint/.test((await sim.readState(rateHandle)).blocker ?? ''));

console.log('\n- exactly-once retry and concurrent receipt writes -');
const artifactsBefore = queryArtifactList(kdb, { taskId: 'synthesize' }).length;
const synthArtifactId = queryArtifactList(kdb, { taskId: 'synthesize' })[0]!.id;
const submitRetry = handleTaskCommand(kdb, 'kernel.task.submit', {
  taskId: 'synthesize',
  artifactRefs: [synthArtifactId],
  attemptId: 'att-synthesize',
});
expectOk('retry submit same attempt idempotent', submitRetry);
const verifyRetry = handleTaskCommand(kdb, 'kernel.task.verify', {
  taskId: 'synthesize',
  verifierWorkerId,
  verdict: 'pass',
  artifactRoot,
  attemptId: 'att-synthesize',
});
expectOk('retry verify same attempt idempotent', verifyRetry);
check('no duplicate synthesize artifact', queryArtifactList(kdb, { taskId: 'synthesize' }).length === artifactsBefore);
check('single synthesize completion receipt', queryReceiptList(kdb, { taskId: 'synthesize' }).filter((r) => r.type === 'task_completed').length === 1);

await Promise.all(Array.from({ length: 20 }, (_, i) =>
  dispatch('kernel.receipt.post', {
    workflowId: 'wf1',
    type: 'progress',
    summary: `concurrent progress ${i}`,
    metadata: { i },
  }),
));
const concurrentRows = queryReceiptList(kdb, { workflowId: 'wf1', limit: 500 })
  .filter((r) => r.type === 'progress' && /^concurrent progress/.test(r.summary));
check('concurrent receipt writes all recorded', concurrentRows.length === 20);

console.log('\n- budget enforcement pauses the run -');
db.prepare("UPDATE workflows SET status = 'active', budget_json = ? WHERE id = 'wf1'")
  .run(JSON.stringify({ max_tool_calls: 1 }));
await dispatch('kernel.conductor.plan', {
  workflowId: 'wf1',
  summary: 'seed executed action',
  phase: 'executed',
  proposedAction: 'create_task',
});
const loop = createConductorLoop({
  readContext: () => queryConductorContext(kdb, { workflowId: 'wf1', receiptLimit: 500 }),
  readWorkflowProjection: () => queryRun(kdb, 'wf1'),
  suspendWorkflow: (workflowId, reason) => dispatch('kernel.workflow.update', { id: workflowId, status: 'suspended', reason }),
  propose: () => ({ kind: 'await_operator', risk: 'low', rationale: 'should not be reached' }),
  runAction: async () => ({ ok: true }),
  hasPendingApproval: () => false,
  postDecision: ({ workflowId, summary, phase, proposal }) =>
    dispatch('kernel.conductor.plan', {
      workflowId: workflowId ?? null,
      summary,
      phase,
      proposedAction: proposal.kind === 'action' ? proposal.action : 'await_operator',
      nextAction: proposal.rationale,
    }),
});
const budget = await loop.step({ workflowId: 'wf1' });
check('budget exceeded suspends loop', budget.status === 'budget_exceeded');
check('workflow status suspended', (queryRun(kdb, 'wf1')?.status) === 'suspended');

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
