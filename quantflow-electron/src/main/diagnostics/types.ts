export type HealthGroup =
  | "transport"
  | "storage"
  | "runtime"
  | "integrations";

export type HealthLevel = "healthy" | "degraded" | "down";

export interface ProbeContext {
  now: () => number;
  quantflowHome: string;
  quantflowDir: string;
  runtimeDbPath: string;
  socketPathFile: string;
  tcpHost: string;
  tcpPort: number;
  mcpToolDefinitionPaths: string[];
}

export interface ProbeCheckResult {
  ok: boolean;
  level: HealthLevel;
  message: string;
  detail?: Record<string, unknown>;
}

export interface HealthProbe {
  name: string;
  group: HealthGroup;
  description: string;
  intervalMs: number;
  timeoutMs: number;
  remediation?: string;
  check: (ctx: ProbeContext) => Promise<ProbeCheckResult>;
}

export interface HealthResult extends ProbeCheckResult {
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

export interface TailLogsRequest {
  file?: "main" | "renderer";
  lines?: number;
  filter?: {
    minLevel?: "info" | "warn" | "error";
  };
}

export interface TailLogsResult {
  ok: boolean;
  file: "main" | "renderer";
  path: string | null;
  lines: number;
  text: string;
  message: string;
}

export interface DbBackupResult {
  ok: boolean;
  backupDir: string;
  copiedFiles: string[];
  missingFiles: string[];
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
