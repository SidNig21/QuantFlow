import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { KernelDB } from "../../src/kernel/database";

export const MIGRATION_FILES = [
  "001-v3-baseline.sql",
  "002-evaluations.sql",
  "003-r1-worker-task-binding.sql",
  "004-r3-workflow-instance.sql",
  "005-r4-runtime.sql",
  "006-r2-artifact-lineage.sql",
  "007-r7-typed-artifacts.sql",
  "008-d0-tile-extensions.sql",
] as const;

const migrationsDir = join(import.meta.dir, "..", "..", "src", "kernel", "migrations");

export function runKernelMigrations(db: Database): void {
  for (const file of MIGRATION_FILES) {
    db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
  }
}

export function createInMemoryKernelDb(workflowId = "wf_perf"): {
  db: Database;
  artifactRoot: string;
  kdb: KernelDB;
} {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  runKernelMigrations(db);
  const artifactRoot = mkdtempSync(join(tmpdir(), "qf-perf-baseline-"));
  const now = Date.now();
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES (?, 'Perf Baseline', 'QA perf baseline workflow', 'active', ?, ?, ?)`,
  ).run(workflowId, artifactRoot, now, now);
  return { db, artifactRoot, kdb: db as unknown as KernelDB };
}

/** File-backed bun:sqlite DB on disk (headless bootstrap proxy for initKernelDb). */
export function createFileKernelDb(dataDir: string): { db: Database; kdb: KernelDB } {
  const db = new Database(join(dataDir, "kernel.db"));
  db.exec("PRAGMA foreign_keys = ON;");
  runKernelMigrations(db);
  return { db, kdb: db as unknown as KernelDB };
}
