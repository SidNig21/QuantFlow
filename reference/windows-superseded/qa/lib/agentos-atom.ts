import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { handleReceiptCommand } from '../../src/kernel/receipts/index';
import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleWorkerCommand } from '../../src/kernel/commands/worker-commands';
import { setKernelDbForTesting } from '../../src/kernel/database';
import { seedHarnessRegistry, queryWorkerForTile } from '../../src/kernel/worker-instances/index';
import { createSimApprovalGate } from '../../src/harness/agentos/approval-gate';
import { createAgentOsHarness } from '../../src/harness/agentos/index';
import { createSimTransport, simStepsFromFixtureEvents } from '../../src/harness/agentos/sim-transport';
import { countMilestoneReceiptsForEvents } from '../../src/harness/agentos/translator';
import { runKernelMigrations } from './kernel-memory-db';

const FIXTURE = join(
  import.meta.dir,
  '..',
  '..',
  'src',
  'harness',
  'agentos',
  'fixtures',
  'tier2-events-trimmed.jsonl',
);

function loadFixtureEvents(): unknown[] {
  return readFileSync(FIXTURE, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

function setupHeadlessDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  runKernelMigrations(db);
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf-agentos', 'AgentOS Atom', 'qa agentos-atom', 'active', ?, ?, ?)`,
  ).run('/tmp/agentos-atom', Date.now(), Date.now());
  return db;
}

function milestoneLabel(draft: { type: string; metadata?: Record<string, unknown> }): string {
  const milestone = draft.metadata?.['milestone'];
  if (typeof milestone === 'string') return milestone;
  return draft.type;
}

export async function runAgentOsAtomCheck(): Promise<boolean> {
  const events = loadFixtureEvents();
  const chunkOnly = Array.from({ length: 55 }, () => ({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sim',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'chunk' },
      },
    },
  }));
  const chunkReceiptCount = countMilestoneReceiptsForEvents(chunkOnly, { harnessKind: 'agentos' });
  if (chunkReceiptCount > 3) {
    console.error(`agentos-atom: expected O(1) receipts for ${chunkOnly.length} chunks, got ${chunkReceiptCount}`);
    return false;
  }

  const workspace = mkdtempSync(join(tmpdir(), 'qf-agentos-atom-'));
  const artifactVmPath = '/workspace/tier2-result.txt';
  const artifactBody = 'bindings-approved-hello';
  const gate = createSimApprovalGate(60);
  const transport = createSimTransport({
    steps: simStepsFromFixtureEvents(events, {
      permissionAtIndex: 5,
      permission: {
        requestId: 'perm-atom-1',
        action: 'write tier2 result file',
        source: 'acp',
      },
      artifactPath: artifactVmPath,
      artifactBody,
    }),
  });
  const harness = createAgentOsHarness({ transport, workspace, approvalGate: gate });

  const handle = await harness.spawn({
    tileId: 'tile_agentos',
    roleId: 'worker_agentos',
    workflowId: 'wf-agentos',
    cwd: workspace,
  });

  try {
    await harness.send(handle, {
      text: 'Execute governed AgentOS task',
      taskId: 'task_agentos',
      workflowId: 'wf-agentos',
      artifactRoot: workspace,
    });
  } catch (error) {
    console.error('agentos-atom: harness send failed:', error);
    return false;
  }

  const drafts = await harness.collectReceipts(handle);
  const labels = drafts.map((d) => milestoneLabel(d));

  const startIdx = labels.indexOf('session.start');
  const firstToolIdx = labels.findIndex((l) => l === 'tool.started');
  const approvalReqIdx = labels.indexOf('approval.requested');
  const approvalGrantIdx = labels.indexOf('approval.granted');
  const artifactIdx = labels.findIndex((l) => l === 'artifact.created' || l === 'task_submitted');
  const completeIdx = labels.indexOf('turn.complete');

  if (startIdx < 0 || firstToolIdx < 0 || approvalReqIdx < 0 || approvalGrantIdx < 0 || completeIdx < 0) {
    console.error('agentos-atom: missing expected milestones in chain:', labels.join(' → '));
    return false;
  }
  if (!(startIdx < firstToolIdx && firstToolIdx < approvalReqIdx && approvalReqIdx < approvalGrantIdx)) {
    console.error('agentos-atom: tool/approval order wrong:', labels.join(' → '));
    return false;
  }
  if (artifactIdx >= 0 && !(approvalGrantIdx < artifactIdx && artifactIdx < completeIdx)) {
    console.error('agentos-atom: artifact/complete order wrong:', labels.join(' → '));
    return false;
  }
  if (gate.records.length !== 1 || (gate.records[0]?.blockedMs ?? 0) <= 0) {
    console.error(`agentos-atom: approval gate did not block (records=${gate.records.length})`);
    return false;
  }

  const approvalToolCompletedIdx = labels.findIndex(
    (l, i) => l === 'tool.completed' && i > approvalGrantIdx && labels[i - 1] !== 'approval.granted',
  );
  if (approvalToolCompletedIdx >= 0 && approvalToolCompletedIdx < approvalGrantIdx) {
    console.error('agentos-atom: tool completed before approval granted');
    return false;
  }

  const db = setupHeadlessDb();
  setKernelDbForTesting(db);
  try {
    seedHarnessRegistry(db);
    handleTileCommand(db, 'kernel.tile.create', {
      id: 'tile_agentos',
      workflowId: 'wf-agentos',
      displayName: 'AgentOS Worker',
      tileKind: 'worker',
    });
    handleWorkerCommand(db, 'kernel.worker.spawn', {
      tileId: 'tile_agentos',
      workflowId: 'wf-agentos',
      harnessKind: 'agentos',
      roleName: 'Agent',
    });
    handleTaskCommand(db, 'kernel.task.create', {
      id: 'task_agentos',
      workflowId: 'wf-agentos',
      correlationId: 'corr_agentos',
      title: 'AgentOS atom',
      objective: 'Prove AgentOS harness receipt chain.',
    });

    const workerId = queryWorkerForTile(db, 'tile_agentos');
    if (!workerId) {
      console.error('agentos-atom: worker not found after spawn');
      return false;
    }

    for (const draft of drafts) {
      const result = handleReceiptCommand(db, 'kernel.receipt.post', {
        type: draft.type,
        taskId: draft.taskId ?? 'task_agentos',
        workflowId: 'wf-agentos',
        workerId,
        tileId: 'tile_agentos',
        summary: draft.summary,
        artifactRefs: draft.artifactRefs ?? [],
        metadata: draft.metadata ?? {},
      });
      if (!result.ok) {
        console.error(`agentos-atom: kernel.receipt.post rejected type=${draft.type}: ${result.error}`);
        return false;
      }
    }
  } finally {
    setKernelDbForTesting(null);
    db.close();
  }

  await harness.stop(handle);
  return true;
}
