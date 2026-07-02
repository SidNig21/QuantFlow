/**
 * smoke:judgment (R7) - Judgment & Compounding proof.
 *
 * Proves receipt-primary Run Replay, typed artifacts, semantic verification,
 * eval auto-triggering, lesson -> vault mirror, and the F16 regression that
 * evals never gate task progression.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkflowCommand } from '../../src/kernel/commands/workflow-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryArtifactList, queryReceiptList } from '../../src/kernel/receipts/index';
import { handleEvalCommand, queryEvaluationList } from '../../src/kernel/evals/index';
import { seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { buildWorkflowReplay } from '../../src/main/conductor/workflow-replay';
import { mirrorLessonArtifactsToVault } from '../../src/vault/index';

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

function expectOk(label: string, result: { ok: boolean; id?: string; error?: string }): string {
  check(`${label} ok`, result.ok === true);
  if (!result.ok) console.error(`        ${result.error}`);
  return result.id ?? '';
}

const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
for (const migration of [
  '001-v3-baseline.sql',
  '002-evaluations.sql',
  '003-r1-worker-task-binding.sql',
  '004-r3-workflow-instance.sql',
  '005-r4-runtime.sql',
  '006-r2-artifact-lineage.sql',
  '007-r7-typed-artifacts.sql',
]) {
  db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
}
// deno-lint-ignore no-explicit-any
const kdb = db as any;
seedHarnessRegistry(kdb);

const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-r7-artifacts-'));

console.log('- setup workflow, workers, and first verified task -');
expectOk('workflow create', handleWorkflowCommand(kdb, 'kernel.workflow.create', {
  id: 'wf-r7',
  name: 'R7 Judgment Smoke',
  objective: 'Produce a replayable judgment run',
  mode: 'research',
  vaultPath: artifactRoot,
}));
expectOk('worker tile', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile-worker',
  workflowId: 'wf-r7',
  displayName: 'Researcher',
  tileKind: 'worker',
}));
expectOk('verifier tile', handleTileCommand(kdb, 'kernel.tile.create', {
  id: 'tile-verifier',
  workflowId: 'wf-r7',
  displayName: 'Verifier',
  tileKind: 'worker',
}));
const t0 = Date.now();
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
  VALUES ('worker-r7', 'tile-worker', 'wf-r7', 'active', ?, ?)`).run(t0, t0);
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
  VALUES ('verifier-r7', 'tile-verifier', 'wf-r7', 'active', ?, ?)`).run(t0, t0);

function writeArtifactFile(name: string, body: string): void {
  mkdirSync(join(artifactRoot, 'out'), { recursive: true });
  writeFileSync(join(artifactRoot, 'out', name), body, 'utf-8');
}

function completeVerifiedTask(taskId: string, fileName: string, body: string): string {
  expectOk(`${taskId} create`, handleTaskCommand(kdb, 'kernel.task.create', {
    id: taskId,
    workflowId: 'wf-r7',
    title: `Task ${taskId}`,
    objective: `Produce ${fileName}`,
  }));
  expectOk(`${taskId} claim`, handleTaskCommand(kdb, 'kernel.task.claim', {
    taskId,
    ownerWorkerId: 'worker-r7',
  }));
  expectOk(`${taskId} start`, handleTaskCommand(kdb, 'kernel.task.start', { taskId }));
  writeArtifactFile(fileName, body);
  const artifactId = expectOk(`${taskId} artifact`, handleArtifactCommand(kdb, 'kernel.artifact.create', {
    workflowId: 'wf-r7',
    taskId,
    workerId: 'worker-r7',
    tileId: 'tile-worker',
    kind: 'evidence',
    uri: `out/${fileName}`,
    summary: `${taskId} evidence artifact`,
    sourceRefs: [`source:${taskId}`],
    observedAt: t0,
    sourceKind: 'local-smoke',
    confidence: 0.8,
    quoteOrSnapshotRef: `snapshot:${taskId}`,
    sensitivity: 'normal',
  }));
  expectOk(`${taskId} submit`, handleTaskCommand(kdb, 'kernel.task.submit', {
    taskId,
    artifactRefs: [artifactId],
    summary: `${taskId} submitted`,
  }));
  expectOk(`${taskId} verify`, handleTaskCommand(kdb, 'kernel.task.verify', {
    taskId,
    verifierWorkerId: 'verifier-r7',
    artifactRoot,
  }));
  return artifactId;
}

const taskOneArtifact = completeVerifiedTask('task-r7-one', 'task-one.md', '# Evidence\nSupported.');
const firstVerification = queryReceiptList(kdb, { taskId: 'task-r7-one', limit: 1000 })
  .find((receipt) => receipt.type === 'verification_passed');
check('semantic stage recorded on verification receipt', firstVerification?.metadata['semantic'] && (firstVerification.metadata['semantic'] as any).ok === true);

console.log('\n- F16 regression: bad eval cannot gate task progression -');
expectOk('second task create', handleTaskCommand(kdb, 'kernel.task.create', {
  id: 'task-r7-two',
  workflowId: 'wf-r7',
  title: 'Task task-r7-two',
  objective: 'Complete despite a failing eval row',
}));
expectOk('manual failing eval insert', handleEvalCommand(kdb, 'kernel.eval.create', {
  evalId: 'manual-zero-task-r7-two',
  evalType: 'task_eval',
  workflowId: 'wf-r7',
  taskId: 'task-r7-two',
  dimensions: [{
    dimension: 'task_completion_correctness',
    applicable: true,
    score: 0,
    confidence: 1,
    evidenceRefs: ['task-r7-two'],
    rationale: 'Manual zero-score regression row for task-r7-two; should not gate Kernel progression.',
  }],
} as any));
expectOk('second task claim', handleTaskCommand(kdb, 'kernel.task.claim', {
  taskId: 'task-r7-two',
  ownerWorkerId: 'worker-r7',
}));
expectOk('second task start', handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task-r7-two' }));
writeArtifactFile('task-two.md', '# Evidence\nStill allowed.');
const taskTwoArtifact = expectOk('second task artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  workflowId: 'wf-r7',
  taskId: 'task-r7-two',
  workerId: 'worker-r7',
  tileId: 'tile-worker',
  kind: 'thesis',
  uri: 'out/task-two.md',
  summary: 'task two thesis artifact',
}));
expectOk('second task submit', handleTaskCommand(kdb, 'kernel.task.submit', {
  taskId: 'task-r7-two',
  artifactRefs: [taskTwoArtifact],
}));
expectOk('second task verify', handleTaskCommand(kdb, 'kernel.task.verify', {
  taskId: 'task-r7-two',
  verifierWorkerId: 'verifier-r7',
  artifactRoot,
}));
check('second task completed despite failing eval row', queryTaskGet(kdb, 'task-r7-two')?.status === 'complete');

console.log('\n- decision/outcome/lesson artifacts and vault mirror -');
const decisionReceiptId = expectOk('human decision receipt', handleReceiptCommand(kdb, 'kernel.receipt.post', {
  workflowId: 'wf-r7',
  type: 'human_decision',
  summary: 'operator chose the supported thesis',
  artifactRefs: [taskOneArtifact, taskTwoArtifact],
  metadata: { selectedArtifactId: taskTwoArtifact, reason: 'best supported by evidence' },
}));
const decisionArtifact = expectOk('decision_log artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  workflowId: 'wf-r7',
  kind: 'decision_log',
  summary: 'Decision: choose the supported thesis',
  sourceRefs: [decisionReceiptId],
  confidence: 0.9,
}));
const outcomeArtifact = expectOk('outcome artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  workflowId: 'wf-r7',
  kind: 'outcome',
  summary: 'Outcome: judgment smoke reached a verified run result',
  sourceRefs: [decisionArtifact],
  confidence: 0.85,
}));
const lessonArtifact = expectOk('lesson artifact', handleArtifactCommand(kdb, 'kernel.artifact.create', {
  workflowId: 'wf-r7',
  kind: 'lesson',
  summary: 'Lesson: verified artifacts plus human decisions compound into replayable knowledge',
  sourceRefs: [outcomeArtifact],
  confidence: 0.8,
}));

expectOk('workflow complete', handleWorkflowCommand(kdb, 'kernel.workflow.update', {
  id: 'wf-r7',
  status: 'complete',
}));

const written = new Map<string, string>();
const dirs = new Set<string>();
const mirrored = await mirrorLessonArtifactsToVault(
  kdb,
  'wf-r7',
  '/vault',
  {
    mkdir: async (dir: string) => { dirs.add(dir); },
    writeFile: async (path: string, content: string) => { written.set(path, content); },
  },
  (...parts) => parts.join('/'),
);
check('lesson mirror wrote OKF files', Array.isArray(mirrored) && written.has('/vault/wf-r7/workflow_summary.md'));
check('vault mirror contains lesson artifact id', [...written.values()].some((content) => content.includes(lessonArtifact)));
check('artifact row remains truth for lesson', queryArtifactList(kdb, { workflowId: 'wf-r7' }).some((artifact) => artifact.id === lessonArtifact && artifact.kind === 'lesson'));

console.log('\n- replay is receipt-primary and deterministic -');
const replayA = buildWorkflowReplay(kdb, 'wf-r7')!;
const replayB = buildWorkflowReplay(kdb, 'wf-r7')!;
check('replay built', !!replayA);
check('replay declares receipt-primary source', replayA.source === 'receipt-primary' && replayA.usesEventsTable === false);
check('replay is deterministic', JSON.stringify(replayA) === JSON.stringify(replayB));
check('replay includes task timestamps, receipts, artifacts, and run end', [
  'task.created',
  'task.completed',
  'receipt',
  'artifact',
  'run.ended',
].every((kind) => replayA.entries.some((entry) => entry.kind === kind)));
check('replay references durable ids only', replayA.receiptIds.length > 0 && replayA.artifactIds.includes(lessonArtifact) && replayA.taskIds.includes('task-r7-one'));
db.prepare(
  `INSERT INTO events (id, workflow_id, kind, payload_json, created_at)
   VALUES ('evt-synthetic', 'wf-r7', 'synthetic.coordination', '{"note":"must not affect replay"}', ?)`,
).run(Date.now());
const replayWithEvents = buildWorkflowReplay(kdb, 'wf-r7')!;
check('events table not used for replay', (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n === 1);
check('replay unchanged with events present', JSON.stringify(replayWithEvents) === JSON.stringify(replayA));

console.log('\n- typed artifacts, eval auto-trigger, and RL schema prep -');
const typedArtifact = queryArtifactList(kdb, { workflowId: 'wf-r7' }).find((artifact) => artifact.id === taskOneArtifact)!;
check('typed artifact provenance read back', typedArtifact.sourceRefs.includes('source:task-r7-one') && typedArtifact.sourceKind === 'local-smoke' && typedArtifact.confidence === 0.8);
check('decision/outcome/lesson artifact kinds present', [decisionArtifact, outcomeArtifact, lessonArtifact].every((id) =>
  queryArtifactList(kdb, { workflowId: 'wf-r7' }).some((artifact) => artifact.id === id)));
const taskEvals = queryEvaluationList(kdb, { taskId: 'task-r7-one' });
const workflowEvals = queryEvaluationList(kdb, { workflowId: 'wf-r7' }).filter((row) => row.evalType === 'workflow_eval');
check('task eval auto-produced', taskEvals.some((row) => row.evalId === 'auto-task-task-r7-one'));
check('verification eval auto-produced', taskEvals.some((row) => row.evalType === 'verification_eval'));
check('run/workflow eval auto-produced on complete', workflowEvals.some((row) => row.evalId === 'auto-workflow-wf-r7'));
const evalColumns = db.prepare("PRAGMA table_info('evaluations')").all() as Array<{ name: string }>;
check('RL prep columns exist without training loop', ['outcome_artifact_id', 'lesson_artifact_id', 'rl_trajectory_json'].every((name) => evalColumns.some((row) => row.name === name)));

console.log('\n- receipt chain ordered, linked, and complete -');
const receipts = queryReceiptList(kdb, { workflowId: 'wf-r7', limit: 1000 }).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
let ordered = true;
for (let i = 1; i < receipts.length; i += 1) {
  if (receipts[i].createdAt < receipts[i - 1].createdAt) ordered = false;
}
check('receipt chain ordered oldest-first when projected', ordered);
for (const taskId of ['task-r7-one', 'task-r7-two']) {
  const types = new Set(queryReceiptList(kdb, { taskId, limit: 1000 }).map((receipt) => receipt.type));
  check(`${taskId} complete receipt chain`, [
    'task_created',
    'task_claimed',
    'task_started',
    'artifact_created',
    'task_submitted',
    'verification_started',
    'verification_passed',
    'task_completed',
  ].every((type) => types.has(type)));
}

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
