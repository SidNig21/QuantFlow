import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { backupRuntimeDb } from "./db-backup";

describe("runtime DB backup", () => {
  test("copies runtime.db and present sidecars", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qf-db-"));
    try {
      const dbPath = join(dir, "runtime.db");
      const backupRoot = join(dir, "backups");
      await writeFile(dbPath, "db", "utf-8");
      await writeFile(`${dbPath}-wal`, "wal", "utf-8");

      const result = await backupRuntimeDb({ backupRoot, dbPath });

      expect(result.ok).toBe(true);
      expect(result.copiedFiles.map((file) => basename(file)).sort()).toEqual([
        "runtime.db",
        "runtime.db-wal",
      ]);
      expect(result.missingFiles).toEqual([`${dbPath}-shm`]);
      expect(existsSync(join(result.backupDir, "runtime.db"))).toBe(true);
      expect(await readFile(join(result.backupDir, "runtime.db-wal"), "utf-8")).toBe("wal");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
