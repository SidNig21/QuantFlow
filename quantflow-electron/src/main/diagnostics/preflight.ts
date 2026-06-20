import { aggregateLevel, createProbeContext, runHealth } from "./health-runner";
import {
  discoverCapabilityProbes,
  type CapabilityProbeDeps,
} from "./capability-probes";
import type { ControllerHealth, HealthResult, ProbeContext } from "./types";

export interface PreflightOptions {
  deps?: CapabilityProbeDeps;
  ctx?: ProbeContext;
}

export async function runPreflight(
  options: PreflightOptions = {},
): Promise<ControllerHealth> {
  const ctx = options.ctx ?? createProbeContext();
  const probes = await discoverCapabilityProbes(options.deps);
  return runHealth({ probes, ctx });
}

export function renderPreflightReport(health: ControllerHealth): string {
  const probes = [...health.probes].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    `QuantFlow capability preflight: ${health.level} `
      + `(${health.summary.healthy} healthy, `
      + `${health.summary.degraded} degraded, ${health.summary.down} down)`,
  ];

  for (const probe of probes) {
    const detail = probe.detail ?? {};
    const bits = [
      `present=${Boolean(detail.present)}`,
      `reachable=${Boolean(detail.reachable)}`,
      `authed=${detail.authed === null ? "n/a" : Boolean(detail.authed)}`,
      `ready=${Boolean(detail.ready)}`,
    ];
    lines.push(`[${probe.level}] ${probe.name} ${bits.join(" ")} - ${probe.message}`);
    if (probe.remediation) {
      lines.push(`  remediation: ${probe.remediation}`);
    }
  }

  return lines.join("\n");
}

export function summarizePreflight(results: HealthResult[]): ControllerHealth["summary"] {
  return {
    total: results.length,
    healthy: results.filter((result) => result.level === "healthy").length,
    degraded: results.filter((result) => result.level === "degraded").length,
    down: results.filter((result) => result.level === "down").length,
  };
}

export function preflightFromResults(
  results: HealthResult[],
  checkedAt = "2026-06-20T00:00:00.000Z",
): ControllerHealth {
  const level = aggregateLevel(results);
  return {
    ok: level === "healthy",
    level,
    checkedAt,
    durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
    summary: summarizePreflight(results),
    probes: results,
  };
}
