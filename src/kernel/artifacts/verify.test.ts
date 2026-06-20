import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyTaskArtifacts } from './verify';

function makeDb(): any {
  const schemaPath = join(import.meta.dir, '..', 'migrations', '001-v3-baseline.sql');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(schemaPath, 'utf-8'));
  const now = 1000;
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf1', 'wf', 'o', 'active', '/vault', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at)
     VALUES ('tile1', 'wf1', 'worker', 'worker', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
     VALUES ('w1', 'tile1', 'wf1', 'active', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO tasks
       (id, workflow_id, correlation_id, title, objective, status, owner_worker_id, priority, approval_level, created_at, updated_at, metadata_json)
     VALUES ('task1', 'wf1', 'corr1', 't', 'o', 'submitted', 'w1', 0, 'none', ?, ?, '{}')`,
  ).run(now, now);
  return db;
}

function insertArtifact(db: any, patch: Record<string, unknown> = {}): void {
  db.prepare(
    `INSERT INTO artifacts
       (id, workflow_id, task_id, worker_id, tile_id, kind, uri, summary, content_hash, media_type, size_bytes, created_at, metadata_json)
     VALUES (?, ?, ?, ?, 'tile1', 'file', ?, 'proof', ?, 'text/plain', NULL, 1000, '{}')`,
  ).run(
    patch.id ?? 'artifact1',
    patch.workflowId ?? 'wf1',
    patch.taskId ?? 'task1',
    patch.workerId ?? 'w1',
    patch.uri ?? 'proof.md',
    patch.contentHash ?? null,
  );
}

function fakeFs(files: Record<string, string>) {
  return {
    existsSync(path: string) {
      return Object.prototype.hasOwnProperty.call(files, path);
    },
    readFileSync(path: string) {
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error('ENOENT');
      return files[path]!;
    },
  };
}

describe('verifyTaskArtifacts', () => {
  test('passes linked non-empty artifact under root', () => {
    const db = makeDb();
    const root = resolve(process.cwd(), 'vault');
    const proofPath = join(root, 'proof.md');
    const body = 'done';
    insertArtifact(db, { contentHash: createHash('sha256').update(body).digest('hex') });
    const result = verifyTaskArtifacts(db, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({ [proofPath]: body }),
    });
    expect(result.ok).toBe(true);
    expect(result.openedArtifacts).toHaveLength(1);
  });

  test('fails missing record, bad link, outside root, missing file, empty file, and hash mismatch', () => {
    const missing = verifyTaskArtifacts(makeDb(), {
      taskId: 'task1',
      artifactRefs: ['artifact_ghost'],
      artifactRoot: resolve(process.cwd(), 'vault'),
      fs: fakeFs({}),
    });
    expect(missing.ok).toBe(false);
    expect(missing.failures[0]?.reason).toContain('not found');

    const badLinkDb = makeDb();
    const root = resolve(process.cwd(), 'vault');
    const proofPath = join(root, 'proof.md');
    badLinkDb.prepare(
      `INSERT INTO tiles (id, workflow_id, display_name, tile_kind, created_at, updated_at)
       VALUES ('tile2', 'wf1', 'other', 'worker', 1000, 1000)`,
    ).run();
    badLinkDb.prepare(
      `INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at)
       VALUES ('w_other', 'tile2', 'wf1', 'active', 1000, 1000)`,
    ).run();
    insertArtifact(badLinkDb, { workerId: 'w_other' });
    expect(verifyTaskArtifacts(badLinkDb, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({ [proofPath]: 'done' }),
    }).ok).toBe(false);

    const outsideDb = makeDb();
    insertArtifact(outsideDb, { uri: '../escape.md' });
    expect(verifyTaskArtifacts(outsideDb, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({ [resolve(root, '..', 'escape.md')]: 'done' }),
    }).ok).toBe(false);

    const missingFileDb = makeDb();
    insertArtifact(missingFileDb);
    expect(verifyTaskArtifacts(missingFileDb, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({}),
    }).ok).toBe(false);

    const emptyDb = makeDb();
    insertArtifact(emptyDb);
    expect(verifyTaskArtifacts(emptyDb, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({ [proofPath]: '' }),
    }).ok).toBe(false);

    const hashDb = makeDb();
    insertArtifact(hashDb, { contentHash: 'bad' });
    expect(verifyTaskArtifacts(hashDb, {
      taskId: 'task1',
      artifactRefs: ['artifact1'],
      artifactRoot: root,
      fs: fakeFs({ [proofPath]: 'done' }),
    }).ok).toBe(false);
  });
});
