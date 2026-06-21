/**
 * smoke:dag (R3b) — a small task graph runs on mock workers with Kernel-enforced
 * dependency gating.
 *
 *   collect ─┬─ analyze ──┐
 *            └─ extract ──┴─ synthesize
 *
 * Asserts: only the root is schedulable first; a downstream task cannot be claimed
 * until every `blocks` upstream is complete + verification_passed; the two parallel
 * branches become eligible together; synthesize waits for BOTH; and the Run
 * projection (queryRun) aggregates task/artifact/receipt ids without duplicating
 * truth, with every artifact carrying run_id (= workflow_id).
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { queryRun } from '../../src/kernel/workflows/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { readSchedulableTasks } from '../../src/main/conductor/dag-scheduler';
import { createMockHarness } from '../../src/harness/mock/index';

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
db.exec(readFileSync(join(migrationsDir, '001-v3-baseline.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '002-evaluations.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '003-r1-worker-task-binding.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '004-r3-workflow-instance.sql'), 'utf-8'));
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-dag-'));
const now = Date.now();
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, mode, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R3 DAG', 'Prove a small DAG', 'active', 'research', ?, ?, ?)`,
).run(artifactRoot, now, now);
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);

handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Worker', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_w', workflowId: 'wf1', harnessKind: 'mock', roleName: 'Coder' });
handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_w', status: 'active' });
handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_v', workflowId: 'wf1', harnessKind: 'mock', roleName: 'Verifier' });
handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_v', status: 'active' });
const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v')!;
const mock = createMockHarness({ artifactRoot });

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};
const actions = createConductorActions(dispatch, {
  getTask: (taskId) => queryTaskGet(kdb, taskId),
  getWorker: (workerId) => queryWorkerGet(kdb, workerId),
  getWorkerHarness: (kind) => {
    if (kind !== 'mock') throw new Error(`unexpected harness in smoke: ${kind}`);
    return mock;
  },
});

// Run one node through the full canonical atom (assign → mock artifact → submit →
// structural verify → complete). Claiming routes through the R3b DAG gate.
async function runNode(id: string): Promise<void> {
  const delivered = await actions.runAction('assign_task', {
    taskId: id, tileId: 'tile_w', deliver: true, harnessKind: 'mock', artifactRoot, attemptId: `att-${id}`,
  });
  expectOk(`assign ${id}`, delivered);
  check(`${id} submitted`, queryTaskGet(kdb, id)?.status === 'submitted');
  const verified = await actions.runAction('verify_task', {
    taskId: id, verifierWorkerId, verdict: 'pass', artifactRoot, attemptId: `att-${id}`,
  });
  expectOk(`verify ${id}`, verified);
  check(`${id} complete`, queryTaskGet(kdb, id)?.status === 'complete');
}

console.log('— build the graph: collect → {analyze, extract} → synthesize —');
for (const [id, title] of [['collect', 'Collect'], ['analyze', 'Analyze'], ['extract', 'Extract'], ['synthesize', 'Synthesize']]) {
  expectOk(`create ${id}`, handleTaskCommand(kdb, 'kernel.task.create', {
    id, workflowId: 'wf1', correlationId: `corr_${id}`, title, objective: `${title} step`,
  }));
}
expectOk('depend analyze←collect', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'analyze', dependsOnTaskId: 'collect' }));
expectOk('depend extract←collect', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'extract', dependsOnTaskId: 'collect' }));
expectOk('depend synthesize←analyze', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'synthesize', dependsOnTaskId: 'analyze' }));
expectOk('depend synthesize←extract', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'synthesize', dependsOnTaskId: 'extract' }));
expectRejected('self-dependency rejected', handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'analyze', dependsOnTaskId: 'analyze' }));

console.log('\n— gating: only the root is schedulable; downstream claim is blocked —');
check('scheduler eligible = [collect] only', JSON.stringify(readSchedulableTasks(kdb, 'wf1')) === JSON.stringify(['collect']));
expectRejected('claim analyze before collect verified', handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'analyze', ownerWorkerId: queryWorkerForTile(kdb, 'tile_w') }));
check('analyze still open after blocked claim', queryTaskGet(kdb, 'analyze')?.status === 'open');

console.log('\n— run collect; both parallel branches become eligible together —');
await runNode('collect');
check('scheduler eligible = [analyze, extract] after collect', JSON.stringify([...readSchedulableTasks(kdb, 'wf1')].sort()) === JSON.stringify(['analyze', 'extract']));

console.log('\n— run analyze; synthesize NOT eligible until extract also done —');
await runNode('analyze');
check('synthesize not schedulable on one branch', !readSchedulableTasks(kdb, 'wf1').includes('synthesize'));
expectRejected('claim synthesize before extract verified', handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'synthesize', ownerWorkerId: queryWorkerForTile(kdb, 'tile_w') }));

console.log('\n— run extract; synthesize now eligible; run it —');
await runNode('extract');
check('synthesize schedulable after both branches', JSON.stringify(readSchedulableTasks(kdb, 'wf1')) === JSON.stringify(['synthesize']));
await runNode('synthesize');
check('all four tasks complete', ['collect', 'analyze', 'extract', 'synthesize'].every((id) => queryTaskGet(kdb, id)?.status === 'complete'));

console.log('\n— Run projection: aggregates references only; artifacts carry run_id —');
const run = queryRun(kdb, 'wf1')!;
check('run_id ≡ workflow_id', run.runId === 'wf1' && run.workflowId === 'wf1');
check('run mode carried', run.mode === 'research');
check('run aggregates all 4 task ids', JSON.stringify([...run.taskIds].sort()) === JSON.stringify(['analyze', 'collect', 'extract', 'synthesize']));
const artifactRows = queryArtifactList(kdb, { workflowId: 'wf1' });
check('run artifact ids match artifact rows (no dup)', run.artifactIds.length === artifactRows.length && run.artifactIds.length >= 4);
check('every artifact carries run_id (= workflow_id)', artifactRows.every((a) => a.workflowId === 'wf1'));
const receiptRows = queryReceiptList(kdb, {});
check('run receipt ids match receipt rows (no dup)', run.receiptIds.length === receiptRows.filter((r) => r.workflowId === 'wf1').length);
// References-only: the Run holds ids, never copies row bodies.
check('run holds ids, not row objects', run.taskIds.every((t) => typeof t === 'string') && run.artifactIds.every((a) => typeof a === 'string'));

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
