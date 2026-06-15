/**
 * Conductor loop smoke (Goal 5D).
 *
 * Proves the approval-gated, operator-advanced loop: read context → propose one
 * action → approval gate (high-risk) → execute via approved 5C seams → decision
 * receipt → pause/continue. Covers the approve path, the deny path, and the
 * blocker/ambiguity pause path, and that every step posts a decision receipt.
 *
 * Stateless: the loop reads the Kernel each step (no hidden memory). Uses
 * bun:sqlite + injected dispatch routing to the real Kernel handlers.
 *
 * Run: bun scripts/conductor-loop-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleConnectionCommand } from '../../src/kernel/commands/connection-commands';
import { handleReceiptCommand, queryReceiptList } from '../../src/kernel/receipts/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleConductorCommand, queryConductorContext } from '../../src/kernel/conductor/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createConductorLoop } from '../../src/main/conductor/conductor-loop';
import { proposeNextAction } from '../../src/main/conductor/conductor-planner';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}`); }
}

const schemaPath = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations', '001-v3-baseline.sql');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(schemaPath, 'utf-8'));
db.prepare(`INSERT INTO workflows (id, name, objective, status, created_at, updated_at) VALUES ('wf1','Build loader','o','active',?,?)`).run(Date.now(), Date.now());
// deno-lint-ignore no-explicit-any
const kdb = db as any;
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  if (type.startsWith('kernel.connection.')) return handleConnectionCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};
const actions = createConductorActions(dispatch, { spawnRole: async () => ({ ok: true }) });
const loop = createConductorLoop({
  readContext: (workflowId) => queryConductorContext(kdb, workflowId ? { workflowId } : {}),
  propose: proposeNextAction,
  runAction: (action, args) => actions.runAction(action, args),
  postDecision: ({ workflowId, summary, phase, proposal, requestApproval }) =>
    dispatch('kernel.conductor.plan', {
      workflowId: workflowId ?? null,
      summary,
      phase,
      proposedAction: proposal.kind === 'action' ? proposal.action : 'pause',
      nextAction: proposal.rationale,
      requestApproval: requestApproval === true,
    }),
});

const phasesSeen = () =>
  queryReceiptList(kdb, { workflowId: 'wf1' })
    .filter((r) => r.type === 'planning')
    .map((r) => r.metadata?.['phase']);

console.log('— no tasks → loop pauses (nothing actionable) —');
let r = await loop.step({ workflowId: 'wf1' });
check('paused when nothing to do', r.status === 'paused' && r.canContinue === false);

console.log('\n— operator override: create a task (low-risk, executes) —');
r = await loop.step({
  workflowId: 'wf1',
  override: { kind: 'action', action: 'create_task', args: { id: 't1', workflowId: 'wf1', title: 'Implement loader', objective: 'o' }, risk: 'low', rationale: 'operator-created task' },
});
check('create executed', r.status === 'executed');
check('task t1 open', queryTaskGet(kdb, 't1')?.status === 'open');

console.log('\n— propose + auto-execute low-risk assign —');
r = await loop.step({ workflowId: 'wf1' });
check('assign proposed + executed', r.status === 'executed' && r.proposal.action === 'assign_task');
check('task working after assign', queryTaskGet(kdb, 't1')?.status === 'working');
check('low-risk success can continue', r.canContinue === true);

console.log('\n— working task → pause (await submission) —');
r = await loop.step({ workflowId: 'wf1' });
check('paused awaiting submission', r.status === 'paused');

console.log('\n— submit, then high-risk verify is approval-gated —');
await actions.runAction('submit_task', { taskId: 't1', summary: 'done' });
r = await loop.step({ workflowId: 'wf1' });
check('verify awaits approval (not auto-run)', r.status === 'awaiting-approval' && r.proposal.action === 'verify_task');
check('task still submitted (not verified)', queryTaskGet(kdb, 't1')?.status === 'submitted');

console.log('\n— deny path: verify denied, task untouched —');
r = await loop.step({ workflowId: 'wf1', approve: false });
check('denied', r.status === 'denied');
check('task still submitted after deny', queryTaskGet(kdb, 't1')?.status === 'submitted');

console.log('\n— approve path: verify executes → complete —');
r = await loop.step({ workflowId: 'wf1', approve: true });
check('approved verify executed', r.status === 'executed' && r.proposal.action === 'verify_task');
check('task complete', queryTaskGet(kdb, 't1')?.status === 'complete');

console.log('\n— blocker pause path —');
await actions.runAction('create_task', { id: 't2', workflowId: 'wf1', title: 'T2', objective: 'o' });
await actions.runAction('assign_task', { taskId: 't2', tileId: 'tile_w' });
await actions.runAction('block_task', { taskId: 't2', reason: 'waiting upstream' });
r = await loop.step({ workflowId: 'wf1' });
check('blocked task pauses the loop', r.status === 'paused' && /blocked/i.test(r.proposal.rationale));

console.log('\n— every decision is on the receipt chain —');
const phases = phasesSeen();
for (const p of ['paused', 'executed', 'awaiting-approval', 'denied']) {
  check(`receipt recorded phase '${p}'`, phases.includes(p));
}

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
