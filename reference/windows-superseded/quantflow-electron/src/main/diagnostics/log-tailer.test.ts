import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { tailLogs } from "./log-tailer";

describe("log tailer", () => {
  test("tails the newest main log", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qf-logs-"));
    try {
      await writeFile(join(dir, "main-old.log"), "old\n", "utf-8");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(
        join(dir, "main-new.log"),
        "one\ntwo\nthree\n",
        "utf-8",
      );

      const result = await tailLogs({ file: "main", lines: 2 }, { logsDir: dir });

      expect(result.ok).toBe(true);
      expect(result.text).toBe("two\nthree");
      expect(result.path).toContain("main-new.log");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("filters warn and error lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qf-logs-"));
    try {
      await writeFile(
        join(dir, "main-test.log"),
        "info hello\nwarn careful\nerror broken\n",
        "utf-8",
      );

      const result = await tailLogs({
        file: "main",
        lines: 10,
        filter: { minLevel: "warn" },
      }, { logsDir: dir });

      expect(result.text).toBe("warn careful\nerror broken");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
