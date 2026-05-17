import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listCrashReports,
  recordCrashReport,
} from "./crash-reports";

describe("crash reports", () => {
  test("records and lists crash report files newest first", async () => {
    const crashDir = await mkdtemp(join(tmpdir(), "qf-crashes-"));
    const first = recordCrashReport({
      type: "uncaughtException",
      message: "first",
      now: new Date("2026-01-01T00:00:00.000Z"),
      crashDir,
    });
    const reports = await listCrashReports({ crashDir });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toBe("first");
    expect(first.path).toContain("uncaughtException");
  });
});
