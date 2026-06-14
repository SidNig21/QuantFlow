import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import baselineSql from './migrations/001-v3-baseline.sql?raw';

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

function runMigrations(db: Database.Database): void {
  const hasMigrationsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get();
  if (hasMigrationsTable) return;
  db.exec(baselineSql);
}
