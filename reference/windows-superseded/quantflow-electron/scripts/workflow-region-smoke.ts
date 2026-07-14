/**
 * Workflow region + semantic string smoke (Goal 7).
 *
 * Proves the Kernel-owned canvas projection: a workflow region aggregates its
 * member tiles (bounding box), task/receipt counts, blocked tasks, and the
 * semantic-type breakdown of its strings — all read-only over existing Kernel
 * truth. Also proves the connection semantic type is settable/coercible and
 * that the shared renderer projectors turn the region/strings into soft display
 * models (the canvas shows which tiles belong to a workflow, which strings are
 * delegations/verification/etc., and which task is blocked).
 *
 * Uses bun:sqlite + the real Kernel handlers. No Electron.
 *
 * Run: bun scripts/workflow-region-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleConnectionCommand } from '../../src/kernel/commands/connection-commands';
import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { handleReceiptCommand } from '../../src/kernel/receipts/index';
import {
  queryWorkflowRegion,
  queryWorkflowRegionList,
  computeRegionBounds,
  normalizeSemanticType,
  isSemanticConnectionType,
  REGION_PADDING,
} from '../../src/kernel/workflows/index';
import { formatWorkflowRegion } from '../../src/renderer/components/WorkflowRegion/workflow-region-view';
import {
  resolveSemanticString,
  SEMANTIC_STRING_STYLES,
  normalizeStringType,
} from '../../src/renderer/components/StringOverlay/semantic-string-view';
import { getRegionRenderModels } from '../src/windows/shell/src/workflow-region-overlay';

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
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Build Replay Loader','Load and verify replays','active',?,?)`,
).run(now, now);
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf2','Sibling Mission','one tile','active',?,?)`,
).run(now, now);
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf3','Empty Mission','nothing yet','active',?,?)`,
).run(now, now);
// deno-lint-ignore no-explicit-any
const kdb = db as any;

const tile = (id: string, x: number, y: number, w: number, h: number, kind = 'worker') =>
  handleTileCommand(kdb, 'kernel.tile.create', {
    id, workflowId: 'wf1', displayName: id, tileKind: kind, x, y, width: w, height: h,
  });

// A 3-tile workflow: conductor + worker + verifier.
tile('t_cond', 0, 0, 300, 200, 'conductor');
tile('t_work', 400, 0, 300, 200, 'worker');
tile('t_verify', 200, 400, 300, 200, 'worker');

console.log('— pure bounds helper —');
check('null bounds for no tiles', computeRegionBounds([]) === null);
const b = computeRegionBounds([{ x: 0, y: 0, width: 300, height: 200 }, { x: 400, y: 0, width: 300, height: 200 }]);
check('bounds pad around tiles', !!b && b.x === -REGION_PADDING && b.width === 700 + REGION_PADDING * 2);

console.log('\n— semantic type validation/coercion —');
check('known type is valid', isSemanticConnectionType('delegation'));
check('unknown type is not', !isSemanticConnectionType('frobnicate'));
check('normalize unknown → manual', normalizeSemanticType('frobnicate') === 'manual_connection');
check('normalize keeps known', normalizeSemanticType('verification') === 'verification');

console.log('\n— connections carry semantic type; create coerces; update sets —');
handleConnectionCommand(kdb, 'kernel.connection.create', {
  id: 'c_del', workflowId: 'wf1', tileAId: 't_cond', tileBId: 't_work',
  fromTileId: 't_cond', toTileId: 't_work', semanticType: 'delegation',
});
handleConnectionCommand(kdb, 'kernel.connection.create', {
  id: 'c_ver', workflowId: 'wf1', tileAId: 't_work', tileBId: 't_verify',
  fromTileId: 't_work', toTileId: 't_verify', semanticType: 'verification',
});
// Created with a bogus type → coerced to manual, then upgraded via update.
handleConnectionCommand(kdb, 'kernel.connection.create', {
  id: 'c_ctx', workflowId: 'wf1', tileAId: 't_cond', tileBId: 't_verify', semanticType: 'bogus',
});
const coerced = db.prepare('SELECT semantic_type FROM connections WHERE id = ?').get('c_ctx') as { semantic_type: string };
check('bogus create coerced to manual', coerced.semantic_type === 'manual_connection');
const upd = handleConnectionCommand(kdb, 'kernel.connection.update', { id: 'c_ctx', semanticType: 'context_flow', label: 'shared plan' });
check('update returns ok', upd.ok === true);
const after = db.prepare('SELECT semantic_type, label FROM connections WHERE id = ?').get('c_ctx') as { semantic_type: string; label: string };
check('update set context_flow + label', after.semantic_type === 'context_flow' && after.label === 'shared plan');
check('update unknown id rejected', handleConnectionCommand(kdb, 'kernel.connection.update', { id: 'nope', semanticType: 'blocker' }).ok === false);

console.log('\n— connection inherits workflow from its endpoints (no explicit workflowId) —');
// Both endpoints in wf1, caller omits workflowId (the real cable-drop path).
handleConnectionCommand(kdb, 'kernel.connection.create', {
  id: 'c_inherit', tileAId: 't_cond', tileBId: 't_verify', semanticType: 'receipt_handoff',
});
const inherited = db.prepare('SELECT workflow_id FROM connections WHERE id = ?').get('c_inherit') as { workflow_id: string | null };
check('string inherits wf1 from its tiles', inherited.workflow_id === 'wf1');
// A tile in wf2 → cross-workflow link inherits no workflow.
handleTileCommand(kdb, 'kernel.tile.create', { id: 't_other', workflowId: 'wf2', displayName: 't_other', tileKind: 'worker', x: 0, y: 0, width: 100, height: 100 });
handleConnectionCommand(kdb, 'kernel.connection.create', { id: 'c_cross', tileAId: 't_cond', tileBId: 't_other' });
const cross = db.prepare('SELECT workflow_id FROM connections WHERE id = ?').get('c_cross') as { workflow_id: string | null };
check('cross-workflow string has null workflow', cross.workflow_id === null);

console.log('\n— tasks: one blocked through the real lifecycle —');
handleTaskCommand(kdb, 'kernel.task.create', { id: 'k1', workflowId: 'wf1', title: 'Open task', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.create', { id: 'k2', workflowId: 'wf1', title: 'Blocked task', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'k2', tileId: 't_work' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'k2' });
const blockRes = handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'k2', reason: 'waiting upstream' });
check('block accepted', blockRes.ok === true);
handleReceiptCommand(kdb, 'kernel.receipt.post', { type: 'progress', workflowId: 'wf1', taskId: 'k1', summary: 'note' });

console.log('\n— region aggregate read —');
const region = queryWorkflowRegion(kdb, 'wf1')!;
check('region found', !!region);
check('name + objective + status', region.name === 'Build Replay Loader' && region.objective.length > 0 && region.status === 'active');
check('3 member tiles', region.tileCount === 3 && region.tileIds.length === 3);
check('bounds non-null and padded', !!region.bounds && region.bounds.x === -REGION_PADDING);
check('task count = 2', region.taskCount === 2);
check('open count = 1', region.openTaskCount === 1);
check('one blocked task = k2', region.blockedTaskCount === 1 && region.blockedTaskIds[0] === 'k2');
check('receipt count > 0', region.receiptCount > 0);
check('semantic counts: delegation 1', region.connectionTypeCounts.delegation === 1);
check('semantic counts: verification 1', region.connectionTypeCounts.verification === 1);
check('semantic counts: context_flow 1', region.connectionTypeCounts.context_flow === 1);
check('semantic counts: inherited receipt_handoff 1', region.connectionTypeCounts.receipt_handoff === 1);

console.log('\n— region list includes empty workflow (null bounds) —');
const list = queryWorkflowRegionList(kdb);
check('three regions', list.length === 3);
const empty = list.find((r) => r.id === 'wf3')!;
check('empty workflow has null bounds', empty.bounds === null && empty.tileCount === 0);
check('missing workflow → null', queryWorkflowRegion(kdb, 'nope') === null);

console.log('\n— renderer projector: soft region model —');
const model = formatWorkflowRegion(region);
check('title + status carried', model.title === 'Build Replay Loader' && model.status === 'active');
check('hasBlockers true', model.hasBlockers === true);
check('summary mentions blocked', /blocked/.test(model.summary));
check('sections include Blockers with k2', model.sections.some((s) => s.label === 'Blockers' && s.value.includes('k2')));
check('null region → stable empty model', formatWorkflowRegion(null).sections.length === 8);

console.log('\n— renderer projector: semantic strings —');
const del = resolveSemanticString({ id: 'c_del', semanticType: 'delegation', fromTileId: 't_cond', toTileId: 't_work' });
check('delegation label + directional', del.label === 'Delegation' && del.directional === true && del.alert === false);
const blk = resolveSemanticString({ id: 'x', semanticType: 'blocker', tileAId: 'a', tileBId: 'b' });
check('blocker is alert + endpoints fall back to A/B', blk.alert === true && blk.fromTileId === 'a' && blk.toTileId === 'b');
const own = resolveSemanticString({ id: 'y', semanticType: 'context_flow', label: 'custom' });
check('own label wins', own.label === 'custom');
check('every style has class hook', Object.values(SEMANTIC_STRING_STYLES).every((s) => s.className.startsWith('string-semantic--')));
check('normalizeStringType unknown → manual', normalizeStringType('zzz') === 'manual_connection');

console.log('\n— shell overlay: render models drop empty regions —');
const models = getRegionRenderModels(list);
const drawableIds = models.map((m) => m.id).sort();
check('only workflows with tiles are drawable (wf1, wf2)', drawableIds.length === 2 && drawableIds[0] === 'wf1' && drawableIds[1] === 'wf2');
const wf1Model = models.find((m) => m.id === 'wf1')!;
check('drawable model carries bounds + summary', !!wf1Model.bounds && wf1Model.summary.length > 0);
check('non-array input safe', getRegionRenderModels(null as unknown as []).length === 0);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
