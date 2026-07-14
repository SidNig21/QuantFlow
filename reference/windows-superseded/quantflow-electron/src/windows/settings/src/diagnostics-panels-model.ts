export interface TailLogsResult {
  ok: boolean;
  file: "main" | "renderer";
  path: string | null;
  lines: number;
  text: string;
  message: string;
}

export interface CrashReportSummary {
  id: string;
  type: string;
  message: string;
  stack?: string;
  createdAt: string;
  path: string;
}

export interface LaunchTracePhase {
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface LaunchTraceSummary {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  path: string;
  phases: LaunchTracePhase[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} is missing`);
  return value;
}

function numberField(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

export function assertTailLogs(value: unknown): TailLogsResult {
  if (!isRecord(value)) throw new Error("Invalid log tail response");
  const file = value.file;
  if (file !== "main" && file !== "renderer") {
    throw new Error("Invalid log tail response: file is missing");
  }
  return {
    ok: value.ok === true,
    file,
    path: typeof value.path === "string" ? value.path : null,
    lines: numberField(value.lines, "lines"),
    text: stringField(value.text, "text"),
    message: stringField(value.message, "message"),
  };
}

export function assertCrashReports(value: unknown): CrashReportSummary[] {
  if (!Array.isArray(value)) throw new Error("Invalid crash report response");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Invalid crash report row");
    return {
      id: stringField(item.id, "id"),
      type: stringField(item.type, "type"),
      message: stringField(item.message, "message"),
      stack: typeof item.stack === "string" ? item.stack : undefined,
      createdAt: stringField(item.createdAt, "createdAt"),
      path: stringField(item.path, "path"),
    };
  });
}

export function assertLaunchTraces(value: unknown): LaunchTraceSummary[] {
  if (!Array.isArray(value)) throw new Error("Invalid launch trace response");
  return value.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.phases)) {
      throw new Error("Invalid launch trace row");
    }
    return {
      id: stringField(item.id, "id"),
      startedAt: stringField(item.startedAt, "startedAt"),
      endedAt: stringField(item.endedAt, "endedAt"),
      durationMs: numberField(item.durationMs, "durationMs"),
      path: stringField(item.path, "path"),
      phases: item.phases.map((phase) => {
        if (!isRecord(phase)) throw new Error("Invalid launch trace phase");
        return {
          name: stringField(phase.name, "phase.name"),
          startedAt: stringField(phase.startedAt, "phase.startedAt"),
          endedAt: stringField(phase.endedAt, "phase.endedAt"),
          durationMs: numberField(phase.durationMs, "phase.durationMs"),
        };
      }),
    };
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
