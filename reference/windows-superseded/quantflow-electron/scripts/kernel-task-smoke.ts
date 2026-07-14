/**
 * Kernel Task State Machine smoke (Goal 3).
 *
 * Drives the authoritative v3 Kernel task lifecycle end-to-end against an
 * in-memory SQLite database built from the canonical baseline schema, and
 * asserts the acceptance criteria:
 *
 *   create → claim → start (working) → submit → attach artifact receipt
 *   → verify (begin) → verification_passed → complete; receipt chain visible.
 *
 * It also asserts the hard rule: a worker cannot self-complete from `working`
 * without the submitted/verifying gates and a verification receipt, and that
 * self-verification is refused — while the documented legacy bypass works.
 *
 * Uses bun:sqlite so it runs without the Electron-built native module. The
 * Kernel task/receipt handlers take an injected db and only import their
 * database module as a type, so no Vite-only (?raw) import is pulled in.
 *
 * Run: bun scripts/kernel-task-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, queryReceiptList } from '../../src/kernel/receipts/index';
import { canTransition, assertTransition } from '../../src/kernel/tasks/state-machine';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function expectOk(label: string, result: { ok: boolean; error?: string }): void {
  check(`${label} (ok)`, result.ok === true);
  if (!result.ok) console.error(`        error: ${result.error}`);
}

function expectReject(label: string, result: { ok: boolean; error?: string }): void {
  check(`${label} (rejected)`, result.ok === false);
  if (result.ok) console.error(`        unexpectedly accepted`);
}

// ---------------------------------------------------------------------------
// Build the Kernel schema in memory.
// ---------------------------------------------------------------------------

const schemaPath = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations', '001-v3-baseline.sql');
const schemaSql = readFileSync(schemaPath, 'utf-8');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(schemaSql);

// Seed the minimal graph the lifecycle references (FKs are ON).
const now = Date.now();
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, created_at, updated_at)
   VALUES ('wf1', 'Smoke', 'Goal 3 lifecycle', 'active', ?, ?)`,
).run(now, now);
db.prepare(
  `INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at)
   VALUES ('tile1', 'wf1', 'Worker tile', 'worker', ?, ?)`,
).run(now, now);
db.prepare(
  `INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
   VALUES ('w_owner', 'tile1', 'wf1', 'active', ?, ?)`,
).run(now, now);
db.prepare(
  `INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
   VALUES ('w_verifier', 'tile1', 'wf1', 'active', ?, ?)`,
).run(now, now);

// Cast to the better-sqlite3 KernelDB shape the handlers expect; the prepare/
// get/all/run/exec surface is compatible.
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-kernel-task-smoke-'));

function createArtifact(taskId: string, uri: string, body: string): string {
  const path = join(artifactRoot, uri);
  writeFileSync(path, body, 'utf-8');
  const result = handleArtifactCommand(kdb, 'kernel.artifact.create', {
    taskId,
    workflowId: 'wf1',
    workerId: 'w_owner',
    kind: 'file',
    uri,
    summary: `proof for ${taskId}`,
  });
  expectOk(`artifact ${taskId}`, result);
  return result.id as string;
}

console.log('— state-machine unit checks —');
check('open→claimed allowed', canTransition('open', 'claimed'));
check('working→complete forbidden', !canTransition('working', 'complete'));
check('verifying→complete allowed', canTransition('verifying', 'complete'));
check('complete is terminal', assertTransition('complete', 'failed').ok === false);

console.log('\n— happy path: create → claim → start → submit → artifact → verify → complete —');
const created = handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task1',
  workflowId: 'wf1',
  title: 'Build replay loader',
  objective: 'Implement and prove the loader',
});
expectOk('create', created);
check('status open', queryTaskGet(kdb, 'task1')?.status === 'open');

expectOk('claim', handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', ownerWorkerId: 'w_owner' }));
check('status claimed', queryTaskGet(kdb, 'task1')?.status === 'claimed');

expectOk('start', handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' }));
check('status working', queryTaskGet(kdb, 'task1')?.status === 'working');

// Hard rule: cannot self-complete from working.
expectReject(
  'complete-from-working blocked',
  handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task1' }),
);
check('still working after blocked complete', queryTaskGet(kdb, 'task1')?.status === 'working');

const artifact1 = createArtifact('task1', 'proof.md', 'proof body');
expectOk('submit', handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task1', summary: 'done', artifactRefs: [artifact1] }));
check('status submitted', queryTaskGet(kdb, 'task1')?.status === 'submitted');

// Self-verification refused.
expectReject(
  'self-verify blocked',
  handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task1', verifierWorkerId: 'w_owner' }),
);

// Distinct verifier passes → completes.
expectOk(
  'verify pass',
  handleTaskCommand(kdb, 'kernel.task.verify', {
    taskId: 'task1',
    verifierWorkerId: 'w_verifier',
    verdict: 'pass',
    artifactRoot,
  }),
);
const t1 = queryTaskGet(kdb, 'task1');
check('status complete', t1?.status === 'complete');
check('verified_at set', t1?.verifiedAt != null);
check('completed_at set', t1?.completedAt != null);

const chain = queryReceiptList(kdb, { taskId: 'task1' }).map((r) => r.type);
console.log('  receipt chain:', chain.join(' → '));
const expectedChain = [
  'task_created',
  'task_claimed',
  'task_started',
  'artifact_created',
  'task_submitted',
  'verification_started',
  'verification_passed',
  'task_completed',
];
check(
  'receipt chain matches verified lifecycle',
  JSON.stringify(chain) === JSON.stringify(expectedChain),
);

console.log('\n— reject path: submit → reject → working → resubmit → verify —');
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task2', workflowId: 'wf1', title: 'T2', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task2', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task2' });
const artifact2 = createArtifact('task2', 'proof-task2.md', 'redo body');
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task2', artifactRefs: [artifact2] });
expectOk(
  'reject',
  handleTaskCommand(kdb, 'kernel.task.reject', { taskId: 'task2', verifierWorkerId: 'w_verifier', reason: 'redo' }),
);
check('back to working after reject', queryTaskGet(kdb, 'task2')?.status === 'working');
const chain2 = queryReceiptList(kdb, { taskId: 'task2' }).map((r) => r.type);
check('reject posts verification_failed', chain2.includes('verification_failed'));

console.log('\n— legacy bypass is lifecycle-scoped (working/submitted/verifying only) —');

// open → legacy complete must be rejected.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_open', workflowId: 'wf1', title: 'open', objective: 'o' });
expectReject(
  'legacy from open blocked',
  handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task_open', legacy: true }),
);
check('open stays open', queryTaskGet(kdb, 'task_open')?.status === 'open');

// claimed → legacy complete must be rejected.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_claimed', workflowId: 'wf1', title: 'claimed', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_claimed', ownerWorkerId: 'w_owner' });
expectReject(
  'legacy from claimed blocked',
  handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task_claimed', legacy: true }),
);
check('claimed stays claimed', queryTaskGet(kdb, 'task_claimed')?.status === 'claimed');

// blocked → legacy complete must be rejected.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_blocked', workflowId: 'wf1', title: 'blocked', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_blocked', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_blocked' });
handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task_blocked', reason: 'waiting' });
check('blocked is blocked', queryTaskGet(kdb, 'task_blocked')?.status === 'blocked');
expectReject(
  'legacy from blocked blocked',
  handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task_blocked', legacy: true }),
);
check('blocked stays blocked', queryTaskGet(kdb, 'task_blocked')?.status === 'blocked');

// working → legacy complete still passes and stays tagged.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task3', workflowId: 'wf1', title: 'T3', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task3', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task3' });
expectOk(
  'legacy complete from working',
  handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task3', legacy: true }),
);
check('legacy task complete', queryTaskGet(kdb, 'task3')?.status === 'complete');
const t3receipts = queryReceiptList(kdb, { taskId: 'task3' });
const legacyReceipt = t3receipts.find((r) => r.type === 'task_completed');
check('legacy completion tagged in receipt', legacyReceipt?.metadata?.['legacy'] === true);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
