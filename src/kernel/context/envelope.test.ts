import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setKernelDbForTesting } from '../database';
import { handleTileCommand } from '../commands/tile-commands';
import { handleTaskCommand, queryTaskGet } from '../tasks/index';
import { handleArtifactCommand, queryArtifactList } from '../receipts/index';
import { queryWorkerForTile, seedHarnessRegistry } from '../worker-instances/index';
import { buildContextEnvelope } from './envelope';

function makeDb(): Database {
  const db = new Database(':memory:');
  const migrationsDir = join(import.meta.dir, '..', 'migrations');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const migration of [
    '001-v3-baseline.sql',
    '002-evaluations.sql',
    '003-r1-worker-task-binding.sql',
    '004-r3-workflow-instance.sql',
    '005-r4-runtime.sql',
    '006-r2-artifact-lineage.sql',
  ]) {
    db.exec(readFileSync(join(migrationsDir, migration), 'utf-8'));
  }
  return db;
}

function expectOk(result: { ok: boolean; error?: string }): string {
  expect(result.ok, result.error).toBe(true);
  return result.id as string;
}

describe('ContextEnvelope v0', () => {
  afterEach(() => {
    setKernelDbForTesting(null);
  });

  test('projects verified normal upstream artifacts without mutating Kernel truth', () => {
    const db = makeDb();
    // deno-lint-ignore no-explicit-any
    const kdb = db as any;
    setKernelDbForTesting(kdb);
    const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-envelope-'));
    const now = Date.now();
    db.prepare(
      `INSERT INTO workflows
         (id, name, objective, status, mode, vault_path, created_at, updated_at)
       VALUES ('wf1', 'R2 Envelope', 'Project context references', 'active', 'research', ?, ?, ?)`,
    ).run(artifactRoot, now, now);
    seedHarnessRegistry(kdb);
    expectOk(handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Worker', tileKind: 'worker' }));
    expectOk(handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' }));
    const workerId = queryWorkerForTile(kdb, 'tile_w')!;
    const verifierWorkerId = queryWorkerForTile(kdb, 'tile_v')!;

    function createTask(id: string, title = id): void {
      expectOk(handleTaskCommand(kdb, 'kernel.task.create', {
        id,
        workflowId: 'wf1',
        correlationId: `corr_${id}`,
        title,
        objective: `${title} objective`,
      }));
    }

    function verifyTaskWithArtifact(id: string, body: string, metadata: Record<string, unknown> = {}): string {
      createTask(id, id);
      expectOk(handleTaskCommand(kdb, 'kernel.task.claim', { taskId: id, ownerWorkerId: workerId }));
      expectOk(handleTaskCommand(kdb, 'kernel.task.start', { taskId: id }));
      const fileName = `${id}.txt`;
      writeFileSync(join(artifactRoot, fileName), body, 'utf-8');
      const artifactId = expectOk(handleArtifactCommand(kdb, 'kernel.artifact.create', {
        workflowId: 'wf1',
        taskId: id,
        workerId,
        kind: 'file',
        uri: fileName,
        summary: `${id} artifact`,
        contentHash: createHash('sha256').update(body).digest('hex'),
        mediaType: 'text/plain',
        sizeBytes: Buffer.byteLength(body),
        metadata,
      }));
      expectOk(handleTaskCommand(kdb, 'kernel.task.submit', { taskId: id, artifactRefs: [artifactId] }));
      expectOk(handleTaskCommand(kdb, 'kernel.task.verify', {
        taskId: id,
        verifierWorkerId,
        verdict: 'pass',
        artifactRoot,
      }));
      expect(queryTaskGet(kdb, id)?.status).toBe('complete');
      return artifactId;
    }

    const upstreamArtifactId = verifyTaskWithArtifact('task_a', 'UPSTREAM SECRET BODY');
    createTask('task_unverified');
    const sensitiveArtifactId = verifyTaskWithArtifact('task_sensitive', 'sensitive body', { sensitivity: 'restricted' });
    createTask('task_b', 'Task B');
    expectOk(handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'task_b', dependsOnTaskId: 'task_a', kind: 'context_from' }));
    expectOk(handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'task_b', dependsOnTaskId: 'task_unverified', kind: 'context_from' }));
    expectOk(handleTaskCommand(kdb, 'kernel.task.depend', { taskId: 'task_b', dependsOnTaskId: 'task_sensitive', kind: 'context_from' }));
    expectOk(handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task_b', ownerWorkerId: workerId }));

    const before = {
      receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n,
      artifacts: (db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n,
      commands: (db.prepare('SELECT COUNT(*) AS n FROM commands').get() as { n: number }).n,
    };
    const envelope = buildContextEnvelope('task_b');
    const after = {
      receipts: (db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as { n: number }).n,
      artifacts: (db.prepare('SELECT COUNT(*) AS n FROM artifacts').get() as { n: number }).n,
      commands: (db.prepare('SELECT COUNT(*) AS n FROM commands').get() as { n: number }).n,
    };

    expect(after).toEqual(before);
    expect(envelope.version).toBe('context-envelope/v0');
    expect(envelope.workflow.workflow_id).toBe('wf1');
    expect(envelope.workflow.mode).toBe('research');
    expect(envelope.role.worker_id).toBe(workerId);
    expect(envelope.upstream_artifacts).toEqual([
      expect.objectContaining({
        artifact_id: upstreamArtifactId,
        uri: 'task_a.txt',
        verification_status: 'verified',
        produced_by_task: 'task_a',
      }),
    ]);
    expect(envelope.upstream_artifacts.some((artifact) => artifact.artifact_id === sensitiveArtifactId)).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain('UPSTREAM SECRET BODY');
    expect(envelope.instrumentation.context_tokens_estimate).toBeGreaterThan(0);
    expect(envelope.instrumentation.raw_receipt_count).toBeGreaterThan(0);
    expect(queryArtifactList(kdb, { taskId: 'task_a' })[0]?.derivedFrom).toEqual([]);
  });
});
