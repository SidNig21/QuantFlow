/**
 * R1 one-real-task atom smoke.
 *
 * Drives the Conductor -> harness -> Kernel artifact -> submit -> structural
 * verify path against the deterministic mock harness. Also asserts the negative
 * artifact cases that must never reach complete.
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createMockHarness } from '../../src/harness/mock/index';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}`); }
}

function expectOk(label: string, result: { ok: boolean; error?: string }): void {
  check(`${label} (ok)`, result.ok === true);
  if (!result.ok) console.error(`        error: ${result.error}`);
}

function expectReject(label: string, result: { ok: boolean; error?: string }): void {
  check(`${label} (rejected)`, result.ok === false);
  if (result.ok) console.error('        unexpectedly accepted');
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(join(migrationsDir, '001-v3-baseline.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '002-evaluations.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '003-r1-worker-task-binding.sql'), 'utf-8'));
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-task-atom-'));
const now = Date.now();
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R1 Atom', 'Prove one real task atom', 'active', ?, ?, ?)`,
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

console.log('— happy atom: assign → send → artifact → submit → structural verify → complete —');
expectOk('create task', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_atom',
  workflowId: 'wf1',
  correlationId: 'corr_atom',
  title: 'Write proof',
  objective: 'Write the R1 proof artifact.',
}));
const delivered = await actions.runAction('assign_task', {
  taskId: 'task_atom',
  tileId: 'tile_w',
  deliver: true,
  harnessKind: 'mock',
  artifactRoot,
  attemptId: 'attempt-1',
});
expectOk('assign delivers through mock harness', delivered);
const assignedTask = queryTaskGet(kdb, 'task_atom')!;
const assignedWorker = queryWorkerGet(kdb, assignedTask.ownerWorkerId!)!;
check('owner_worker_id non-null after assign', assignedTask.ownerWorkerId != null);
check('worker assigned_task_id points back', assignedWorker.assignedTaskId === 'task_atom');
check('mock recorded the instruction via send', mock.getRecordedSends().some((s) => s.taskId === 'task_atom' && s.text.includes('Write proof')));
check('task submitted after harness artifact post', queryTaskGet(kdb, 'task_atom')?.status === 'submitted');

const verified = await actions.runAction('verify_task', {
  taskId: 'task_atom',
  verifierWorkerId,
  verdict: 'pass',
  artifactRoot,
  attemptId: 'attempt-1',
});
expectOk('structural verify completes', verified);
check('task complete', queryTaskGet(kdb, 'task_atom')?.status === 'complete');

const chain = queryReceiptList(kdb, { taskId: 'task_atom' });
const chainTypes = chain.map((r) => r.type);
console.log('  receipt chain:', chainTypes.join(' -> '));
check('exact receipt chain',
  JSON.stringify(chainTypes) === JSON.stringify([
    'task_created',
    'task_claimed',
    'task_started',
    'artifact_created',
    'task_submitted',
    'verification_started',
    'verification_passed',
    'task_completed',
  ]));
const byCorrelation = queryReceiptList(kdb, { correlationId: 'corr_atom' }).map((r) => r.type);
check('full chain queryable by correlation_id alone', JSON.stringify(byCorrelation) === JSON.stringify(chainTypes));
check('task_submitted carries artifact_refs', (chain.find((r) => r.type === 'task_submitted')?.artifactRefs.length ?? 0) === 1);
const passReceipt = chain.find((r) => r.type === 'verification_passed');
check('verification_passed carries artifact_refs', (passReceipt?.artifactRefs.length ?? 0) === 1);
check('verify opened the artifact file', Array.isArray(passReceipt?.metadata?.['structural']?.['openedArtifacts'])
  && (passReceipt!.metadata['structural'] as any).openedArtifacts.length === 1);
check('no legacy bypass in happy atom', !chain.some((r) => r.type === 'task_completed' && r.metadata?.['legacy'] === true));
check('artifact row links workflow/task/worker', queryArtifactList(kdb, { taskId: 'task_atom' }).some((a) =>
  a.workflowId === 'wf1' && a.taskId === 'task_atom' && a.workerId === assignedTask.ownerWorkerId));

console.log('\n— negative cases: artifact gate blocks completion —');

function makeWorkingTask(id: string): void {
  expectOk(`create ${id}`, handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr_${id}`,
    title: id,
    objective: 'negative case',
  }));
  expectOk(`claim ${id}`, handleTaskCommand(kdb, 'kernel.task.claim', { taskId: id, ownerWorkerId: queryWorkerForTile(kdb, 'tile_w') }));
  expectOk(`start ${id}`, handleTaskCommand(kdb, 'kernel.task.start', { taskId: id }));
}

function createArtifact(id: string, uri: string, body: string | null, contentHash?: string): string {
  if (body !== null) writeFileSync(resolve(artifactRoot, uri), body, 'utf-8');
  const result = handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf1',
    taskId: id,
    workerId: queryTaskGet(kdb, id)?.ownerWorkerId,
    kind: 'file',
    uri,
    summary: `artifact for ${id}`,
    contentHash: contentHash ?? null,
  });
  expectOk(`artifact ${id}`, result);
  return result.id as string;
}

function assertStructuralFailure(id: string, artifactId: string): void {
  expectOk(`submit ${id}`, handleTaskCommand(kdb, 'kernel.task.submit', { taskId: id, artifactRefs: [artifactId] }));
  expectOk(`verify structural failure ${id}`, handleTaskCommand(kdb, 'kernel.task.verify', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
  }));
  check(`${id} returned to working`, queryTaskGet(kdb, id)?.status === 'working');
  check(`${id} emitted verification_failed`, queryReceiptList(kdb, { taskId: id }).some((r) => r.type === 'verification_failed'));
  check(`${id} never completed`, !queryReceiptList(kdb, { taskId: id }).some((r) => r.type === 'task_completed'));
}

makeWorkingTask('task_no_artifact');
expectReject('submit without artifact', handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task_no_artifact' }));
check('task_no_artifact stays working', queryTaskGet(kdb, 'task_no_artifact')?.status === 'working');

makeWorkingTask('task_outside_root');
const outside = createArtifact('task_outside_root', '../outside-root.txt', null);
assertStructuralFailure('task_outside_root', outside);

makeWorkingTask('task_missing_file');
const missing = createArtifact('task_missing_file', 'missing.txt', null);
assertStructuralFailure('task_missing_file', missing);

makeWorkingTask('task_empty_file');
const empty = createArtifact('task_empty_file', 'empty.txt', '');
assertStructuralFailure('task_empty_file', empty);

makeWorkingTask('task_hash_mismatch');
const mismatch = createArtifact('task_hash_mismatch', 'mismatch.txt', 'actual', createHash('sha256').update('expected').digest('hex'));
assertStructuralFailure('task_hash_mismatch', mismatch);

makeWorkingTask('task_self_verify');
const selfArtifact = createArtifact('task_self_verify', 'self.txt', 'self');
expectOk('submit self verify task', handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task_self_verify', artifactRefs: [selfArtifact] }));
expectReject('self-verification blocked', handleTaskCommand(kdb, 'kernel.task.verify', {
  taskId: 'task_self_verify',
  verifierWorkerId: queryTaskGet(kdb, 'task_self_verify')?.ownerWorkerId,
  verdict: 'pass',
  artifactRoot,
}));
check('self-verify task remains submitted', queryTaskGet(kdb, 'task_self_verify')?.status === 'submitted');

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
