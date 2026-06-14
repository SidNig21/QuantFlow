/**
 * Worker reconciliation + minimal harness registry smoke (Goal 6A).
 *
 * Proves the Kernel is the authoritative worker identity/status owner:
 *  - harness registry (local-shell, herdr-shell) + default model are seeded.
 *  - tile.create yields exactly one default worker row (harness/model populated).
 *  - kernel.worker.spawn establishes role/harness/model + status 'spawning'.
 *  - kernel.worker.status_update records runtime ids (herdr_pane_id/envoy_space_id)
 *    and status; the State Card reflects Kernel-owned worker status (watcher).
 *  - a task claimed by tile maps to that same worker row.
 *  - kernel.worker.stop marks the worker stopped.
 *  - no manual pre-seeding of worker_instances.
 *
 * Uses bun:sqlite + the canonical schema in memory (DB-injected handlers).
 *
 * Run: bun scripts/worker-harness-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { queryStateCardGet } from '../../src/kernel/state-cards/index';
import {
  seedHarnessRegistry,
  queryWorkerForTile,
  queryWorkerGet,
  queryWorkerList,
} from '../../src/kernel/worker-instances/index';

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
db.prepare(`INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Smoke','o','active',?,?)`).run(now, now);
// deno-lint-ignore no-explicit-any
const kdb = db as any;

console.log('— harness registry seed (idempotent) —');
seedHarnessRegistry(kdb);
seedHarnessRegistry(kdb); // idempotent
startStateCardWatcher(kdb);
const harnessCount = (db.prepare('SELECT COUNT(*) AS n FROM harnesses').get() as { n: number }).n;
check('two harnesses seeded', harnessCount === 2);
check('local-shell harness present', !!db.prepare("SELECT id FROM harnesses WHERE kind='local-shell'").get());
check('herdr-shell harness present', !!db.prepare("SELECT id FROM harnesses WHERE kind='herdr-shell'").get());
check('default model seeded', !!db.prepare("SELECT id FROM models WHERE id='model-local-default'").get());

console.log('\n— tile.create yields one default worker (harness/model populated) —');
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile1', workflowId: 'wf1', displayName: 'Codex', tileKind: 'worker' });
const defaultWorkerId = queryWorkerForTile(kdb, 'tile1');
check('default worker exists', defaultWorkerId != null);
let worker = queryWorkerGet(kdb, defaultWorkerId!);
check('default harness = local-shell', worker?.harnessId === 'harness-local-shell');
check('default model populated', worker?.modelId === 'model-local-default');
check('exactly one worker row for tile1', queryWorkerList(kdb, { workflowId: 'wf1' }).length === 1);

console.log('\n— kernel.worker.spawn establishes role/harness/model + spawning —');
const spawn = handleWorkerCommand(kdb, 'kernel.worker.spawn', {
  tileId: 'tile1',
  workflowId: 'wf1',
  roleName: 'Codex',
  runtimeTarget: 'herdr-wsl',
});
check('spawn ok', spawn.ok === true);
check('spawn reused the same worker row', spawn.id === defaultWorkerId);
check('still exactly one worker row', queryWorkerList(kdb, { workflowId: 'wf1' }).length === 1);
worker = queryWorkerGet(kdb, defaultWorkerId!);
check('role populated', worker?.roleId === 'role-codex');
check('harness upgraded to herdr-shell', worker?.harnessId === 'harness-herdr-shell');
check('status is spawning', worker?.status === 'spawning');

console.log('\n— kernel.worker.status_update records runtime ids + status —');
handleWorkerCommand(kdb, 'kernel.worker.status_update', {
  tileId: 'tile1',
  status: 'active',
  herdrPaneId: 'pane-1',
  envoySpaceId: 'space-1',
});
worker = queryWorkerGet(kdb, defaultWorkerId!);
check('status active', worker?.status === 'active');
check('herdr_pane_id recorded', worker?.herdrPaneId === 'pane-1');
check('envoy_space_id recorded', worker?.envoySpaceId === 'space-1');
check('State Card reflects Kernel worker status (active)', queryStateCardGet(kdb, 'tile1')?.status === 'active');

console.log('\n— task claimed by tile maps to the same worker row —');
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task1', workflowId: 'wf1', title: 'T', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', tileId: 'tile1' });
const ownerRow = db.prepare("SELECT owner_worker_id AS w FROM tasks WHERE id='task1'").get() as { w: string };
check('task owner worker == tile worker', ownerRow.w === defaultWorkerId);

console.log('\n— kernel.worker.stop marks stopped; State Card idle —');
handleWorkerCommand(kdb, 'kernel.worker.stop', { tileId: 'tile1' });
check('status stopped', queryWorkerGet(kdb, defaultWorkerId!)?.status === 'stopped');
check('State Card idle after stop', queryStateCardGet(kdb, 'tile1')?.status === 'idle');

console.log('\n— queries —');
check('worker list returns the worker', queryWorkerList(kdb, {}).some((w) => w.id === defaultWorkerId));
check('worker get returns it', queryWorkerGet(kdb, defaultWorkerId!)?.tileId === 'tile1');

console.log('\n— guards —');
check('status_update on unknown tile rejected', handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'nope', status: 'active' }).ok === false);
check('spawn without tileId rejected', handleWorkerCommand(kdb, 'kernel.worker.spawn', {}).ok === false);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
