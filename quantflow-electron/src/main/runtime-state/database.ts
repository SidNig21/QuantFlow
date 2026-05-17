/**
 * SQLite singleton for the QuantFlow runtime state layer (Phase 7).
 *
 * Opens (or creates) runtime.db in QUANTFLOW_DIR, enables WAL + foreign keys,
 * then runs any pending SQL migration files in order.  All repo modules call
 * getDb() — they never open their own connection.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import migration001 from "./migrations/001-initial.sql?raw";
import migration002 from "./migrations/002-orchestration-spine.sql?raw";
import migration003 from "./migrations/003-task-message-schema.sql?raw";
import migration004 from "./migrations/004-connections-contracts.sql?raw";
import migration005 from "./migrations/005-backpressure.sql?raw";

let _db: Database.Database | null = null;

export const EXPECTED_MIGRATION_VERSIONS = [1, 2, 3, 4, 5] as const;

export function getRuntimeDbPath(): string {
  return join(QUANTFLOW_DIR, "runtime.db");
}

/** Returns the singleton, initialising it on first call. */
export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(QUANTFLOW_DIR, { recursive: true });
  const dbPath = getRuntimeDbPath();

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL");

  runMigrations(_db);

  return _db;
}

/** Close the database — used in tests and on app exit. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function _setDbForTesting(db: Database.Database): void {
  closeDb();
  _db = db;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function appliedVersions(db: Database.Database): Set<number> {
  const tableExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .get();

  if (!tableExists) return new Set();

  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: number }[];

  return new Set(rows.map((r) => r.version));
}

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004 },
  { version: 5, sql: migration005 },
];

function runMigrations(db: Database.Database): void {
  const applied = appliedVersions(db);

  for (const { version, sql } of MIGRATIONS) {
    if (applied.has(version)) continue;
    db.exec(sql);
  }
}
