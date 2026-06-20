/**
 * Harness interface smoke (Goal 6).
 *
 * Proves the full WorkerHarness contract (spawn/send/readState/collectReceipts/
 * stop) for local-shell and herdr-shell adapters, that role ≠ harness ≠ model
 * stays separate, that receipts post through the Kernel receipt chain, and that
 * State Cards reflect Kernel-owned worker status (not terminal-log scraping).
 *
 * The adapters run over INJECTED runtime ops backed by the real in-memory Kernel
 * handlers — exactly the seam the live Electron ops fill (approved shell
 * role-spawn path + PTY/herdr + Kernel queries/commands).
 *
 * Run: bun scripts/harness-interface-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { handleReceiptCommand, queryReceiptList } from '../../src/kernel/receipts/index';
import { queryStateCardGet } from '../../src/kernel/state-cards/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { seedHarnessRegistry, queryWorkerForTile, queryWorkerGet } from '../../src/kernel/worker-instances/index';
import { createHarness, HARNESS_DESCRIPTORS } from '../../src/harness/registry';
import type { HarnessRuntimeOps, SpawnWorkerInput } from '../../src/harness/types';

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

// Injected runtime ops backed by the real Kernel handlers. Mirrors the live
// Electron ops: startRuntime goes through worker.spawn (the 6A gate), records
// runtime ids, and Kernel owns status/state cards/receipts.
const sent: { tileId: string; text: string }[] = [];
const stopped: string[] = [];
const startInputs: SpawnWorkerInput[] = [];

const ops: HarnessRuntimeOps = {
  async startRuntime(input) {
    startInputs.push(input);
    const tileId = input.tileId ?? `tile-${input.harnessKind}`;
    handleTileCommand(kdb, 'kernel.tile.create', {
      id: tileId,
      workflowId: input.workflowId ?? null,
      displayName: input.roleName ?? 'worker',
      tileKind: 'worker',
    });
    handleWorkerCommand(kdb, 'kernel.worker.spawn', {
      tileId,
      workflowId: input.workflowId,
      roleName: input.roleName,
      harnessKind: input.harnessKind,
      runtimeTarget: input.runtimeTarget,
    });
    const workerId = queryWorkerForTile(kdb, tileId)!;
    const handle = { workerId, tileId, kind: input.harnessKind! };
    if (input.harnessKind === 'herdr-shell') {
      handleWorkerCommand(kdb, 'kernel.worker.status_update', {
        tileId, status: 'active', herdrPaneId: `pane-${tileId}`, envoySpaceId: 'space-1',
      });
      return { ...handle, herdrPaneId: `pane-${tileId}`, envoySpaceId: 'space-1' };
    }
    handleWorkerCommand(kdb, 'kernel.worker.status_update', { tileId, status: 'active' });
    return { ...handle, ptySessionId: `pty-${tileId}` };
  },
  async sendInput(handle, text) { sent.push({ tileId: handle.tileId, text }); },
  async stopRuntime(handle) {
    stopped.push(handle.tileId);
    handleWorkerCommand(kdb, 'kernel.worker.stop', { tileId: handle.tileId });
  },
  async readStateCard(tileId) {
    const c = queryStateCardGet(kdb, tileId);
    return c ? { status: c.status, blocker: c.blocker, lastMeaningfulUpdate: c.lastMeaningfulUpdate, nextAction: c.nextAction } : null;
  },
  async drainReceipts(handle) {
    return [{ type: 'progress', summary: `progress from ${handle.tileId}`, metadata: { workerId: handle.workerId } }];
  },
};

console.log('— registry exposes shipped shell kinds plus R1 mock/eve kinds (pi deferred) —');
check('four harness descriptors', HARNESS_DESCRIPTORS.length === 4);
check('mock + eve descriptors registered', HARNESS_DESCRIPTORS.some((d) => d.kind === 'mock') && HARNESS_DESCRIPTORS.some((d) => d.kind === 'eve-harness'));
check('createHarness(local-shell) builds an adapter', createHarness('local-shell', ops).kind === 'local-shell');
check('createHarness(herdr-shell) builds an adapter', createHarness('herdr-shell', ops).kind === 'herdr-shell');
check('createHarness(mock) builds an adapter without shell ops', createHarness('mock').kind === 'mock');
check('createHarness(eve-harness) builds an adapter without shell ops', createHarness('eve-harness').kind === 'eve-harness');

const baseConfig: SpawnWorkerInput = {
  roleName: 'Coder',
  modelProvider: 'local',
  modelName: 'default',
  workflowId: 'wf1',
  permissions: { shell: 'execute' },
  skills: ['code'],
  activationPrompt: 'Begin work on the loader.',
};

for (const kind of ['local-shell', 'herdr-shell'] as const) {
  console.log(`\n— ${kind}: full WorkerHarness contract —`);
  const harness = createHarness(kind, ops);
  const handle = await harness.spawn({ ...baseConfig, tileId: `tile-${kind}` });

  check('spawn returns a handle with workerId + kind', Boolean(handle.workerId) && handle.kind === kind);
  const worker = queryWorkerGet(kdb, handle.workerId)!;
  check('worker tied to the workflow', worker.workflowId === 'wf1');
  check('role ≠ harness ≠ model (all separate + populated)',
    Boolean(worker.roleId) && Boolean(worker.harnessId) && Boolean(worker.modelId) &&
    worker.roleId !== worker.harnessId && worker.harnessId !== worker.modelId);
  check('harness id matches the kind', worker.harnessId === `harness-${kind}`);
  check('runtime received role/model/permissions/workflow/activation',
    startInputs.at(-1)?.roleName === 'Coder' &&
    startInputs.at(-1)?.modelProvider === 'local' &&
    !!startInputs.at(-1)?.permissions &&
    startInputs.at(-1)?.workflowId === 'wf1' &&
    !!startInputs.at(-1)?.activationPrompt);
  if (kind === 'herdr-shell') {
    check('herdr runtime ids recorded on the worker', worker.herdrPaneId === `pane-tile-${kind}` && worker.envoySpaceId === 'space-1');
  }

  await harness.send(handle, { text: 'run tests' });
  check('send delivers input to the runtime', sent.at(-1)?.tileId === handle.tileId && sent.at(-1)?.text === 'run tests\n');

  const state = await harness.readState(handle);
  check('readState reflects Kernel worker status (not logs)', state.status === 'active');

  const drafts = await harness.collectReceipts(handle);
  check('collectReceipts returns drafts', drafts.length === 1 && drafts[0]!.type === 'progress');
  // Drafts post through the Kernel receipt chain (not a parallel path).
  handleReceiptCommand(kdb, 'kernel.receipt.post', {
    type: drafts[0]!.type, summary: drafts[0]!.summary, workflowId: 'wf1', tileId: handle.tileId,
  });
  check('receipt posted through Kernel chain', queryReceiptList(kdb, { workflowId: 'wf1' }).some((r) => r.summary === drafts[0]!.summary));

  await harness.stop(handle);
  check('stop tears down runtime + Kernel marks stopped',
    stopped.includes(handle.tileId) && queryWorkerGet(kdb, handle.workerId)?.status === 'stopped');
}

console.log('\n— same workflow hosts both harness kinds —');
check('local + herdr workers both in wf1', queryWorkerGet(kdb, queryWorkerForTile(kdb, 'tile-local-shell')!)?.workflowId === 'wf1' && queryWorkerGet(kdb, queryWorkerForTile(kdb, 'tile-herdr-shell')!)?.workflowId === 'wf1');

console.log('\n— guard —');
try {
  // @ts-expect-error unknown kind
  createHarness('pi', ops);
  check('unknown/deferred harness kind throws', false);
} catch {
  check('unknown/deferred harness kind throws', true);
}

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
