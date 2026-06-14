/**
 * State Card watcher + projection smoke (Goal 4).
 *
 * Proves State Cards are Kernel-owned truth maintained by the watcher from
 * task/receipt/tile events (not raw logs), and that the renderer projector
 * (formatStateCard) turns a snapshot into the canonical sections.
 *
 * Uses bun:sqlite + the canonical schema in memory. The watcher registers on
 * the in-process Kernel event bus; the task/tile handlers emit on that same
 * bus, so driving the lifecycle drives the State Card.
 *
 * Run: bun scripts/state-card-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { handleArtifactCommand } from '../../src/kernel/receipts/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { queryStateCardGet, queryStateCardList } from '../../src/kernel/state-cards/index';
import { formatStateCard, STATE_CARD_SECTION_LABELS } from '../../src/renderer/components/StateCardView/state-card-view';

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
db.prepare(`INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at) VALUES ('tile1','wf1','Worker','worker',?,?)`).run(now, now);
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at) VALUES ('w_owner','tile1','wf1','active',?,?)`).run(now, now);
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at) VALUES ('w_verifier','tile1','wf1','active',?,?)`).run(now, now);

// deno-lint-ignore no-explicit-any
const kdb = db as any;
startStateCardWatcher(kdb);

console.log('— tile.created seeds an idle State Card —');
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_seed', workflowId: 'wf1', displayName: 'seed', tileKind: 'worker' });
const seed = queryStateCardGet(kdb, 'tile_seed');
check('seed card exists', seed != null);
check('seed card idle', seed?.status === 'idle');
check('seed card promoted update', seed?.lastMeaningfulUpdate === 'Tile created');

console.log('\n— task lifecycle promotes State Card on the owner tile —');
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task1', workflowId: 'wf1', title: 'Build loader', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', ownerWorkerId: 'w_owner' });
let card = queryStateCardGet(kdb, 'tile1');
check('card created on claim', card != null);
check('current task set', card?.currentTaskId === 'task1');

handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' });
card = queryStateCardGet(kdb, 'tile1');
check('status active while working', card?.status === 'active');
check('next action promoted', card?.nextAction === 'Work in progress');

handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task1', summary: 'done' });
card = queryStateCardGet(kdb, 'tile1');
check('submit promoted (no raw logs)', card?.lastMeaningfulUpdate === 'Result submitted');

handleArtifactCommand(kdb, 'kernel.artifact.create', { taskId: 'task1', workflowId: 'wf1', workerId: 'w_owner', kind: 'file', uri: 'proof.md', summary: 'proof' });
card = queryStateCardGet(kdb, 'tile1');
check('artifact promoted into card', Array.isArray(card?.artifacts) && card!.artifacts.length === 1);
check('last receipt id set', card?.lastReceiptId != null);

handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task1', verifierWorkerId: 'w_verifier', verdict: 'pass' });
card = queryStateCardGet(kdb, 'tile1');
check('status complete after verify pass', card?.status === 'complete');
check('next action cleared on complete', card?.nextAction === '—');

console.log('  meaningful-update value:', JSON.stringify(card?.lastMeaningfulUpdate));
check(
  'last meaningful update is short promoted text, not a log dump',
  typeof card?.lastMeaningfulUpdate === 'string' &&
    !card!.lastMeaningfulUpdate!.includes('\n') &&
    card!.lastMeaningfulUpdate!.length < 120,
);

console.log('\n— blocked promotes a blocker —');
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task2', workflowId: 'wf1', title: 'T2', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task2', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task2' });
handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task2', reason: 'waiting on upstream' });
card = queryStateCardGet(kdb, 'tile1');
check('status blocked', card?.status === 'blocked');
check('blocker promoted', card?.blocker === 'waiting on upstream');

console.log('\n— state_card.list returns cards —');
check('list has both tiles', queryStateCardList(kdb, {}).length === 2);

console.log('\n— renderer projector (formatStateCard) —');
const sections = formatStateCard(queryStateCardGet(kdb, 'tile1'));
check('eight canonical sections in order',
  sections.length === 8 &&
  sections.every((s, i) => s.label === STATE_CARD_SECTION_LABELS[i]));
check('null snapshot still yields stable sections', formatStateCard(null).length === 8);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
