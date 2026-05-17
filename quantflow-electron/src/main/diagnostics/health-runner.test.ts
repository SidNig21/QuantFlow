import { describe, expect, test } from "bun:test";
import { aggregateLevel, runHealth, runNamedProbe } from "./health-runner";
import type { HealthProbe, ProbeContext } from "./types";

function ctx(): ProbeContext {
  return {
    now: () => Date.now(),
    quantflowHome: "/tmp/qf-home",
    quantflowDir: "/tmp/qf-dir",
    runtimeDbPath: "/tmp/qf-dir/runtime.db",
    socketPathFile: "/tmp/qf-home/socket-path",
    tcpHost: "127.0.0.1",
    tcpPort: 9811,
    mcpToolDefinitionPaths: [],
  };
}

function probe(
  name: string,
  level: "healthy" | "degraded" | "down",
): HealthProbe {
  return {
    name,
    group: "runtime",
    description: `${name} probe`,
    intervalMs: 60_000,
    timeoutMs: 1000,
    check: async () => ({
      ok: level === "healthy",
      level,
      message: `${name} ${level}`,
    }),
  };
}

describe("health runner", () => {
  test("aggregates the highest health level and summary counts", async () => {
    const health = await runHealth({
      probes: [
        probe("ok", "healthy"),
        probe("warn", "degraded"),
        probe("down", "down"),
      ],
      ctx: ctx(),
    });

    expect(health.level).toBe("down");
    expect(health.ok).toBe(false);
    expect(health.summary).toEqual({
      total: 3,
      healthy: 1,
      degraded: 1,
      down: 1,
    });
  });

  test("filters to a named probe", async () => {
    const result = await runNamedProbe("target", {
      probes: [probe("other", "down"), probe("target", "healthy")],
      ctx: ctx(),
    });

    expect(result.name).toBe("target");
    expect(result.level).toBe("healthy");
  });

  test("reports thrown probe errors as down results", async () => {
    const health = await runHealth({
      probes: [{
        name: "throws",
        group: "runtime",
        description: "throws",
        intervalMs: 60_000,
        timeoutMs: 1000,
        check: async () => {
          throw new Error("boom");
        },
      }],
      ctx: ctx(),
    });

    expect(health.level).toBe("down");
    expect(health.probes[0]?.message).toBe("boom");
  });

  test("aggregateLevel returns degraded when no probes are down", () => {
    expect(aggregateLevel([
      {
        name: "ok",
        group: "runtime",
        description: "ok",
        ok: true,
        level: "healthy",
        message: "ok",
        durationMs: 0,
        checkedAt: "2026-05-16T00:00:00.000Z",
      },
      {
        name: "warn",
        group: "runtime",
        description: "warn",
        ok: false,
        level: "degraded",
        message: "warn",
        durationMs: 0,
        checkedAt: "2026-05-16T00:00:00.000Z",
      },
    ])).toBe("degraded");
  });
});
