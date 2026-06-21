import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import baselineSql from './migrations/001-v3-baseline.sql?raw';
import evaluationsSql from './migrations/002-evaluations.sql?raw';
import r1WorkerTaskBindingSql from './migrations/003-r1-worker-task-binding.sql?raw';
import r3WorkflowInstanceSql from './migrations/004-r3-workflow-instance.sql?raw';

/**
 * Ordered Kernel migrations. Each entry's SQL records its own `schema_migrations`
 * row. `runMigrations` applies every entry whose version is ahead of the DB's
 * current version, so EXISTING databases pick up new tables (e.g. Goal 9's
 * `evaluations`) — not only freshly-created ones.
 */
const MIGRATIONS: Array<{ version: number; sql: string }> = [
  { version: 1, sql: baselineSql },
  { version: 2, sql: evaluationsSql },
  { version: 3, sql: r1WorkerTaskBindingSql },
  { version: 4, sql: r3WorkflowInstanceSql },
];

let _db: Database.Database | null = null;

export type KernelDB = Database.Database;

export function initKernelDb(dataDir: string): void {
  if (_db) return;
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'kernel.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);
  _db = db;
}

export function getKernelDb(): Database.Database {
  if (!_db) throw new Error('KernelDB not initialized — call initKernelDb first');
  return _db;
}

export function closeKernelDb(): void {
  _db?.close();
  _db = null;
}

/** Current schema version: 0 when uninitialized, else MAX(schema_migrations.version). */
function currentSchemaVersion(db: Database.Database): number {
  const hasMigrationsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get();
  if (!hasMigrationsTable) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}

/**
 * Apply every migration ahead of the DB's current version, in order. Idempotent
 * across restarts (already-applied versions are skipped) and forward-compatible
 * for existing dev databases (they advance through new migrations rather than
 * being treated as fully up to date).
 */
function runMigrations(db: Database.Database): void {
  const version = currentSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version > version) {
      db.exec(migration.sql);
    }
  }
}
