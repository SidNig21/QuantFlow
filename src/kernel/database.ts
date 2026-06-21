import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
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

let _db: BetterSqliteDatabase | null = null;
/** Smokes/tests inject an in-memory bun:sqlite db (API-compatible) via setKernelDbForTesting. */
let _testDb: KernelDB | null = null;

export type KernelDB = BetterSqliteDatabase;

/** Test/smoke hook — do not use in production paths. */
export function setKernelDbForTesting(db: KernelDB | null): void {
  _testDb = db;
}

function loadBetterSqlite3(): typeof import('better-sqlite3').default {
  const require = createRequire(join(import.meta.dir, '../../quantflow-electron/package.json'));
  return require('better-sqlite3') as typeof import('better-sqlite3').default;
}

export function initKernelDb(dataDir: string): void {
  if (_db) return;
  mkdirSync(dataDir, { recursive: true });
  const Database = loadBetterSqlite3();
  const db = new Database(join(dataDir, 'kernel.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);
  _db = db;
}

export function getKernelDb(): BetterSqliteDatabase {
  if (_testDb) return _testDb as BetterSqliteDatabase;
  if (!_db) throw new Error('KernelDB not initialized — call initKernelDb first');
  return _db;
}

export function closeKernelDb(): void {
  _testDb = null;
  _db?.close();
  _db = null;
}

/** Current schema version: 0 when uninitialized, else MAX(schema_migrations.version). */
function currentSchemaVersion(db: BetterSqliteDatabase): number {
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
function runMigrations(db: BetterSqliteDatabase): void {
  const version = currentSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version > version) {
      db.exec(migration.sql);
    }
  }
}
