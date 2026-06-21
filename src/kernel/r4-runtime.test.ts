import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkerCommand } from './commands/worker-commands';
import { handleArtifactCommand, queryArtifactList, queryReceiptList } from './receipts/index';
import { handleTaskCommand, queryTaskGet } from './tasks/index';
import { queryWorkerGet } from './worker-instances/index';

function makeDb(): any {
  const migrationsDir = join(import.meta.dir, 'migrations');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(join(migrationsDir, '001-v3-baseline.sql'), 'utf-8'));
  db.exec(readFileSync(join(migrationsDir, '003-r1-worker-task-binding.sql'), 'utf-8'));
  db.exec(readFileSync(join(migrationsDir, '005-r4-runtime.sql'), 'utf-8'));
  const now = 1000;
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf1', 'wf', 'o', 'active', NULL, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at)
     VALUES ('tile_owner', 'wf1', 'owner', 'worker', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at)
     VALUES ('tile_verifier', 'wf1', 'verifier', 'worker', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO worker_instances
       (id, tile_id, workflow_id, status, auth_status, last_seen, created_at, updated_at)
     VALUES ('w_owner', 'tile_owner', 'wf1', 'idle', 'unknown', NULL, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO worker_instances
       (id, tile_id, workflow_id, status, auth_status, last_seen, created_at, updated_at)
     VALUES ('w_verifier', 'tile_verifier', 'wf1', 'idle', 'unknown', NULL, ?, ?)`,
  ).run(now, now);
  return db;
}

function countReceipts(db: any, taskId: string, type: string): number {
  return (queryReceiptList(db, { taskId }).filter((r) => r.type === type)).length;
}

describe('R4 runtime Kernel surface', () => {
  test('worker status_update rejects task-like statuses and records auth/liveness fields', () => {
    const db = makeDb();
    expect(handleWorkerCommand(db, 'kernel.worker.status_update', {
      workerId: 'w_owner',
      status: 'working',
    }).ok).toBe(false);

    const updated = handleWorkerCommand(db, 'kernel.worker.status_update', {
      workerId: 'w_owner',
      status: 'active',
      authStatus: 'ok',
      lastSeen: 1234,
    });
    expect(updated.ok).toBe(true);
    expect(queryWorkerGet(db, 'w_owner')).toMatchObject({
      status: 'active',
      authStatus: 'ok',
      lastSeen: 1234,
    });
  });

  test('task.recover returns non-terminal work to open and clears worker assignment', () => {
    const db = makeDb();
    expect(handleTaskCommand(db, 'kernel.task.create', {
      id: 'task1',
      workflowId: 'wf1',
      title: 'T',
      objective: 'O',
    }).ok).toBe(true);
    expect(handleTaskCommand(db, 'kernel.task.claim', { taskId: 'task1', ownerWorkerId: 'w_owner' }).ok).toBe(true);
    expect(queryWorkerGet(db, 'w_owner')?.status).toBe('assigned');
    expect(queryWorkerGet(db, 'w_owner')?.assignedTaskId).toBe('task1');

    const recovered = handleTaskCommand(db, 'kernel.task.recover', {
      taskId: 'task1',
      reason: 'worker stale',
    });
    expect(recovered.ok).toBe(true);
    expect(queryTaskGet(db, 'task1')).toMatchObject({ status: 'open', ownerWorkerId: null });
    expect(queryWorkerGet(db, 'w_owner')).toMatchObject({ status: 'idle', assignedTaskId: null });
    expect(countReceipts(db, 'task1', 'progress')).toBe(1);
  });

  test('attemptId makes artifact, submit, verify, and complete retries exactly-once', () => {
    const db = makeDb();
    const artifactRoot = join(tmpdir(), `qf-r4a-${Date.now()}`);
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(join(artifactRoot, 'proof.md'), 'done', 'utf-8');

    expect(handleTaskCommand(db, 'kernel.task.create', {
      id: 'task1',
      workflowId: 'wf1',
      title: 'T',
      objective: 'O',
    }).ok).toBe(true);
    expect(handleTaskCommand(db, 'kernel.task.claim', { taskId: 'task1', ownerWorkerId: 'w_owner' }).ok).toBe(true);
    expect(handleTaskCommand(db, 'kernel.task.start', { taskId: 'task1' }).ok).toBe(true);

    const artifactPayload = {
      workflowId: 'wf1',
      taskId: 'task1',
      workerId: 'w_owner',
      tileId: 'tile_owner',
      kind: 'file',
      uri: 'proof.md',
      summary: 'proof',
      metadata: { attemptId: 'att-1' },
    };
    const created1 = handleArtifactCommand(db, 'kernel.artifact.create', artifactPayload);
    const created2 = handleArtifactCommand(db, 'kernel.artifact.create', artifactPayload);
    expect(created1.ok).toBe(true);
    expect(created2.ok).toBe(true);
    expect((created2.data as Record<string, unknown>)['idempotent']).toBe(true);
    expect(queryArtifactList(db, { taskId: 'task1' })).toHaveLength(1);
    expect(countReceipts(db, 'task1', 'artifact_created')).toBe(1);

    const artifactId = created1.id as string;
    expect(handleTaskCommand(db, 'kernel.task.submit', {
      taskId: 'task1',
      artifactRefs: [artifactId],
      attemptId: 'att-1',
    }).ok).toBe(true);
    const submitRetry = handleTaskCommand(db, 'kernel.task.submit', {
      taskId: 'task1',
      artifactRefs: [artifactId],
      attemptId: 'att-1',
    });
    expect(submitRetry.ok).toBe(true);
    expect((submitRetry.data as Record<string, unknown>)['idempotent']).toBe(true);
    expect(countReceipts(db, 'task1', 'task_submitted')).toBe(1);

    expect(handleTaskCommand(db, 'kernel.task.verify', {
      taskId: 'task1',
      verifierWorkerId: 'w_verifier',
      verdict: 'pass',
      artifactRoot,
      attemptId: 'att-1',
    }).ok).toBe(true);
    const verifyRetry = handleTaskCommand(db, 'kernel.task.verify', {
      taskId: 'task1',
      verifierWorkerId: 'w_verifier',
      verdict: 'pass',
      artifactRoot,
      attemptId: 'att-1',
    });
    expect(verifyRetry.ok).toBe(true);
    expect((verifyRetry.data as Record<string, unknown>)['idempotent']).toBe(true);
    expect(queryTaskGet(db, 'task1')?.status).toBe('complete');
    expect(countReceipts(db, 'task1', 'verification_started')).toBe(1);
    expect(countReceipts(db, 'task1', 'verification_passed')).toBe(1);
    expect(countReceipts(db, 'task1', 'task_completed')).toBe(1);
  });
});
