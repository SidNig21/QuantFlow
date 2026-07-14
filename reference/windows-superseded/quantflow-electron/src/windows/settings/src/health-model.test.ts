import { describe, expect, test } from "bun:test";
import {
  aggregateHealthLevel,
  assertControllerHealth,
  groupHealthProbes,
  replaceHealthProbe,
  summarizeHealth,
  type HealthResult,
} from "./health-model";

function probe(
  name: string,
  group: HealthResult["group"],
  level: HealthResult["level"],
): HealthResult {
  return {
    ok: level === "healthy",
    level,
    message: `${name} ${level}`,
    name,
    group,
    description: `${name} description`,
    durationMs: 12,
    checkedAt: "2026-05-16T00:00:00.000Z",
  };
}

describe("settings health model", () => {
  test("groups probes by diagnostics group", () => {
    const health = assertControllerHealth({
      level: "degraded",
      checkedAt: "2026-05-16T00:00:00.000Z",
      durationMs: 20,
      probes: [
        probe("relay.socket", "transport", "healthy"),
        probe("db.integrity", "storage", "degraded"),
      ],
    });

    const grouped = groupHealthProbes(health);

    expect(grouped.transport.map((item) => item.name)).toEqual(["relay.socket"]);
    expect(grouped.storage.map((item) => item.name)).toEqual(["db.integrity"]);
    expect(grouped.runtime).toEqual([]);
  });

  test("summarizes and aggregates the highest severity", () => {
    const probes = [
      probe("ok", "runtime", "healthy"),
      probe("warn", "runtime", "degraded"),
      probe("down", "runtime", "down"),
    ];

    expect(summarizeHealth(probes)).toEqual({
      total: 3,
      healthy: 1,
      degraded: 1,
      down: 1,
    });
    expect(aggregateHealthLevel(probes)).toBe("down");
  });

  test("replaces a single probe and recomputes summary", () => {
    const health = assertControllerHealth({
      level: "down",
      checkedAt: "2026-05-16T00:00:00.000Z",
      durationMs: 20,
      probes: [
        probe("relay.socket", "transport", "down"),
        probe("db.integrity", "storage", "healthy"),
      ],
    });

    const next = replaceHealthProbe(
      health,
      probe("relay.socket", "transport", "healthy"),
    );

    expect(next.level).toBe("healthy");
    expect(next.summary).toEqual({
      total: 2,
      healthy: 2,
      degraded: 0,
      down: 0,
    });
  });
});
