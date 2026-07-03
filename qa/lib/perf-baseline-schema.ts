import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
export const PERF_BASELINE_PATH = join(REPO_ROOT, "qa", "perf-baseline.json");

export type BenchmarkEntry = {
  description: string;
  method: string;
  unit: string;
  p50_ms: number;
  p95_ms: number;
  trials_ms: number[];
};

export type B4BenchmarkEntry = BenchmarkEntry & {
  refetch_count_per_trial: number[];
  refetch_trigger_kinds: string[];
};

export type PerfBaseline = {
  version: number;
  captured_at: string;
  host: {
    platform: string;
    cpu_model: string;
    bun_version: string;
  };
  trials: number;
  benchmarks: {
    B1: BenchmarkEntry;
    B3: BenchmarkEntry;
    B4: B4BenchmarkEntry;
  };
};

function isNumberArray(v: unknown, len: number): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === len &&
    v.every((x) => typeof x === "number" && Number.isFinite(x))
  );
}

function isBenchmarkEntry(v: unknown, trials: number): v is BenchmarkEntry {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.description === "string" &&
    typeof b.method === "string" &&
    typeof b.unit === "string" &&
    typeof b.p50_ms === "number" &&
    typeof b.p95_ms === "number" &&
    isNumberArray(b.trials_ms, trials)
  );
}

function isB4Entry(v: unknown, trials: number): v is B4BenchmarkEntry {
  if (!isBenchmarkEntry(v, trials)) return false;
  const b = v as B4BenchmarkEntry;
  return (
    isNumberArray(b.refetch_count_per_trial, trials) &&
    Array.isArray(b.refetch_trigger_kinds) &&
    b.refetch_trigger_kinds.every((k) => typeof k === "string")
  );
}

export function validatePerfBaseline(data: unknown): data is PerfBaseline {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== "number" || typeof d.captured_at !== "string") return false;
  if (typeof d.trials !== "number" || d.trials < 1) return false;

  const host = d.host;
  if (!host || typeof host !== "object") return false;
  const h = host as Record<string, unknown>;
  if (
    typeof h.platform !== "string" ||
    typeof h.cpu_model !== "string" ||
    typeof h.bun_version !== "string"
  ) {
    return false;
  }

  const benchmarks = d.benchmarks;
  if (!benchmarks || typeof benchmarks !== "object") return false;
  const bm = benchmarks as Record<string, unknown>;
  const trials = d.trials;
  return (
    isBenchmarkEntry(bm.B1, trials) &&
    isBenchmarkEntry(bm.B3, trials) &&
    isB4Entry(bm.B4, trials)
  );
}

export function validatePerfBaselineFile(): boolean {
  if (!existsSync(PERF_BASELINE_PATH)) {
    console.error(`Missing ${PERF_BASELINE_PATH}`);
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(PERF_BASELINE_PATH, "utf-8"));
  } catch (err) {
    console.error(`Invalid JSON in ${PERF_BASELINE_PATH}:`, err);
    return false;
  }
  if (!validatePerfBaseline(parsed)) {
    console.error("perf-baseline.json structure validation failed");
    return false;
  }
  return true;
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, rank)]!;
}
