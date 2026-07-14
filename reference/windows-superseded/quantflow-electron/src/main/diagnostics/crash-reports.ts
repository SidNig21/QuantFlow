import { mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import type { CrashReportSummary } from "./types";

const CRASH_DIR = join(QUANTFLOW_DIR, "crashes");

function timestampId(date = new Date()): string {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "");
}

function asCrashReport(value: unknown, path: string): CrashReportSummary | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || typeof input.message !== "string") return null;
  return {
    id: input.id,
    type: typeof input.type === "string" ? input.type : "error",
    message: input.message,
    stack: typeof input.stack === "string" ? input.stack : undefined,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : input.id,
    path,
  };
}

export function recordCrashReport(input: {
  type: string;
  message: string;
  stack?: string;
  now?: Date;
  crashDir?: string;
}): CrashReportSummary {
  const now = input.now ?? new Date();
  const id = `${timestampId(now)}-${input.type}`;
  const crashDir = input.crashDir ?? CRASH_DIR;
  mkdirSync(crashDir, { recursive: true });
  const path = join(crashDir, `${id}.json`);
  const report: CrashReportSummary = {
    id,
    type: input.type,
    message: input.message,
    stack: input.stack,
    createdAt: now.toISOString(),
    path,
  };
  writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
  return report;
}

export async function listCrashReports(options: {
  crashDir?: string;
  limit?: number;
} = {}): Promise<CrashReportSummary[]> {
  const crashDir = options.crashDir ?? CRASH_DIR;
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
  let entries: string[];
  try {
    entries = await readdir(crashDir);
  } catch {
    return [];
  }
  const reports = await Promise.all(entries
    .filter((entry) => entry.endsWith(".json"))
    .map(async (entry) => {
      const path = join(crashDir, entry);
      try {
        return asCrashReport(JSON.parse(await readFile(path, "utf-8")), path);
      } catch {
        return null;
      }
    }));
  return reports
    .filter((report): report is CrashReportSummary => report !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
