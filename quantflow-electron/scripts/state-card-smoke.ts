/**
 * State Card watcher + projection smoke (Goal 4).
 *
 * Proves State Cards are Kernel-owned truth maintained by the watcher from
 * task/receipt/tile events (not raw logs), and that the renderer projector
 * (formatStateCard) turns a snapshot into the canonical sections.
 *
 * Live-ish path: it does NOT pre-seed the owning worker_instances row. Tiles are
 * created via kernel.tile.create (which ensures a default WorkerInstance), and
 * tasks are claimed by tileId so the Kernel derives the owner worker — exactly
 * what the running app does. This catches the "works in proof, not on the real
 * canvas" gap.
 *
 * Uses bun:sqlite + the canonical schema in memory.
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
import { queryWorkerForTile } from '../../src/kernel/worker-instances/index';
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

// Only a workflow is seeded. NO tiles, NO worker_instances — those come from
// the Kernel tile-create path, like the live app.
const now = Date.now();
db.prepare(`INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Smoke','o','active',?,?)`).run(now, now);

// deno-lint-ignore no-explicit-any
const kdb = db as any;
startStateCardWatcher(kdb);

console.log('— tile.create seeds an idle State Card + a default WorkerInstance —');
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_seed', workflowId: 'wf1', displayName: 'seed', tileKind: 'worker' });
const seed = queryStateCardGet(kdb, 'tile_seed');
check('seed card exists', seed != null);
check('seed card idle', seed?.status === 'idle');
check('seed card promoted update', seed?.lastMeaningfulUpdate === 'Tile created');
check('default worker instance created for tile', queryWorkerForTile(kdb, 'tile_seed') != null);

console.log('\n— live-ish: spawn tiles, claim task by tileId (no pre-seeded owner) —');
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile1', workflowId: 'wf1', displayName: 'Worker', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v');
check('verifier worker derived from its tile', verifierWorkerId != null);

handleTaskCommand(kdb, 'kernel.task.create', { id: 'task1', workflowId: 'wf1', title: 'Build loader', objective: 'o' });
// Claim by tileId only — Kernel derives/ensures the owner worker for tile1.
const claim = handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', tileId: 'tile1' });
check('claim by tileId ok', claim.ok === true);

let card = queryStateCardGet(kdb, 'tile1');
check('card shows current task after claim (no manual worker seed)', card?.currentTaskId === 'task1');

handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' });
card = queryStateCardGet(kdb, 'tile1');
check('status active while working', card?.status === 'active');
check('next action promoted', card?.nextAction === 'Work in progress');

handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task1', reason: 'waiting on upstream' });
card = queryStateCardGet(kdb, 'tile1');
check('status blocked', card?.status === 'blocked');
check('blocker promoted', card?.blocker === 'waiting on upstream');

console.log('\n— resume → submit → artifact → verify (derived verifier worker) —');
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' }); // blocked → working
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task1', summary: 'done' });
card = queryStateCardGet(kdb, 'tile1');
check('submit promoted (no raw logs)', card?.lastMeaningfulUpdate === 'Result submitted');

handleArtifactCommand(kdb, 'kernel.artifact.create', { taskId: 'task1', workflowId: 'wf1', kind: 'file', uri: 'proof.md', summary: 'proof' });
card = queryStateCardGet(kdb, 'tile1');
check('artifact promoted into card', Array.isArray(card?.artifacts) && card!.artifacts.length === 1);
check('last receipt id set', card?.lastReceiptId != null);

handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task1', verifierWorkerId, verdict: 'pass' });
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

console.log('\n— state_card.list returns the tiles —');
check('list has all created tiles', queryStateCardList(kdb, {}).length === 3);

console.log('\n— renderer projector (formatStateCard) —');
const sections = formatStateCard(queryStateCardGet(kdb, 'tile1'));
check('eight canonical sections in order',
  sections.length === 8 &&
  sections.every((s, i) => s.label === STATE_CARD_SECTION_LABELS[i]));
check('current task section populated', sections[0]?.value === 'task1');
check('null snapshot still yields stable sections', formatStateCard(null).length === 8);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
