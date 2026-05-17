import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import { getRuntimeDbPath } from "../runtime-state/database";
import type { DbBackupResult } from "./types";

function backupTimestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z");
}

export async function backupRuntimeDb(
  options: { backupRoot?: string; dbPath?: string } = {},
): Promise<DbBackupResult> {
  const backupRoot = options.backupRoot ?? join(QUANTFLOW_DIR, "backups");
  const dbPath = options.dbPath ?? getRuntimeDbPath();
  const backupDir = join(backupRoot, `runtime-db-${backupTimestamp()}`);
  await mkdir(backupDir, { recursive: true });

  const sourceFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  const copiedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const source of sourceFiles) {
    if (!existsSync(source)) {
      missingFiles.push(source);
      continue;
    }
    const target = join(backupDir, basename(source));
    await copyFile(source, target);
    copiedFiles.push(target);
  }

  return {
    ok: copiedFiles.length > 0,
    backupDir,
    copiedFiles,
    missingFiles,
    message: copiedFiles.length > 0
      ? `Backed up ${copiedFiles.length} runtime DB file(s).`
      : "No runtime DB files were found to back up.",
  };
}
