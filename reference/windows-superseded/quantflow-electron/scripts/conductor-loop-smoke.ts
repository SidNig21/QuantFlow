/**
 * Conductor loop smoke (Goal 5D).
 *
 * Proves the approval-gated, operator-advanced loop: read context → propose one
 * action → approval gate (high-risk) → execute via approved 5C seams → decision
 * receipt → pause/continue. Covers approve, deny, blocker/ambiguity pause, and
 * — critically — proposal drift: an approval bound to a stale proposal token is
 * refused, so no high-risk action runs against a changed world.
 *
 * Stateless: the loop reads the Kernel each step (no hidden memory). Uses
 * bun:sqlite + injected dispatch routing to the real Kernel handlers.
 *
 * Run: bun scripts/conductor-loop-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleConnectionCommand } from '../../src/kernel/commands/connection-commands';
import { handleArtifactCommand, handleReceiptCommand, queryReceiptList } from '../../src/kernel/receipts/index';
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
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-conductor-loop-'));
db.prepare(`INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at) VALUES ('wf1','Build loader','o','active',?,?,?)`).run(artifactRoot, Date.now(), Date.now());
// deno-lint-ignore no-explicit-any
const kdb = db as any;
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });

function createArtifact(taskId: string, uri: string, body: string): string {
  writeFileSync(join(artifactRoot, uri), body, 'utf-8');
  const owner = queryTaskGet(kdb, taskId)?.ownerWorkerId;
  const result = handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf1',
    taskId,
    workerId: owner,
    kind: 'file',
    uri,
    summary: `proof for ${taskId}`,
  });
  check(`artifact ${taskId} ok`, result.ok === true);
  return result.id as string;
}

const dispatch = async (type: string, payload: Record<string, unknown>) => {
  if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
  if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
  if (type.startsWith('kernel.connection.')) return handleConnectionCommand(kdb, type, payload);
  if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
  if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
  if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
  return { ok: false, error: `unhandled ${type}` };
};
const actions = createConductorActions(dispatch, { spawnRole: async () => ({ ok: true }) });
const loop = createConductorLoop({
  readContext: (workflowId) => queryConductorContext(kdb, workflowId ? { workflowId } : {}),
  propose: proposeNextAction,
  runAction: (action, args) => actions.runAction(action, args),
  hasPendingApproval: ({ workflowId, proposalToken }) => {
    const receipts = queryReceiptList(kdb, workflowId ? { workflowId, limit: 100 } : { limit: 100 });
    const latestForToken = receipts.find(
      (receipt) => receipt.type === 'planning' && receipt.metadata?.['proposalToken'] === proposalToken,
    );
    return latestForToken?.metadata?.['phase'] === 'awaiting-approval'
      && latestForToken?.metadata?.['requestApproval'] === true;
  },
  postDecision: ({ workflowId, summary, phase, proposal, proposalToken, requestApproval }) =>
    dispatch('kernel.conductor.plan', {
      workflowId: workflowId ?? null,
      summary,
      phase,
      proposedAction: proposal.kind === 'action' ? proposal.action : 'await_operator',
      proposalToken: proposalToken ?? null,
      nextAction: proposal.rationale,
      requestApproval: requestApproval === true,
    }),
});

const wf = { workflowId: 'wf1' };
const phasesSeen = () =>
  queryReceiptList(kdb, { workflowId: 'wf1' })
    .filter((r) => r.type === 'planning')
    .map((r) => r.metadata?.['phase']);
const createOverride = (id: string, title: string) => ({
  workflowId: 'wf1',
  override: { kind: 'action' as const, action: 'create_task' as const, args: { id, workflowId: 'wf1', title, objective: 'o' }, risk: 'low' as const, rationale: `operator-created ${id}` },
});

console.log('— no tasks → loop pauses —');
let r = await loop.step(wf);
check('awaiting operator when nothing to do', r.status === 'awaiting_operator');

console.log('\n— create (override) → assign (low, auto) → pause (working) —');
check('create executed', (await loop.step(createOverride('t1', 'Implement loader'))).status === 'executed');
r = await loop.step(wf);
check('assign auto-executed', r.status === 'executed' && r.proposal.action === 'assign_task');
check('t1 working', queryTaskGet(kdb, 't1')?.status === 'working');
check('working -> awaiting operator', (await loop.step(wf)).status === 'awaiting_operator');

console.log('\n— high-risk verify is approval-gated; deny needs the token —');
const artifact1 = createArtifact('t1', 't1-proof.md', 'done');
await actions.runAction('submit_task', { taskId: 't1', artifactRefs: [artifact1] });
r = await loop.step(wf);
check('awaiting-approval with a token', r.status === 'awaiting-approval' && typeof r.proposalToken === 'string');
const t1Token = r.proposalToken!;

console.log('\n— decision without a token is refused (stale) —');
check('approve without token → stale', (await loop.step({ ...wf, approve: true })).status === 'stale');
check('approve with forged token → stale', (await loop.step({ ...wf, approve: true, proposalToken: 'forged-token' })).status === 'stale');
check('t1 still submitted', queryTaskGet(kdb, 't1')?.status === 'submitted');

console.log('\n— deny with the correct token —');
check('deny with token → denied', (await loop.step({ ...wf, approve: false, proposalToken: t1Token })).status === 'denied');
check('t1 still submitted after deny', queryTaskGet(kdb, 't1')?.status === 'submitted');

console.log('\n— PROPOSAL DRIFT: stale token is refused, no high-risk runs —');
r = await loop.step(wf); // fresh awaiting-approval for t1
const staleToken = r.proposalToken!;
// Mutate the world so the next high-risk proposal targets a different task.
await actions.runAction('create_task', { id: 't2', workflowId: 'wf1', title: 'T2', objective: 'o' });
await actions.runAction('assign_task', { taskId: 't2', tileId: 'tile_w' });
const artifact2 = createArtifact('t2', 't2-proof.md', 'done2');
await actions.runAction('submit_task', { taskId: 't2', artifactRefs: [artifact2] }); // t2 is now the newest submitted
r = await loop.step({ ...wf, approve: true, proposalToken: staleToken });
check('drifted approval → stale', r.status === 'stale');
check('no task completed by the stale approval', queryTaskGet(kdb, 't1')?.status === 'submitted' && queryTaskGet(kdb, 't2')?.status === 'submitted');

console.log('\n— approve with the CURRENT token executes verify → complete —');
r = await loop.step(wf); // current awaiting-approval (newest submitted = t2)
const target = r.proposal.args!.taskId as string;
r = await loop.step({ ...wf, approve: true, proposalToken: r.proposalToken });
check('approved verify executed', r.status === 'executed' && r.proposal.action === 'verify_task');
check('verified task complete', queryTaskGet(kdb, target)?.status === 'complete');
check('replay of consumed approval token → stale', (await loop.step({ ...wf, approve: true, proposalToken: r.proposalToken })).status === 'stale');

console.log('\n— blocker pause path —');
await actions.runAction('create_task', { id: 't3', workflowId: 'wf1', title: 'T3', objective: 'o' });
await actions.runAction('assign_task', { taskId: 't3', tileId: 'tile_w' });
await actions.runAction('block_task', { taskId: 't3', reason: 'waiting upstream' });
r = await loop.step(wf);
check('blocked task awaits operator', r.status === 'awaiting_operator' && /blocked/i.test(r.proposal.rationale));

console.log('\n— every decision is on the receipt chain (incl. stale) —');
const phases = phasesSeen();
for (const p of ['awaiting_operator', 'executed', 'awaiting-approval', 'denied', 'stale']) {
  check(`receipt recorded phase '${p}'`, phases.includes(p));
}

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
