export type HealthGroup =
  | "transport"
  | "storage"
  | "runtime"
  | "integrations";

export type HealthLevel = "healthy" | "degraded" | "down";

export interface HealthResult {
  ok: boolean;
  level: HealthLevel;
  message: string;
  detail?: Record<string, unknown>;
  name: string;
  group: HealthGroup;
  description: string;
  durationMs: number;
  checkedAt: string;
  remediation?: string;
}

export interface ControllerHealth {
  ok: boolean;
  level: HealthLevel;
  checkedAt: string;
  durationMs: number;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
  probes: HealthResult[];
}

export const HEALTH_GROUPS: Array<{ id: HealthGroup; label: string }> = [
  { id: "transport", label: "Transport" },
  { id: "storage", label: "Storage" },
  { id: "runtime", label: "Runtime" },
  { id: "integrations", label: "Integrations" },
];

const LEVEL_WEIGHT: Record<HealthLevel, number> = {
  healthy: 0,
  degraded: 1,
  down: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHealthLevel(value: unknown): value is HealthLevel {
  return value === "healthy" || value === "degraded" || value === "down";
}

function isHealthGroup(value: unknown): value is HealthGroup {
  return HEALTH_GROUPS.some((group) => group.id === value);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid health response: ${field} is missing`);
  }
  return value;
}

export function assertHealthResult(value: unknown): HealthResult {
  if (!isRecord(value)) throw new Error("Invalid health probe response");
  const level = value.level;
  const group = value.group;
  if (!isHealthLevel(level)) {
    throw new Error("Invalid health response: probe level is missing");
  }
  if (!isHealthGroup(group)) {
    throw new Error("Invalid health response: probe group is missing");
  }
  return {
    ok: value.ok === true,
    level,
    message: asString(value.message, "probe message"),
    detail: isRecord(value.detail) ? value.detail : undefined,
    name: asString(value.name, "probe name"),
    group,
    description: asString(value.description, "probe description"),
    durationMs: asNumber(value.durationMs),
    checkedAt: asString(value.checkedAt, "probe checkedAt"),
    remediation: typeof value.remediation === "string"
      ? value.remediation
      : undefined,
  };
}

export function aggregateHealthLevel(probes: HealthResult[]): HealthLevel {
  return probes.reduce<HealthLevel>((level, probe) => {
    return LEVEL_WEIGHT[probe.level] > LEVEL_WEIGHT[level]
      ? probe.level
      : level;
  }, "healthy");
}

export function summarizeHealth(probes: HealthResult[]): ControllerHealth["summary"] {
  return {
    total: probes.length,
    healthy: probes.filter((probe) => probe.level === "healthy").length,
    degraded: probes.filter((probe) => probe.level === "degraded").length,
    down: probes.filter((probe) => probe.level === "down").length,
  };
}

export function assertControllerHealth(value: unknown): ControllerHealth {
  if (!isRecord(value) || !Array.isArray(value.probes)) {
    throw new Error("Invalid health response");
  }
  const probes = value.probes.map(assertHealthResult);
  const level = isHealthLevel(value.level)
    ? value.level
    : aggregateHealthLevel(probes);
  return {
    ok: level === "healthy",
    level,
    checkedAt: asString(value.checkedAt, "checkedAt"),
    durationMs: asNumber(value.durationMs),
    summary: summarizeHealth(probes),
    probes,
  };
}

export function groupHealthProbes(
  health: ControllerHealth | null,
): Record<HealthGroup, HealthResult[]> {
  const grouped: Record<HealthGroup, HealthResult[]> = {
    transport: [],
    storage: [],
    runtime: [],
    integrations: [],
  };
  for (const probe of health?.probes ?? []) {
    grouped[probe.group].push(probe);
  }
  return grouped;
}

export function replaceHealthProbe(
  health: ControllerHealth,
  probe: HealthResult,
): ControllerHealth {
  let replaced = false;
  const probes = health.probes.map((item) => {
    if (item.name !== probe.name) return item;
    replaced = true;
    return probe;
  });
  if (!replaced) probes.push(probe);
  const level = aggregateHealthLevel(probes);
  return {
    ...health,
    ok: level === "healthy",
    level,
    checkedAt: probe.checkedAt,
    summary: summarizeHealth(probes),
    probes,
  };
}
