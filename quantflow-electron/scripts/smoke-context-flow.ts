/**
 * smoke:context-flow (R2) — Task A verified, Task B receives a ContextEnvelope
 * via harness.send, and Task B's artifact records derived_from lineage.
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setKernelDbForTesting } from '../../src/kernel/database';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList } from '../../src/kernel/receipts/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { buildContextEnvelope } from '../../src/kernel/context/envelope';
import { queryUpstreamArtifacts } from '../../src/kernel/queries/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createMockHarness } from '../../src/harness/mock/index';

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
  '007-r7-typed-artifacts.sql',
  '008-d0-tile-extensions.sql',
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
setKernelDbForTesting(kdb);

const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-context-flow-'));
const now = Date.now();
db.prepare(
  `INSERT INTO workflows
     (id, name, objective, status, mode, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R2 Context Flow', 'Prove context envelope handoff', 'active', 'research', ?, ?, ?)`,
).run(artifactRoot, now, now);
seedHarnessRegistry(kdb);

expectOk('create worker tile', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile_w',
  workflowId: 'wf1',
  displayName: 'Worker',
  tileKind: 'worker',
}));
expectOk('create verifier tile', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile_v',
  workflowId: 'wf1',
  displayName: 'Verifier',
  tileKind: 'worker',
}));
expectOk('spawn worker', handleWorkerCommand(kdb, 'kernel.worker.spawn', {
  tileId: 'tile_w',
  workflowId: 'wf1',
  harnessKind: 'mock',
  roleName: 'Coder',
}));
expectOk('worker active', handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_w', status: 'active' }));
expectOk('spawn verifier', handleWorkerCommand(kdb, 'kernel.worker.spawn', {
  tileId: 'tile_v',
  workflowId: 'wf1',
  harnessKind: 'mock',
  roleName: 'Verifier',
}));
expectOk('verifier active', handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_v', status: 'active' }));
const workerId = queryWorkerForTile(kdb, 'tile_w')!;
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
  getWorker: (id) => queryWorkerGet(kdb, id),
  getWorkerHarness: (kind) => {
    if (kind !== 'mock') throw new Error(`unexpected harness in smoke: ${kind}`);
    return mock;
  },
});

async function runMockTask(id: string, title: string): Promise<string> {
  expectOk(`create ${id}`, handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr_${id}`,
    title,
    objective: `${title} objective`,
  }));
  const delivered = await actions.runAction('assign_task', {
    taskId: id,
    tileId: 'tile_w',
    deliver: true,
    harnessKind: 'mock',
    artifactRoot,
    attemptId: `att-${id}`,
  });
  expectOk(`assign ${id}`, delivered);
  const artifacts = queryArtifactList(kdb, { taskId: id });
  check(`${id} produced one artifact`, artifacts.length === 1);
  const verified = await actions.runAction('verify_task', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
    attemptId: `att-${id}`,
  });
  expectOk(`verify ${id}`, verified);
  check(`${id} complete`, queryTaskGet(kdb, id)?.status === 'complete');
  return artifacts[0]!.id;
}

function createVerifiedSensitiveTask(): string {
  const id = 'task_sensitive';
  expectOk('create sensitive task', handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr_${id}`,
    title: 'Sensitive upstream',
    objective: 'Sensitive upstream objective',
  }));
  expectOk('claim sensitive task', handleTaskCommand(kdb, 'kernel.task.claim', { taskId: id, ownerWorkerId: workerId }));
  expectOk('start sensitive task', handleTaskCommand(kdb, 'kernel.task.start', { taskId: id }));
  const body = 'SENSITIVE BODY SHOULD NOT ENTER ENVELOPE';
  const fileName = `${id}.txt`;
  writeFileSync(join(artifactRoot, fileName), body, 'utf-8');
  const artifactId = expectOk('create sensitive artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf1',
    taskId: id,
    workerId,
    kind: 'file',
    uri: fileName,
    summary: 'sensitive artifact',
    contentHash: createHash('sha256').update(body).digest('hex'),
    mediaType: 'text/plain',
    sizeBytes: Buffer.byteLength(body),
    metadata: { sensitivity: 'restricted' },
  }));
  expectOk('submit sensitive task', handleTaskCommand(kdb, 'kernel.task.submit', { taskId: id, artifactRefs: [artifactId] }));
  expectOk('verify sensitive task', handleTaskCommand(kdb, 'kernel.task.verify', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
  }));
  return artifactId;
}

function createVerifiedColumnSensitiveTask(): string {
  const id = 'task_sensitive_column';
  expectOk('create column-sensitive task', handleTaskCommand(kdb, 'kernel.task.create', {
    id,
    workflowId: 'wf1',
    correlationId: `corr_${id}`,
    title: 'Column-sensitive upstream',
    objective: 'Column-sensitive upstream objective',
  }));
  expectOk('claim column-sensitive task', handleTaskCommand(kdb, 'kernel.task.claim', { taskId: id, ownerWorkerId: workerId }));
  expectOk('start column-sensitive task', handleTaskCommand(kdb, 'kernel.task.start', { taskId: id }));
  const body = 'COLUMN SENSITIVE BODY';
  const fileName = `${id}.txt`;
  writeFileSync(join(artifactRoot, fileName), body, 'utf-8');
  const artifactId = expectOk('create column-sensitive artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf1',
    taskId: id,
    workerId,
    kind: 'file',
    uri: fileName,
    summary: 'column sensitive artifact',
    contentHash: createHash('sha256').update(body).digest('hex'),
    mediaType: 'text/plain',
    sizeBytes: Buffer.byteLength(body),
    sensitivity: 'restricted',
    metadata: {},
  }));
  expectOk('submit column-sensitive task', handleTaskCommand(kdb, 'kernel.task.submit', { taskId: id, artifactRefs: [artifactId] }));
  expectOk('verify column-sensitive task', handleTaskCommand(kdb, 'kernel.task.verify', {
    taskId: id,
    verifierWorkerId,
    verdict: 'pass',
    artifactRoot,
  }));
  return artifactId;
}

console.log('— Task A: mock artifact is structurally verified —');
const taskAArtifactId = await runMockTask('task_a', 'Task A');

console.log('\n— Negative upstreams: unverified and sensitive do not enter the envelope —');
expectOk('create unverified upstream', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_unverified',
  workflowId: 'wf1',
  correlationId: 'corr_task_unverified',
  title: 'Unverified upstream',
  objective: 'Unverified upstream objective',
}));
const sensitiveArtifactId = createVerifiedSensitiveTask();
const columnSensitiveArtifactId = createVerifiedColumnSensitiveTask();
expectOk('create task_b_meta', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_b_meta',
  workflowId: 'wf1',
  correlationId: 'corr_task_b_meta',
  title: 'Task B meta filter',
  objective: 'Filter sensitive upstreams.',
  metadata: {},
}));
expectOk('context_from Bmeta<-column-sensitive', handleTaskCommand(kdb, 'kernel.task.depend', {
  taskId: 'task_b_meta',
  dependsOnTaskId: 'task_sensitive_column',
  kind: 'context_from',
}));
const columnFiltered = queryUpstreamArtifacts('task_b_meta');
check('column sensitivity excluded by default', !columnFiltered.some((a) => a.artifactId === columnSensitiveArtifactId));
check('column sensitivity included with includeSensitive', queryUpstreamArtifacts('task_b_meta', { includeSensitive: true })
  .some((a) => a.artifactId === columnSensitiveArtifactId));

console.log('\n— Task B: assign delivers envelope and records artifact lineage —');
expectOk('create task_b', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_b',
  workflowId: 'wf1',
  correlationId: 'corr_task_b',
  title: 'Task B',
  objective: 'Use verified context references from Task A.',
}));
expectOk('context_from B<-A', handleTaskCommand(kdb, 'kernel.task.depend', {
  taskId: 'task_b',
  dependsOnTaskId: 'task_a',
  kind: 'context_from',
}));
expectOk('context_from B<-unverified', handleTaskCommand(kdb, 'kernel.task.depend', {
  taskId: 'task_b',
  dependsOnTaskId: 'task_unverified',
  kind: 'context_from',
}));
expectOk('context_from B<-sensitive', handleTaskCommand(kdb, 'kernel.task.depend', {
  taskId: 'task_b',
  dependsOnTaskId: 'task_sensitive',
  kind: 'context_from',
}));

const beforeProjection = {
  receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n,
  artifacts: (db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n,
  commands: (db.prepare('SELECT COUNT(*) AS n FROM commands').get() as { n: number }).n,
};
const projected = buildContextEnvelope('task_b');
const afterProjection = {
  receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n,
  artifacts: (db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n,
  commands: (db.prepare('SELECT COUNT(*) AS n FROM commands').get() as { n: number }).n,
};
check('building envelope does not mutate Kernel rows', JSON.stringify(afterProjection) === JSON.stringify(beforeProjection));
check('projection includes verified Task A artifact', projected.upstream_artifacts.some((a) =>
  a.artifact_id === taskAArtifactId
  && a.produced_by_task === 'task_a'
  && a.verification_status === 'verified'
  && typeof a.uri === 'string'));
check('projection excludes unverified upstream', !projected.upstream_artifacts.some((a) => a.produced_by_task === 'task_unverified'));
check('projection excludes sensitive upstream', !projected.upstream_artifacts.some((a) => a.artifact_id === sensitiveArtifactId));
check('projection has instrumentation', projected.instrumentation.context_tokens_estimate > 0 && projected.instrumentation.raw_receipt_count > 0);

const bDelivered = await actions.runAction('assign_task', {
  taskId: 'task_b',
  tileId: 'tile_w',
  deliver: true,
  harnessKind: 'mock',
  artifactRoot,
  attemptId: 'att-task_b',
});
expectOk('assign task_b', bDelivered);
const bSend = mock.getRecordedSends().find((send) => send.taskId === 'task_b');
check('mock send received an envelope object', Boolean(bSend && bSend.contextEnvelope && typeof bSend.contextEnvelope === 'object'));
const sentEnvelope = bSend?.contextEnvelope as ReturnType<typeof buildContextEnvelope> | null | undefined;
check('send envelope carries Task A artifact reference', Boolean(sentEnvelope?.upstream_artifacts.some((a) => a.artifact_id === taskAArtifactId)));
check('send envelope does not copy artifact content', !JSON.stringify(sentEnvelope).includes('QuantFlow mock harness artifact'));
const taskBArtifacts = queryArtifactList(kdb, { taskId: 'task_b' });
check('task_b produced one artifact', taskBArtifacts.length === 1);
check('task_b artifact derived_from = [task_a artifact]', JSON.stringify(taskBArtifacts[0]?.derivedFrom) === JSON.stringify([taskAArtifactId]));

setKernelDbForTesting(null);
console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
