import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listLaunchTraces,
  writeLaunchTrace,
} from "./launch-traces";

describe("launch traces", () => {
  test("writes and lists launch traces with phase durations", async () => {
    const traceDir = await mkdtemp(join(tmpdir(), "qf-launch-"));
    writeLaunchTrace({
      traceDir,
      startedAtMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      endedAtMs: Date.UTC(2026, 0, 1, 0, 0, 5),
      phases: [
        {
          name: "ready",
          startedAtMs: Date.UTC(2026, 0, 1, 0, 0, 1),
          endedAtMs: Date.UTC(2026, 0, 1, 0, 0, 3),
        },
      ],
    });
    const traces = await listLaunchTraces({ traceDir });
    expect(traces).toHaveLength(1);
    expect(traces[0]?.durationMs).toBe(5000);
    expect(traces[0]?.phases[0]?.durationMs).toBe(2000);
  });
});
