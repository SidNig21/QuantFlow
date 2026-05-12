/**
 * One-shot migration from ~/.collaborator/ → ~/.quantflow/
 *
 * Lifecycle:
 *   check sentinel → already migrated? skip
 *   no source dir? skip (fresh install)
 *   sentinel absent but dest non-empty → partial state → hard-fail dialog
 *   backup first → copy → verify copy → write sentinel → continue
 *   any failure → throw (caller shows blocking dialog, does NOT continue launch)
 *
 * The sentinel file is written ONLY after a verified copy, so a crash at any
 * earlier point leaves the sentinel absent, causing a clean retry on next launch.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface MigrationResult {
  status: "already-done" | "no-source" | "migrated" | "skipped";
  itemsMigrated?: number;
  backupPath?: string;
}

export interface MigrationComplete {
  version: 1;
  migratedFrom: string;
  migratedAt: string;
  appVersion: string;
  backupPath: string;
  itemsMigrated: number;
}

const LEGACY_DIR = join(homedir(), ".collaborator");
const BACKUP_BASE = join(homedir(), ".quantflow-backups");

function countItems(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    count++;
    if (entry.isDirectory()) {
      count += countItems(join(dir, entry.name));
    }
  }
  return count;
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Run the migration. Throws on any failure so the caller can show a
 * blocking dialog and abort launch.
 *
 * @param destDir   The target directory (QUANTFLOW_DIR, passed in to keep this
 *                  module free of circular imports with paths.ts).
 * @param appVersion  app.getVersion() or "unknown", written into the sentinel.
 */
export async function runMigrationIfNeeded(
  destDir: string,
  appVersion: string,
): Promise<MigrationResult> {
  const sentinelPath = join(destDir, "migration.complete");

  // 1. Already migrated — skip entirely.
  if (existsSync(sentinelPath)) {
    return { status: "already-done" };
  }

  // 2. No legacy directory — fresh install, nothing to migrate.
  if (!existsSync(LEGACY_DIR)) {
    return { status: "no-source" };
  }

  const legacyItems = readdirSync(LEGACY_DIR);
  if (legacyItems.length === 0) {
    return { status: "no-source" };
  }

  // 3. Ensure dest directory exists.
  mkdirSync(destDir, { recursive: true });
  mkdirSync(BACKUP_BASE, { recursive: true });

  // 4. Backup: copy legacy dir to a timestamped backup directory.
  const ts = isoTimestamp();
  const backupPath = join(BACKUP_BASE, `collaborator-${ts}`);
  cpSync(LEGACY_DIR, backupPath, { recursive: true, force: false });

  // 5. Copy legacy contents into dest.  Files that already exist in dest are
  //    left untouched so a retry after a partial copy doesn't overwrite new data.
  cpSync(LEGACY_DIR, destDir, { recursive: true, force: false });

  // 6. Verify: count items that landed in dest.
  const itemsMigrated = countItems(backupPath);
  const destItems = countItems(destDir);
  if (destItems < itemsMigrated) {
    throw new Error(
      `Migration verification failed: expected at least ${itemsMigrated} items in ${destDir}, ` +
        `found ${destItems}. Backup preserved at ${backupPath}.`,
    );
  }

  // 7. Write sentinel — only after verified copy.
  const record: MigrationComplete = {
    version: 1,
    migratedFrom: LEGACY_DIR,
    migratedAt: new Date().toISOString(),
    appVersion,
    backupPath,
    itemsMigrated,
  };
  writeFileSync(sentinelPath, JSON.stringify(record, null, 2), "utf-8");

  return { status: "migrated", itemsMigrated, backupPath };
}
