/**
 * Conductor read-only smoke (Goal 5A).
 *
 * Proves the Conductor can read Kernel-owned context, that the deterministic
 * model provider derives a plan/next-action/blockers from it, that posting a
 * planning receipt is the ONLY write (no task advances), and that the renderer
 * projector turns a view into the canonical sections.
 *
 * Uses bun:sqlite + the canonical schema in memory (DB-injected handlers).
 *
 * Run: bun scripts/conductor-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTaskCommand, queryTaskList } from '../../src/kernel/tasks/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { queryReceiptList } from '../../src/kernel/receipts/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import {
  queryConductorContext,
  queryWorkflowSnapshot,
  handleConductorCommand,
} from '../../src/kernel/conductor/index';
import { manualModelProvider } from '../../src/main/conductor/model-provider';
import {
  formatConductorView,
  CONDUCTOR_SECTION_LABELS,
} from '../../src/renderer/components/ConductorTile/conductor-view';

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
db.prepare(`INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Replay loader','Build it','active',?,?)`).run(now, now);
// deno-lint-ignore no-explicit-any
const kdb = db as any;
// State Cards are maintained by the watcher; the Conductor reads them.
startStateCardWatcher(kdb);

console.log('— seed a world for the Conductor to read —');
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile1', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task1', workflowId: 'wf1', title: 'Implement loader', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', tileId: 'tile1' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' });
handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task1', reason: 'waiting on upstream schema' });
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task2', workflowId: 'wf1', title: 'Write tests', objective: 'o' });

console.log('\n— queryConductorContext aggregates Kernel truth —');
const ctx = queryConductorContext(kdb, { workflowId: 'wf1' });
check('workflow snapshot present', ctx.workflow?.name === 'Replay loader');
check('workflow counts', ctx.workflow?.taskCount === 2 && ctx.workflow?.blockedTaskCount === 1);
check('tiles read', ctx.tiles.length === 1);
check('tasks read', ctx.tasks.length === 2);
check('state cards read', ctx.stateCards.length >= 1);
check('recent receipts read', ctx.recentReceipts.length > 0);

console.log('\n— workflow snapshot —');
check('queryWorkflowSnapshot ok', queryWorkflowSnapshot(kdb, 'wf1')?.id === 'wf1');

console.log('\n— deterministic model provider plans from context (no network) —');
const plan = manualModelProvider.plan(ctx, '');
console.log('  nextAction:', JSON.stringify(plan.nextAction));
check('blocker prioritized as next action', plan.nextAction.startsWith('Resolve blocker'));
check('blocker promoted into plan', plan.blockers.includes('waiting on upstream schema'));
check('plan summary is concise', plan.plan.length > 0 && plan.plan.length < 200);

console.log('\n— planning receipt is the only write (no task advances) —');
const before = queryTaskList(kdb, { workflowId: 'wf1' }).map((t) => `${t.id}:${t.status}`).sort();
const planResult = handleConductorCommand(kdb, 'kernel.conductor.plan', {
  workflowId: 'wf1',
  summary: plan.plan,
  nextAction: plan.nextAction,
  blockers: plan.blockers,
});
check('plan posted ok', planResult.ok === true);
const planningReceipts = queryReceiptList(kdb, {}).filter((r) => r.type === 'planning');
check('planning receipt in chain', planningReceipts.length === 1 && planningReceipts[0]!.summary === plan.plan);
const after = queryTaskList(kdb, { workflowId: 'wf1' }).map((t) => `${t.id}:${t.status}`).sort();
check('no task advanced by planning', JSON.stringify(before) === JSON.stringify(after));

console.log('\n— planning requires a summary (guard) —');
check('empty plan rejected', handleConductorCommand(kdb, 'kernel.conductor.plan', {}).ok === false);

console.log('\n— renderer projector (formatConductorView) —');
const view = {
  workflow: { name: 'Replay loader', status: 'active', taskCount: 2, blockedTaskCount: 1 },
  plan: plan.plan,
  nextAction: plan.nextAction,
  blockers: plan.blockers,
  stateReads: { tiles: 1, tasks: 2, stateCards: 1, recentReceipts: ctx.recentReceipts.length },
  toolCalls: [{ tool: 'get_context', at: now }],
  delegations: [],
  receiptsReviewed: ctx.recentReceipts.map((r) => ({ id: r.id, type: r.type, summary: r.summary })),
  generatedAt: now,
};
const sections = formatConductorView(view);
check('seven canonical sections in order',
  sections.length === 7 &&
  sections.every((s, i) => s.label === CONDUCTOR_SECTION_LABELS[i]));
check('current plan populated', sections[0]!.value === plan.plan);
check('next action populated', sections[6]!.value === plan.nextAction);
check('delegations show read-only', sections[3]!.value === 'None (read-only)');
check('null view yields stable sections', formatConductorView(null).length === 7);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
