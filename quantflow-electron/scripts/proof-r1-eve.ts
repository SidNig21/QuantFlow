/**
 * R1 PRODUCT PROOF — real Eve worker via eve-harness (NOT CI-safe).
 *
 * Drives the SAME canonical orchestration path the live app uses
 * (createConductorActions -> assign_task deliver:true -> harness.send ->
 * collectReceipts -> kernel.artifact.create -> kernel.task.submit -> structural
 * verify), but against the real local quantflow-eve agent instead of the mock.
 *
 * Prerequisites:
 *   - quantflow-eve running (`npm run dev`) at QF_EVE_BASE_URL (default :3000),
 *     freshly restarted so the write_task_artifact tool + instructions are live.
 *   - QF_EVE_WORKSPACE set (in THIS process) to the same host dir Eve writes to
 *     via write_task_artifact (e.g. C:/Users/rybow/quantflow-eve/qf-artifacts).
 *
 * Run:
 *   cd quantflow-electron
 *   QF_EVE_WORKSPACE=C:/Users/rybow/quantflow-eve/qf-artifacts \
 *   QF_EVE_BASE_URL=http://127.0.0.1:3000 \
 *   bun scripts/proof-r1-eve.ts
 *
 * Spends OpenCode Go tokens (one real Eve turn). Capture the PROOF block it
 * prints for the §5 product-proof bundle.
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createEveHarness } from '../../src/harness/eve/index';

const baseUrl = process.env.QF_EVE_BASE_URL ?? 'http://127.0.0.1:3000';
const workspace = process.env.QF_EVE_WORKSPACE;
if (!workspace) {
  console.error('FATAL: set QF_EVE_WORKSPACE to the qf-artifacts host dir (same path Eve writes to).');
  process.exit(2);
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const m of ['001-v3-baseline.sql', '002-evaluations.sql', '003-r1-worker-task-binding.sql']) {
  db.exec(readFileSync(join(migrationsDir, m), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const now = Date.now();
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
   VALUES ('wf1', 'R1 Eve Proof', 'Prove one real task atom on Eve', 'active', ?, ?, ?)`,
).run(workspace, now, now);
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);

handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Eve Worker', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_w', workflowId: 'wf1', harnessKind: 'eve-harness', roleName: 'Researcher' });
handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_w', status: 'active' });
handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_v', workflowId: 'wf1', harnessKind: 'mock', roleName: 'Verifier' });
handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_v', status: 'active' });
const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v')!;

const eve = createEveHarness({ baseUrl, workspace });

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
    if (kind !== 'eve-harness') throw new Error(`proof drives eve-harness only, got: ${kind}`);
    return eve;
  },
});

console.log(`— R1 Eve product proof against ${baseUrl} (workspace ${workspace}) —`);

const created = handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task_eve',
  workflowId: 'wf1',
  correlationId: 'corr_eve',
  title: 'Write the R1 Eve proof note',
  objective: 'Produce a short markdown note (a few sentences) confirming the Eve worker executed this QuantFlow task, then save it as the deliverable.',
});
if (!created.ok) { console.error('create task failed:', created.error); process.exit(1); }

const delivered = await actions.runAction('assign_task', {
  taskId: 'task_eve',
  tileId: 'tile_w',
  deliver: true,
  harnessKind: 'eve-harness',
  operatorApproved: true,
  artifactRoot: workspace,
  attemptId: 'eve-attempt-1',
});
console.log('assign+deliver ->', JSON.stringify(delivered));
if (!delivered.ok) { console.error('\nPROOF NOT GREEN ❌  (delivery failed before verify)'); process.exit(1); }

const verified = await actions.runAction('verify_task', {
  taskId: 'task_eve',
  verifierWorkerId,
  verdict: 'pass',
  artifactRoot: workspace,
  attemptId: 'eve-attempt-1',
});
console.log('verify ->', JSON.stringify(verified));

const task = queryTaskGet(kdb, 'task_eve');
const chain = queryReceiptList(kdb, { taskId: 'task_eve' }).map((r) => r.type);
const byCorrelation = queryReceiptList(kdb, { correlationId: 'corr_eve' }).map((r) => r.type);
const artifacts = queryArtifactList(kdb, { taskId: 'task_eve' });
const ownerWorker = task?.ownerWorkerId ? queryWorkerGet(kdb, task.ownerWorkerId) : null;

console.log('\n=== R1 EVE PROOF CAPTURE (paste this; it contains no secrets) ===');
console.log('task status        :', task?.status);
console.log('owner_worker_id    :', task?.ownerWorkerId);
console.log('assigned_task_id   :', ownerWorker?.assignedTaskId);
console.log('eveSessionId       :', (delivered.data as Record<string, unknown> | undefined)?.['eveSessionId']);
console.log('receipt chain      :', chain.join(' -> '));
console.log('chain by corr_id   :', byCorrelation.join(' -> '));
console.log('artifact rows      :', JSON.stringify(
  artifacts.map((a) => ({ uri: a.uri, workflowId: a.workflowId, taskId: a.taskId, workerId: a.workerId, contentHash: a.contentHash })),
  null, 2,
));

const green = task?.status === 'complete'
  && chain.includes('artifact_created')
  && chain.includes('verification_passed')
  && chain.includes('task_completed');
console.log(`\n${green ? 'PROOF GREEN ✅ — R1 product proof captured' : 'PROOF NOT GREEN ❌ — see chain/errors above'}`);
process.exit(green ? 0 : 1);
