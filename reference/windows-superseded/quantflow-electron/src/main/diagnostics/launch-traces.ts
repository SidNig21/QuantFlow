import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import type { LaunchTracePhase, LaunchTraceSummary } from "./types";

const TRACE_DIR = join(QUANTFLOW_DIR, "launch-traces");

function timestampId(date = new Date()): string {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "");
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function asTrace(value: unknown, path: string): LaunchTraceSummary | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== "string" ||
    typeof input.startedAt !== "string" ||
    typeof input.endedAt !== "string" ||
    typeof input.durationMs !== "number" ||
    !Array.isArray(input.phases)
  ) {
    return null;
  }
  const phases = input.phases.filter((phase): phase is LaunchTracePhase => {
    return Boolean(phase) &&
      typeof phase === "object" &&
      typeof phase.name === "string" &&
      typeof phase.startedAt === "string" &&
      typeof phase.endedAt === "string" &&
      typeof phase.durationMs === "number";
  });
  return {
    id: input.id,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    path,
    phases,
  };
}

export function writeLaunchTrace(input: {
  startedAtMs: number;
  endedAtMs: number;
  phases: Array<{ name: string; startedAtMs: number; endedAtMs: number }>;
  traceDir?: string;
}): LaunchTraceSummary {
  const traceDir = input.traceDir ?? TRACE_DIR;
  mkdirSync(traceDir, { recursive: true });
  const id = timestampId(new Date(input.startedAtMs));
  const path = join(traceDir, `${id}.json`);
  const trace: LaunchTraceSummary = {
    id,
    startedAt: toIso(input.startedAtMs),
    endedAt: toIso(input.endedAtMs),
    durationMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    path,
    phases: input.phases.map((phase) => ({
      name: phase.name,
      startedAt: toIso(phase.startedAtMs),
      endedAt: toIso(phase.endedAtMs),
      durationMs: Math.max(0, phase.endedAtMs - phase.startedAtMs),
    })),
  };
  writeFileSync(path, JSON.stringify(trace, null, 2), "utf-8");
  return trace;
}

export async function listLaunchTraces(options: {
  traceDir?: string;
  limit?: number;
} = {}): Promise<LaunchTraceSummary[]> {
  const traceDir = options.traceDir ?? TRACE_DIR;
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  let entries: string[];
  try {
    entries = await readdir(traceDir);
  } catch {
    return [];
  }
  const traces = await Promise.all(entries
    .filter((entry) => entry.endsWith(".json"))
    .map(async (entry) => {
      const path = join(traceDir, entry);
      try {
        return asTrace(JSON.parse(await readFile(path, "utf-8")), path);
      } catch {
        return null;
      }
    }));
  return traces
    .filter((trace): trace is LaunchTraceSummary => trace !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}
