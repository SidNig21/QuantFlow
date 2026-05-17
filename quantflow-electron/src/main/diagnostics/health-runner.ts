import { join } from "node:path";
import { homedir } from "node:os";
import { QUANTFLOW_DIR, QUANTFLOW_HOME } from "../paths";
import { getRuntimeDbPath } from "../runtime-state/database";
import { createHealthProbes } from "./probes";
import type {
  ControllerHealth,
  HealthLevel,
  HealthProbe,
  HealthResult,
  ProbeContext,
} from "./types";

const LEVEL_WEIGHT: Record<HealthLevel, number> = {
  healthy: 0,
  degraded: 1,
  down: 2,
};

export function createProbeContext(): ProbeContext {
  const repoRootCandidates = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(homedir(), "QuantFlow"),
  ];
  return {
    now: () => Date.now(),
    quantflowHome: QUANTFLOW_HOME,
    quantflowDir: QUANTFLOW_DIR,
    runtimeDbPath: getRuntimeDbPath(),
    socketPathFile: join(QUANTFLOW_HOME, "socket-path"),
    tcpHost: "127.0.0.1",
    tcpPort: 9811,
    mcpToolDefinitionPaths: repoRootCandidates.map((root) =>
      join(root, "tools", "quantflow-mcp", "tool-definitions.js")
    ),
  };
}

export function getHealthProbes(): HealthProbe[] {
  return createHealthProbes();
}

export function aggregateLevel(results: HealthResult[]): HealthLevel {
  let level: HealthLevel = "healthy";
  for (const result of results) {
    if (LEVEL_WEIGHT[result.level] > LEVEL_WEIGHT[level]) {
      level = result.level;
    }
  }
  return level;
}

export async function runProbe(
  probe: HealthProbe,
  ctx: ProbeContext = createProbeContext(),
): Promise<HealthResult> {
  const startedAt = ctx.now();
  const checkedAt = new Date(startedAt).toISOString();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const check = probe.check(ctx);
    const timed = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`probe timed out after ${probe.timeoutMs}ms`));
      }, probe.timeoutMs);
    });
    const result = await Promise.race([check, timed]);
    return {
      ...result,
      name: probe.name,
      group: probe.group,
      description: probe.description,
      durationMs: Math.max(0, ctx.now() - startedAt),
      checkedAt,
      ...(probe.remediation ? { remediation: probe.remediation } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      level: "down",
      message,
      name: probe.name,
      group: probe.group,
      description: probe.description,
      durationMs: Math.max(0, ctx.now() - startedAt),
      checkedAt,
      detail: { error: message },
      ...(probe.remediation ? { remediation: probe.remediation } : {}),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runHealth(options: {
  probes?: HealthProbe[];
  probeNames?: string[];
  ctx?: ProbeContext;
} = {}): Promise<ControllerHealth> {
  const ctx = options.ctx ?? createProbeContext();
  const startedAt = ctx.now();
  const checkedAt = new Date(startedAt).toISOString();
  const requested = new Set(options.probeNames ?? []);
  const probes = (options.probes ?? getHealthProbes()).filter((probe) =>
    requested.size === 0 || requested.has(probe.name)
  );

  const results = await Promise.all(probes.map((probe) => runProbe(probe, ctx)));
  const level = aggregateLevel(results);
  const summary = {
    total: results.length,
    healthy: results.filter((result) => result.level === "healthy").length,
    degraded: results.filter((result) => result.level === "degraded").length,
    down: results.filter((result) => result.level === "down").length,
  };

  return {
    ok: level === "healthy",
    level,
    checkedAt,
    durationMs: Math.max(0, ctx.now() - startedAt),
    summary,
    probes: results,
  };
}

export async function runNamedProbe(
  name: string,
  options: {
    probes?: HealthProbe[];
    ctx?: ProbeContext;
  } = {},
): Promise<HealthResult> {
  const probe = (options.probes ?? getHealthProbes()).find((item) =>
    item.name === name
  );
  if (!probe) {
    throw new Error(`Unknown health probe: ${name}`);
  }
  return runProbe(probe, options.ctx ?? createProbeContext());
}
