/**
 * PF0 perf-trace smoke — flag-off no-op + flag-on span anchors.
 *
 * Run: bun run smoke:perf-trace   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { dispatchKernelCommand } from '../../src/kernel/commands/index';
import { setKernelDbForTesting } from '../../src/kernel/database';
import { emitKernelEvent } from '../../src/kernel/events/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleTaskCommand, queryTaskGet } from '../../src/kernel/tasks/index';
import { handleArtifactCommand, handleReceiptCommand, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryWorkerForTile, queryWorkerGet, seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { createConductorActions } from '../../src/main/conductor/conductor-actions';
import { createConductorLoop } from '../../src/main/conductor/conductor-loop';
import { proposeNextAction } from '../../src/main/conductor/conductor-planner';
import { handleConductorCommand, queryConductorContext } from '../../src/kernel/conductor/index';
import { createMockHarness } from '../../src/harness/mock/index';
import {
  getHarnessStreamBytes,
  isValidSpan,
  readSpanLinesFromDir,
  recordRendererProjectionSpan,
  resetTraceState,
  wrapIpcInvokeHandler,
  traceHarnessSpawn,
  ingestPtyStreamBytes,
} from '../../src/kernel/perf/trace';

const WORKER = process.env.QF_PERF_SMOKE_WORKER === '1';

let failures = 0;
function check(label: string, cond: boolean): void {
  const log = WORKER ? console.error : console.log;
  if (cond) log(`  PASS  ${label}`);
  else { failures += 1; log(`  FAIL  ${label}`); }
}

function countPerfFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.jsonl') || f === 'latest-summary.md').length;
  } catch {
    return 0;
  }
}

function normalizeReceipts(receipts: ReturnType<typeof queryReceiptList>): string {
  return JSON.stringify(receipts.map((r, i) => ({
    i,
    type: r.type,
    summary: r.summary,
    taskId: r.taskId ? '<taskId>' : null,
    workflowId: r.workflowId ? '<workflowId>' : null,
    workerId: r.workerId ? '<workerId>' : null,
    tileId: r.tileId ? '<tileId>' : null,
    correlationId: r.correlationId ? '<correlationId>' : null,
    artifactRefs: r.artifactRefs.map(() => '<artifactId>'),
    parentReceiptId: r.parentReceiptId ? '<parentReceiptId>' : null,
    legacy: r.metadata?.['legacy'] === true,
    idempotent: r.metadata?.['idempotent'] === true,
    openedArtifactCount: Array.isArray((r.metadata?.['structural'] as Record<string, unknown> | undefined)?.['openedArtifacts'])
      ? ((r.metadata['structural'] as Record<string, unknown>).openedArtifacts as unknown[]).length
      : 0,
  })));
}

function setupDb(): { db: Database; artifactRoot: string } {
  const migrationsDir = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const file of [
    '001-v3-baseline.sql',
    '002-evaluations.sql',
    '003-r1-worker-task-binding.sql',
    '004-r3-workflow-instance.sql',
    '005-r4-runtime.sql',
    '006-r2-artifact-lineage.sql',
    '007-r7-typed-artifacts.sql',
    '008-d0-tile-extensions.sql',
  ]) {
    db.exec(readFileSync(join(migrationsDir, file), 'utf-8'));
  }
  const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-perf-trace-'));
  const now = Date.now();
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf1', 'PF0 Atom', 'Prove perf trace', 'active', ?, ?, ?)`,
  ).run(artifactRoot, now, now);
  writeFileSync(resolve(artifactRoot, 'proof.txt'), 'pf0 proof', 'utf-8');
  return { db, artifactRoot };
}

async function runTaskAtom(db: Database, artifactRoot: string): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const kdb = db as any;
  setKernelDbForTesting(kdb);
  try {
    seedHarnessRegistry(kdb);
    startStateCardWatcher(kdb);

    handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Worker', tileKind: 'worker' });
    handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
    handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_w', workflowId: 'wf1', harnessKind: 'mock', roleName: 'Coder' });
    handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_w', status: 'active' });
    handleWorkerCommand(kdb, 'kernel.worker.spawn', { tileId: 'tile_v', workflowId: 'wf1', harnessKind: 'mock', roleName: 'Verifier' });
    handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId: 'tile_v', status: 'active' });
    const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v')!;
    const mock = createMockHarness({ artifactRoot });

    const dispatch = async (type: string, payload: Record<string, unknown>) => {
      if (type.startsWith('kernel.task.')) return handleTaskCommand(kdb, type, payload);
      if (type.startsWith('kernel.artifact.')) return handleArtifactCommand(kdb, type, payload);
      if (type.startsWith('kernel.receipt.')) return handleReceiptCommand(kdb, type, payload);
      if (type.startsWith('kernel.worker.')) return handleWorkerCommand(kdb, type, payload);
      if (type.startsWith('kernel.conductor.')) return handleConductorCommand(kdb, type, payload);
      return dispatchKernelCommand(type, payload, 'smoke');
    };

    const actions = createConductorActions(dispatch, {
      getTask: (taskId) => queryTaskGet(kdb, taskId),
      getWorker: (workerId) => queryWorkerGet(kdb, workerId),
      getWorkerHarness: (kind) => {
        if (kind !== 'mock') throw new Error(`unexpected harness: ${kind}`);
        return mock;
      },
    });

    await dispatchKernelCommand('kernel.task.create', {
      id: 'task_atom',
      workflowId: 'wf1',
      correlationId: 'corr_atom',
      title: 'Write proof',
      objective: 'Write the PF0 proof artifact.',
    }, 'smoke');

    emitKernelEvent({
      kind: 'task.created',
      workflowId: 'wf1',
      taskId: 'task_atom',
      data: { id: 'task_atom' },
    });

    await actions.runAction('assign_task', {
      taskId: 'task_atom',
      tileId: 'tile_w',
      deliver: true,
      harnessKind: 'mock',
      artifactRoot,
      attemptId: 'attempt-1',
    });

    await actions.runAction('verify_task', {
      taskId: 'task_atom',
      verifierWorkerId,
      verdict: 'pass',
      artifactRoot,
      attemptId: 'attempt-1',
    });

    const loop = createConductorLoop({
      readContext: (workflowId) => queryConductorContext(kdb, workflowId),
      propose: proposeNextAction,
      runAction: (action, args) => actions.runAction(action, args),
      postDecision: (input) => handleConductorCommand(kdb, 'kernel.conductor.plan', {
        workflowId: input.workflowId,
        summary: input.summary,
        metadata: {
          phase: input.phase,
          proposal: input.proposal,
          proposalToken: input.proposalToken,
          requestApproval: input.requestApproval,
        },
      }),
      hasPendingApproval: () => false,
    });
    await loop.step({ workflowId: 'wf1' });

    return normalizeReceipts(queryReceiptList(kdb, { taskId: 'task_atom' }));
  } finally {
    setKernelDbForTesting(null);
  }
}

function anchorMatchers(): Array<{ layer: string; name: string | RegExp }> {
  return [
    { layer: 'kernel', name: 'kernel.event.fanout' },
    { layer: 'kernel', name: 'kernel.command' },
    { layer: 'receipt', name: 'receipt.post' },
    { layer: 'artifact', name: 'artifact.create' },
    { layer: 'artifact', name: 'artifact.verify' },
    { layer: 'ipc', name: 'ipc.invoke' },
    { layer: 'conductor', name: 'conductor.plan.started' },
    { layer: 'harness', name: 'harness.spawn.started' },
    { layer: 'canvas', name: 'renderer.projection.refresh' },
  ];
}

function hasAnchor(spans: ReturnType<typeof readSpanLinesFromDir>, layer: string, name: string | RegExp): boolean {
  return spans.some((s) => s.layer === layer
    && (typeof name === 'string' ? s.name === name : name.test(s.name))
    && s.duration_ms != null
    && s.duration_ms >= 0);
}

async function runWorkerPhase(mode: 'off' | 'on', perfDir: string): Promise<{ receipts: string; perfFiles: number; spans: number }> {
  resetTraceState();
  if (mode === 'off') {
    delete process.env.QUANTFLOW_TRACE;
    delete process.env.QF_PERF_TRACE;
  } else {
    process.env.QUANTFLOW_TRACE = '1';
  }
  process.env.QF_PERF_DIR = perfDir;

  const { db, artifactRoot } = setupDb();
  const receipts = await runTaskAtom(db, artifactRoot);
  db.close();

  if (mode === 'on') {
    const ipcWrapped = wrapIpcInvokeHandler('smoke:test', async () => ({ ok: true }));
    await ipcWrapped();
    recordRendererProjectionSpan(3, { workflow_id: 'wf1' });
    await traceHarnessSpawn('tile_w', async () => undefined);
    const spansBeforePty = readSpanLinesFromDir(perfDir).length;
    for (let i = 0; i < 50; i += 1) {
      ingestPtyStreamBytes('sess-smoke', `line-${i}\n`);
    }
    const spanCount = readSpanLinesFromDir(perfDir).length;
    check('pty byte counter does not grow span count per line', spanCount === spansBeforePty);
    check('pty byte counter aggregates stdout bytes', getHarnessStreamBytes('sess-smoke').stdout > 0);
    return { receipts, perfFiles: countPerfFiles(perfDir), spans: spanCount };
  }

  return { receipts, perfFiles: countPerfFiles(perfDir), spans: 0 };
}

async function spawnPhase(mode: 'off' | 'on', perfDir: string): Promise<{ receipts: string; perfFiles: number; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: ['bun', import.meta.path],
    env: {
      ...process.env,
      QF_PERF_SMOKE_WORKER: '1',
      QF_PERF_SMOKE_MODE: mode,
      QF_PERF_DIR: perfDir,
      QUANTFLOW_TRACE: mode === 'on' ? '1' : '',
      QF_PERF_TRACE: '',
    },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  const marker = text.indexOf('__QF_PERF_RESULT__');
  if (marker < 0) {
    console.error(text);
    return { receipts: '', perfFiles: -1, exitCode: exitCode || 1 };
  }
  const payload = JSON.parse(text.slice(marker + '__QF_PERF_RESULT__'.length).trim()) as {
    receipts: string;
    perfFiles: number;
  };
  return { ...payload, exitCode };
}

async function workerMain(): Promise<void> {
  const mode = process.env.QF_PERF_SMOKE_MODE === 'on' ? 'on' : 'off';
  const perfDir = process.env.QF_PERF_DIR ?? mkdtempSync(join(tmpdir(), 'qf-perf-worker-'));
  const result = await runWorkerPhase(mode, perfDir);
  console.log(`__QF_PERF_RESULT__${JSON.stringify(result)}`);
  process.exit(failures === 0 ? 0 : 1);
}

async function orchestratorMain(): Promise<void> {
  delete process.env.QUANTFLOW_TRACE;
  delete process.env.QF_PERF_TRACE;
  delete process.env.QF_PERF_DIR;
  delete process.env.QF_PERF_SMOKE_WORKER;
  delete process.env.QF_PERF_SMOKE_MODE;
  console.log('— PF0 smoke:perf-trace —\n');

  const perfDirOff = mkdtempSync(join(tmpdir(), 'qf-perf-off-'));
  const perfDirOn = mkdtempSync(join(tmpdir(), 'qf-perf-on-'));

  console.log('Phase A — QUANTFLOW_TRACE unset');
  const off = await spawnPhase('off', perfDirOff);
  check('phase A subprocess exit 0', off.exitCode === 0);
  check('flag off writes zero perf files', off.perfFiles === 0);

  console.log('\nPhase B — QUANTFLOW_TRACE=1');
  const on = await spawnPhase('on', perfDirOn);
  check('phase B subprocess exit 0', on.exitCode === 0);
  check('flag on receipts match flag off', off.receipts === on.receipts);

  delete process.env.QUANTFLOW_TRACE;
  process.env.QF_PERF_DIR = perfDirOn;
  resetTraceState();
  const spans = readSpanLinesFromDir(perfDirOn);
  check('at least one span line written', spans.length > 0);
  for (const span of spans) {
    check(`span ${span.name} parses to Span shape`, isValidSpan(span));
    check(`span ${span.name} has duration_ms`, span.duration_ms != null);
  }
  for (const anchor of anchorMatchers()) {
    check(`anchor ${anchor.layer}/${String(anchor.name)}`, hasAnchor(spans, anchor.layer, anchor.name));
  }

  try { rmSync(perfDirOff, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(perfDirOn, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

if (WORKER) {
  void workerMain();
} else {
  void orchestratorMain();
}
