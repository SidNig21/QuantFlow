/**
 * Test helper — initialize an in-memory Kernel DB for envoy/smoke tests (bun:sqlite).
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  closeKernelDb,
  setKernelDbForTesting,
  type KernelDB,
} from "../../../src/kernel/database";

let db: Database | null = null;

const MIGRATION_FILES = [
  "001-v3-baseline.sql",
  "002-evaluations.sql",
  "003-r1-worker-task-binding.sql",
  "004-r3-workflow-instance.sql",
];

export function installTestKernelDb(): Database {
  closeTestKernelDb();
  const migrationsDir = join(import.meta.dir, "../../../src/kernel/migrations");
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of MIGRATION_FILES) {
    db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
  }
  setKernelDbForTesting(db as unknown as KernelDB);
  return db;
}

export function closeTestKernelDb(): void {
  setKernelDbForTesting(null);
  db?.close();
  db = null;
  closeKernelDb();
}
