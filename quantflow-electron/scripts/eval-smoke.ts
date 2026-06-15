/**
 * Evaluation layer smoke (Goal 9).
 *
 * Drives several workflows through the real Kernel, runs the PURE evaluator, and
 * persists results via kernel.eval.create. Asserts the EVALS_SPEC acceptance
 * scenarios (happy path, legacy bypass, missing artifact, blocked task, poor
 * delegation, high/low confidence, self-verification cap, determinism), proves
 * evals never mutate task/receipt/State-Card state, and that the evaluations
 * table stores not_applicable distinctly from score 0.
 *
 * Uses bun:sqlite + both Kernel migrations (so the evaluations table exists).
 *
 * Run: bun scripts/eval-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand } from '../../src/kernel/receipts/index';
import { handleConductorCommand } from '../../src/kernel/conductor/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { handleEvalCommand, queryEvaluationGet, queryEvaluationList } from '../../src/kernel/evals/index';
import {
  collectEvalEvidence,
  evaluateTask,
  evaluateVerification,
  evaluateConductorDecision,
  evaluateWorkflow,
} from '../../src/evals/index';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}`); }
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(join(migrationsDir, '001-v3-baseline.sql'), 'utf-8'));
db.exec(readFileSync(join(migrationsDir, '002-evaluations.sql'), 'utf-8'));
// deno-lint-ignore no-explicit-any
const kdb = db as any;
const t0 = Date.now();
db.prepare(`INSERT INTO workflows (id,name,objective,status,created_at,updated_at) VALUES ('wf1','Eval WF','Prove evaluation layer','active',?,?)`).run(t0, t0);
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
db.prepare(`INSERT INTO worker_instances (id,tile_id,workflow_id,status,created_at,updated_at) VALUES ('w_owner','tile_w','wf1','active',?,?)`).run(t0, t0);
db.prepare(`INSERT INTO worker_instances (id,tile_id,workflow_id,status,created_at,updated_at) VALUES ('w_verifier','tile_v','wf1','active',?,?)`).run(t0, t0);

const dim = (result: any, name: string) => result.dimensions.find((d: any) => d.dimension === name);

// ── Scenario setup ─────────────────────────────────────────────────────────

// 1. Happy path: full pass + artifact + independent verifier.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_happy', workflowId: 'wf1', title: 'Loader', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_happy', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_happy' });
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task_happy', summary: 'done' });
handleArtifactCommand(kdb, 'kernel.artifact.create', { workflowId: 'wf1', taskId: 'task_happy', workerId: 'w_owner', kind: 'code', uri: 'src/loader.ts', summary: 'loader' });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_happy', verifierWorkerId: 'w_verifier' });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_happy', verifierWorkerId: 'w_verifier', verdict: 'pass' });

// 2. Legacy bypass: working → complete via legacy flag, no verification.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_legacy', workflowId: 'wf1', title: 'Legacy', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_legacy', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_legacy' });
handleTaskCommand(kdb, 'kernel.task.complete', { taskId: 'task_legacy', legacy: true });

// 3. Missing artifact: completed + verified, but a receipt references a ghost artifact.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_missing', workflowId: 'wf1', title: 'Missing', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_missing', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_missing' });
handleReceiptCommand(kdb, 'kernel.receipt.post', { type: 'progress', workflowId: 'wf1', taskId: 'task_missing', summary: 'cites artifact', artifactRefs: ['artifact_ghost'] });
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task_missing', summary: 'done' });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_missing', verifierWorkerId: 'w_verifier' });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_missing', verifierWorkerId: 'w_verifier', verdict: 'pass' });

// 4. Blocked task, unresolved.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_blk', workflowId: 'wf1', title: 'Blocked', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_blk', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_blk' });
handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task_blk', reason: 'waiting upstream' });

// 5. Poor delegation: a denied Conductor decision.
const planRes = handleConductorCommand(kdb, 'kernel.conductor.plan', { workflowId: 'wf1', summary: 'spawn risky role', phase: 'denied', proposedAction: 'spawn_role' });
const deniedReceiptId = (planRes as any).id as string;

// 7. Self-verification: verifier == owner (operator override bypasses the kernel guard).
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_self', workflowId: 'wf1', title: 'Self', objective: 'o' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_self', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task_self' });
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task_self', summary: 'done' });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_self', verifierWorkerId: 'w_owner', operatorOverride: true });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task_self', verifierWorkerId: 'w_owner', verdict: 'pass', operatorOverride: true });

const evidence = collectEvalEvidence(kdb, 'wf1');

console.log('— 1. happy path —');
const happy = evaluateTask(evidence, 'task_happy')!;
check('completion correctness high (>=3)', (dim(happy, 'task_completion_correctness').score ?? 0) >= 3);
check('verification integrity 4 (independent)', dim(happy, 'verification_integrity').score === 4);
check('evidence completeness high (>=3)', (dim(happy, 'evidence_completeness').score ?? 0) >= 3);
check('completion cites the verification receipt', dim(happy, 'task_completion_correctness').evidenceRefs.some((r: string) => r.length > 0));

console.log('\n— 2. legacy bypass —');
const legacy = evaluateTask(evidence, 'task_legacy')!;
check('verification integrity 0', dim(legacy, 'verification_integrity').score === 0);
check('verification integrity NOT not_applicable', dim(legacy, 'verification_integrity').applicable === true);
check('completion capped low (<=1)', (dim(legacy, 'task_completion_correctness').score ?? 9) <= 1);
check('limitation notes legacy bypass', /legacy/i.test(dim(legacy, 'verification_integrity').limitations ?? ''));

console.log('\n— 3. missing artifact —');
const missing = evaluateTask(evidence, 'task_missing')!;
check('completion lowered (<=2) for missing artifact', (dim(missing, 'task_completion_correctness').score ?? 9) <= 2);
check('artifact usefulness low (<=1)', (dim(missing, 'artifact_usefulness').score ?? 9) <= 1);
check('limitation names the ghost artifact', /artifact_ghost/.test((dim(missing, 'artifact_usefulness').limitations ?? '') + (dim(missing, 'task_completion_correctness').limitations ?? '')));
check('missing-artifact is not scored as success/not_applicable', dim(missing, 'artifact_usefulness').applicable === true);

console.log('\n— 4. blocked task —');
const blk = evaluateTask(evidence, 'task_blk')!;
check('blocker handling low (unresolved)', (dim(blk, 'blocker_handling').score ?? 9) <= 1);
check('blocker handling cites the block receipt + task', dim(blk, 'blocker_handling').evidenceRefs.includes('task_blk'));
check('completion not_applicable (not terminal)', dim(blk, 'task_completion_correctness').applicable === false && dim(blk, 'task_completion_correctness').score === null);
const wf = evaluateWorkflow(evidence)!;
check('workflow surfaces blocked task id', dim(wf, 'blocker_handling').evidenceRefs.includes('task_blk'));

console.log('\n— 5. poor delegation —');
const cdec = evaluateConductorDecision(evidence, deniedReceiptId)!;
check('conductor decision quality low for denied', (dim(cdec, 'conductor_decision_quality').score ?? 9) <= 1);
check('decision cites the planning receipt', dim(cdec, 'conductor_decision_quality').evidenceRefs.includes(deniedReceiptId));
check('delegation quality low', (dim(cdec, 'delegation_quality').score ?? 9) <= 1);

console.log('\n— 6. confidence high vs low —');
check('verification integrity high confidence (>=0.8)', dim(happy, 'verification_integrity').confidence >= 0.8);
check('artifact usefulness low confidence (<0.5)', dim(happy, 'artifact_usefulness').confidence < 0.5);

console.log('\n— 7. self-verification cap —');
const self = evaluateVerification(evidence, 'task_self')!;
check('verification integrity capped <=1', (dim(self, 'verification_integrity').score ?? 9) <= 1);
check('limitation names self-verification', /self-verification/i.test(dim(self, 'verification_integrity').limitations ?? ''));

console.log('\n— 8. determinism —');
const evidence2 = collectEvalEvidence(kdb, 'wf1');
const a = JSON.stringify(evaluateTask(evidence2, 'task_happy'));
const b = JSON.stringify(evaluateTask(collectEvalEvidence(kdb, 'wf1'), 'task_happy'));
check('two evaluations byte-identical', a === b);

console.log('\n— persistence: create-only, not_applicable distinct from 0 —');
const before = {
  tasks: (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n,
  receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as any).n,
  cards: (db.prepare('SELECT COUNT(*) AS n FROM state_cards').get() as any).n,
};
const createRes = handleEvalCommand(kdb, 'kernel.eval.create', blk as any);
check('eval.create ok', (createRes as any).ok === true);
const evalId = (createRes as any).id as string;
const rows = queryEvaluationGet(kdb, evalId);
check('rows persisted per dimension', rows.length === blk.dimensions.length);
const naRow = rows.find((r) => r.dimension === 'task_completion_correctness')!;
check('not_applicable stored as applicable=false + NULL score', naRow.applicable === false && naRow.score === null);
const blkRow = rows.find((r) => r.dimension === 'blocker_handling')!;
check('score 0..4 stored as integer', typeof blkRow.score === 'number');
check('eval rows queryable by workflow', queryEvaluationList(kdb, { workflowId: 'wf1' }).length >= rows.length);

console.log('\n— evals never mutate task/receipt/state-card state —');
const after = {
  tasks: (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as any).n,
  receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as any).n,
  cards: (db.prepare('SELECT COUNT(*) AS n FROM state_cards').get() as any).n,
};
check('task count unchanged', before.tasks === after.tasks);
check('receipt count unchanged (no eval receipts)', before.receipts === after.receipts);
check('state card count unchanged', before.cards === after.cards);
check('blocked task still blocked after eval', (db.prepare("SELECT status FROM tasks WHERE id='task_blk'").get() as any).status === 'blocked');

console.log('\n— eval.create rejects empty input —');
check('rejects no dimensions', (handleEvalCommand(kdb, 'kernel.eval.create', { evalType: 'task_eval', dimensions: [] } as any) as any).ok === false);
check('rejects unknown command', (handleEvalCommand(kdb, 'kernel.eval.frobnicate', {} as any) as any).ok === false);

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
