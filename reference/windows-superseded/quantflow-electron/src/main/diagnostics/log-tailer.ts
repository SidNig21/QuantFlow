import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import type { TailLogsRequest, TailLogsResult } from "./types";

const DEFAULT_LINES = 2000;
const MAX_LINES = 20_000;

function normalizeLines(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LINES;
  return Math.min(MAX_LINES, Math.floor(parsed));
}

function logFilePrefix(file: "main" | "renderer"): string {
  return file === "main" ? "main-" : "renderer-";
}

async function newestLogPath(
  file: "main" | "renderer",
  logsDir = join(QUANTFLOW_DIR, "logs"),
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(logsDir);
  } catch {
    return null;
  }

  const prefix = logFilePrefix(file);
  const candidates = entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".log"))
    .map((entry) => join(logsDir, entry));

  if (candidates.length === 0) return null;

  const withStats = await Promise.all(candidates.map(async (path) => ({
    path,
    mtimeMs: (await stat(path)).mtimeMs,
  })));
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0]?.path ?? null;
}

function lineMeetsLevel(
  line: string,
  minLevel: "info" | "warn" | "error" | undefined,
): boolean {
  if (!minLevel || minLevel === "info") return true;
  const lower = line.toLowerCase();
  if (minLevel === "warn") {
    return lower.includes("warn") || lower.includes("error");
  }
  return lower.includes("error");
}

export async function tailLogs(
  request: TailLogsRequest = {},
  options: { logsDir?: string } = {},
): Promise<TailLogsResult> {
  const file = request.file ?? "main";
  const lines = normalizeLines(request.lines);
  const path = await newestLogPath(file, options.logsDir);

  if (!path) {
    return {
      ok: false,
      file,
      path: null,
      lines,
      text: "",
      message: `No ${file} log file found.`,
    };
  }

  const raw = await readFile(path, "utf-8");
  const rawLines = raw.split(/\r?\n/);
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();
  const filtered = rawLines
    .filter((line) => lineMeetsLevel(line, request.filter?.minLevel));
  const text = filtered.slice(-lines).join("\n");

  return {
    ok: true,
    file,
    path,
    lines,
    text,
    message: `Read ${Math.min(lines, filtered.length)} lines from ${path}.`,
  };
}
