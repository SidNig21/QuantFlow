import { describe, expect, test } from "bun:test";
import {
  assertCrashReports,
  assertLaunchTraces,
  assertTailLogs,
  formatDuration,
} from "./diagnostics-panels-model";

describe("diagnostics panels model", () => {
  test("validates log tail responses", () => {
    expect(assertTailLogs({
      ok: true,
      file: "main",
      path: "/tmp/main.log",
      lines: 5,
      text: "hello",
      message: "ok",
    }).text).toBe("hello");
  });

  test("validates crash reports and launch traces", () => {
    expect(assertCrashReports([
      {
        id: "c1",
        type: "uncaughtException",
        message: "boom",
        createdAt: "2026-01-01T00:00:00.000Z",
        path: "/tmp/c1.json",
      },
    ])).toHaveLength(1);

    expect(assertLaunchTraces([
      {
        id: "l1",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        path: "/tmp/l1.json",
        phases: [
          {
            name: "ready",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            durationMs: 1000,
          },
        ],
      },
    ])[0]?.phases[0]?.name).toBe("ready");
  });

  test("formats durations", () => {
    expect(formatDuration(250)).toBe("250ms");
    expect(formatDuration(1250)).toBe("1.3s");
  });
});
