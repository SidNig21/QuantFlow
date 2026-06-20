/**
 * Conductor native actions smoke (Goal 5C).
 *
 * Proves the single-step, operator-triggered Conductor action surface is a thin
 * binding over Kernel authority, and that the full operator sequence works:
 * read → create_task → spawn_role (kernel.worker.spawn gate) → assign (claim+
 * start) → submit → verify (verification receipts → complete) → mark ready.
 * Also proves reject/block paths, connect_tiles, the no-raw-complete rule, and
 * that completion only happens via the verified path.
 *
 * Uses bun:sqlite + the canonical schema in memory. The action layer's dispatch
 * is injected to route to the DB-injected Kernel handlers.
 *
 * Run: bun scripts/conductor-actions-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleConnectionCommand } from '../../src/kernel/commands/connection-commands';
import { handleArtifactCommand, handleReceiptCommand, queryReceiptList } from '../../src/kernel/receipts/index';
import { handleConductorCommand, queryConductorContext } from '../../src/kernel/conductor/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { seedHarnessRegistry, queryWorkerForTile } from '../../src/kernel/worker-instances/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}`); }
}

const schemaPath = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations', '001-v3-baseline.sql');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(schemaPath, 'utf-8'));
const now = Date.now();
db.prepare(`INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Build loader','o','active',?,?)`).run(now, now);
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-conductor-actions-'));
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);

function createArtifact(taskId: string, uri: string, body: string): string {
  writeFileSync(join(artifactRoot, uri), body, 'utf-8');
  const result = handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf1',
    taskId,
    workerId: queryTaskGet(kdb, taskId)?.ownerWorkerId,
    kind: 'file',
    uri,
    summary: `proof for ${taskId}`,
  });
  check(`artifact ${taskId} ok`, result.ok === true);
  return result.id as string;
}

// Inject a dispatch that routes to the DB-injected Kernel handlers — exactly the
// command surface dispatchKernelCommand routes to in the live app. Record the
// command types so we can prove spawn_role does NOT dispatch worker.spawn itself.
const dispatched: string[] = [];
const dispatch = async (type: string, payload: Record<string, unknown>) => {
  dispatched.push(type);
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  if (type.startsWith('kernel.connection.')) return handleConnectionCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};

// Spy for the approved shell role-spawn path. In the live app this is
// canvas.roleSpawn → spawnRoleTileAt (which starts the runtime AND calls
// kernel.worker.spawn as the 6A gate). Rejection-prevents-runtime is proven by
// role-tile-spawn.test.ts; here we prove the action routes to this path.
const spawnRoleCalls: Record<string, unknown>[] = [];
const actions = createConductorActions(dispatch, {
  spawnRole: async (args) => {
    spawnRoleCalls.push(args);
    return { ok: true, data: { tileId: (args as { tileId?: string }).tileId ?? 'tile_w' } };
  },
});

// Setup: a worker tile and a distinct verifier tile (via Kernel tile.create).
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v');

console.log('— Conductor reads Kernel state —');
const ctx = queryConductorContext(kdb, { workflowId: 'wf1' });
check('context read (tiles present)', ctx.tiles.length === 2);

console.log('\n— operator-triggered native actions (one at a time) —');
const created = await actions.runAction('create_task', { id: 'task1', workflowId: 'wf1', title: 'Implement loader', objective: 'o' });
check('create_task ok', created.ok === true);
check('task is open', queryTaskGet(kdb, 'task1')?.status === 'open');

const spawned = await actions.runAction('spawn_role', { roleId: 'coder', tileId: 'tile_w', workflowId: 'wf1' });
check('spawn_role ok', spawned.ok === true);
check('spawn_role routes to approved shell role-spawn path', spawnRoleCalls.length === 1 && spawnRoleCalls[0]!['roleId'] === 'coder');
check('spawn_role forwards workflowId to the shell path', spawnRoleCalls[0]!['workflowId'] === 'wf1');
check('spawn_role does NOT dispatch kernel.worker.spawn directly', !dispatched.includes('kernel.worker.spawn'));

const assigned = await actions.runAction('assign_task', { taskId: 'task1', tileId: 'tile_w' });
check('assign_task ok (claim+start)', assigned.ok === true);
check('task is working after assign', queryTaskGet(kdb, 'task1')?.status === 'working');
check('owner is tile_w worker', queryTaskGet(kdb, 'task1')?.ownerWorkerId === queryWorkerForTile(kdb, 'tile_w'));

const artifact1 = createArtifact('task1', 'task1-proof.md', 'done');
const submitted = await actions.runAction('submit_task', { taskId: 'task1', summary: 'done', artifactRefs: [artifact1] });
check('submit_task ok', submitted.ok === true);
check('task is submitted', queryTaskGet(kdb, 'task1')?.status === 'submitted');

const verified = await actions.runAction('verify_task', { taskId: 'task1', verifierWorkerId, verdict: 'pass', artifactRoot });
check('verify_task ok', verified.ok === true);
check('task complete via verified path', queryTaskGet(kdb, 'task1')?.status === 'complete');

const chain = queryReceiptList(kdb, { taskId: 'task1' }).map((r) => r.type);
check(
  'receipt chain is the verified lifecycle',
  JSON.stringify(chain) === JSON.stringify([
    'task_created', 'task_claimed', 'task_started', 'artifact_created', 'task_submitted',
    'verification_started', 'verification_passed', 'task_completed',
  ]),
);

console.log('\n— mark the step ready for next action (planning receipt) —');
const ready = await dispatch('kernel.conductor.plan', { workflowId: 'wf1', summary: 'Step complete; ready for next' });
check('planning receipt posted', ready.ok === true);

console.log('\n— connect_tiles binds to kernel.connection.create —');
const connected = await actions.runAction('connect_tiles', { tileAId: 'tile_w', tileBId: 'tile_v', label: 'verification' });
check('connect_tiles ok', connected.ok === true);

console.log('\n— reject path returns a task to working —');
await actions.runAction('create_task', { id: 'task2', workflowId: 'wf1', title: 'T2', objective: 'o' });
await actions.runAction('assign_task', { taskId: 'task2', tileId: 'tile_w' });
const artifact2 = createArtifact('task2', 'task2-proof.md', 'redo');
await actions.runAction('submit_task', { taskId: 'task2', artifactRefs: [artifact2] });
const rejected = await actions.runAction('reject_task', { taskId: 'task2', verifierWorkerId, reason: 'redo' });
check('reject_task ok', rejected.ok === true);
check('task2 back to working', queryTaskGet(kdb, 'task2')?.status === 'working');
check('verification_failed receipt present', queryReceiptList(kdb, { taskId: 'task2' }).some((r) => r.type === 'verification_failed'));

console.log('\n— block path —');
const blocked = await actions.runAction('block_task', { taskId: 'task2', reason: 'waiting' });
check('block_task ok', blocked.ok === true);
check('task2 blocked', queryTaskGet(kdb, 'task2')?.status === 'blocked');

console.log('\n— guards: no raw complete tool; unknown action; spawn needs shell binding —');
check('complete_task is not an exposed action', (await actions.runAction('complete_task', { taskId: 'task1' })).ok === false);
check('unknown action rejected', (await actions.runAction('nonsense', {})).ok === false);
const noShell = createConductorActions(dispatch);
check('spawn_role without shell role-spawn binding is rejected', (await noShell.runAction('spawn_role', { roleId: 'coder' })).ok === false);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
