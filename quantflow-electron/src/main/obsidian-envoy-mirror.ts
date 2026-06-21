import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { readVaultConfig } from "./vault-config";
import { resolveVaultPath as resolveConfiguredVaultPath } from "./vault-paths";
import { ensureEnvoyListener } from "./envoy-listener";
import type { NormalizedEnvoyPacket } from "./envoy-listener";
import { getEnvoyService } from "./envoy-service";
import { listEnvoyReceipts, listEnvoyTasks } from "./runtime-state/envoy-repo";
import type { EnvoyReceiptRow, EnvoyTaskRow } from "./runtime-state/types";

const POLL_INTERVAL_MS = 2000;
const LIVE_MAX_LINES = 500;

export interface ObsidianMirrorOptions {
  canvasId: string;
  envoySpaceId: string;
  vaultPath?: string | null;
}

interface ActiveMirror {
  stop(): void;
}

const mirrors = new Map<string, ActiveMirror>();

function envoyMirrorDir(vaultPath: string): string {
  return join(vaultPath, "Projects", "QuantFlow", "Envoy");
}

async function resolveVaultPath(explicit?: string | null): Promise<string> {
  if (explicit?.trim()) return explicit.trim();
  const cfg = await readVaultConfig();
  return resolveConfiguredVaultPath(cfg.vaultPath);
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatLiveLine(packet: NormalizedEnvoyPacket): string {
  const time = new Date(packet.timestamp).toISOString().slice(11, 19);
  const summary = JSON.stringify(packet.raw);
  return `- ${time} ${summary}`;
}

async function writeTaskBoard(
  dir: string,
  envoySpaceId: string,
): Promise<void> {
  const tasksJson = JSON.stringify(
    listEnvoyTasks({ status: "all" }),
    null,
    2,
  );
  const content = [
    "# Envoy Task Board",
    "",
    `Updated: ${formatTimestamp()}`,
    `Active mirror space: ${envoySpaceId}`,
    "Scope: all local QuantFlow task rows",
    "",
    "```json",
    tasksJson.trim(),
    "```",
    "",
  ].join("\n");
  await atomicWrite(join(dir, "task-board.md"), content);
}

async function writeHistory(
  dir: string,
  envoySpaceId: string,
): Promise<void> {
  const envoy = getEnvoyService();
  const historyRaw = await envoy.getHistory({
    envoySpaceId,
    limit: 200,
  });
  const content = [
    "# Envoy Space History",
    "",
    `Updated: ${formatTimestamp()}`,
    `Canvas space: ${envoySpaceId}`,
    "",
    "```json",
    historyRaw.trim(),
    "```",
    "",
  ].join("\n");
  await atomicWrite(join(dir, "history.md"), content);
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function formatMs(ms: number | null | undefined): string {
  if (!ms) return "-";
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(ms);
  }
}

function cleanDisplayText(value: string): string {
  return value
    .replace(/\u00e2\u20ac\u201d/g, "-")
    .replace(/\u00e2\u20ac\u201c/g, "-")
    .replace(/\u00e2\u20ac\u2122/g, "'")
    .replace(/\u00e2\u20ac\u0153/g, '"')
    .replace(/\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00c2\u00a7/g, "Section ");
}

export function safeEnvoyResultFilePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "untitled";
}

function resultText(task: EnvoyTaskRow): string {
  if (task.result_summary?.trim()) return cleanDisplayText(task.result_summary.trim());
  if (task.status === "done") return "Completed without a result summary.";
  if (task.status === "blocked") return "Blocked without a blocker summary.";
  if (task.status === "failed") return "Failed without a failure summary.";
  return "No result yet.";
}

function formatReceiptLine(receipt: EnvoyReceiptRow): string {
  const payload = parseJsonObject(receipt.payload);
  const summary = payload.summary
    ?? payload.result_summary
    ?? payload.reason
    ?? payload.message
    ?? "";
  const suffix = typeof summary === "string" && summary.trim()
    ? ` - ${cleanDisplayText(summary.trim())}`
    : "";
  return `- ${formatMs(receipt.created_at)} - ${receipt.kind} - ${receipt.agent_name ?? receipt.actor_tile_id ?? "unknown"}${suffix}`;
}

export function buildTaskResultNote(task: EnvoyTaskRow, receipts: EnvoyReceiptRow[]): string {
  const artifacts = parseJsonArray(task.artifact_paths);
  const acceptance = parseJsonArray(task.acceptance_criteria);
  return [
    `# ${cleanDisplayText(task.title)}`,
    "",
    `Status: ${task.status}`,
    `Task ID: ${task.task_id}`,
    `Correlation ID: ${task.correlation_id}`,
    `Envoy space: ${task.envoy_space_id}`,
    `Agent: ${task.claimed_by ?? "-"}`,
    `Updated: ${formatMs(task.updated_at)}`,
    "",
    "## Instruction",
    "",
    cleanDisplayText(task.instruction.trim()) || "-",
    "",
    "## Result",
    "",
    resultText(task),
    "",
    "## Acceptance Criteria",
    "",
    ...(acceptance.length ? acceptance.map((item) => `- ${cleanDisplayText(item)}`) : ["- None recorded"]),
    "",
    "## Artifacts",
    "",
    ...(artifacts.length ? artifacts.map((item) => `- ${cleanDisplayText(item)}`) : ["- None recorded"]),
    "",
    "## Receipt Trail",
    "",
    ...(receipts.length ? receipts.map(formatReceiptLine) : ["- No receipts recorded"]),
    "",
  ].join("\n");
}

async function writeRunResults(dir: string): Promise<void> {
  const tasks = listEnvoyTasks({ status: "all" });
  const visibleTasks = tasks
    .filter((task) => ["done", "blocked", "failed"].includes(task.status))
    .sort((a, b) => b.updated_at - a.updated_at);
  const latestUpdate = visibleTasks.reduce(
    (latest, task) => Math.max(latest, task.updated_at),
    0,
  );
  const rows = visibleTasks.slice(0, 50).map((task) => {
    const fileName = `${safeEnvoyResultFilePart(task.updated_at.toString())}-${safeEnvoyResultFilePart(task.title)}-${task.task_id.slice(0, 8)}.md`;
    return { task, fileName };
  });
  const content = [
    "# Envoy Run Results",
    "",
    "Human-readable results from the legacy Envoy bridge. Kernel/OKF exports remain the canonical v3 evidence path.",
    "",
    `Latest result update: ${formatMs(latestUpdate)}`,
    "",
    "## Recent Results",
    "",
    ...(rows.length
      ? rows.map(({ task, fileName }) =>
          `- **${task.status}** [[runs/${fileName}|${task.title}]] - ${task.claimed_by ?? "unclaimed"} - ${task.correlation_id}`,
        )
      : ["- No completed, blocked, or failed Envoy tasks yet."]),
    "",
  ].join("\n");

  await atomicWrite(join(dir, "run-results.md"), content);
  await mkdir(join(dir, "runs"), { recursive: true });
  await Promise.all(rows.map(async ({ task, fileName }) => {
    const receipts = listEnvoyReceipts({ taskId: task.task_id });
    await atomicWrite(
      join(dir, "runs", fileName),
      buildTaskResultNote(task, receipts),
    );
  }));
}

async function appendLive(
  dir: string,
  line: string,
  existingLines: string[],
): Promise<string[]> {
  const next = [...existingLines, line];
  const trimmed = next.length > LIVE_MAX_LINES
    ? next.slice(-LIVE_MAX_LINES)
    : next;
  const content = [
    "# Envoy Live Feed",
    "",
    `Updated: ${formatTimestamp()}`,
    "",
    ...trimmed,
    "",
  ].join("\n");
  await atomicWrite(join(dir, "live.md"), content);
  return trimmed;
}

export async function ensureObsidianEnvoyMirror(
  options: ObsidianMirrorOptions,
): Promise<void> {
  const existing = mirrors.get(options.envoySpaceId);
  if (existing) return;

  const vaultPath = await resolveVaultPath(options.vaultPath);
  const dir = envoyMirrorDir(vaultPath);
  const listener = ensureEnvoyListener(options.envoySpaceId);

  let liveLines: string[] = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let pollInFlight = false;

  const poll = async (): Promise<void> => {
    if (stopped) return;
    // Envoy history calls can take far longer than the poll interval under
    // load; overlapping polls stack unbounded envoy CLI processes and starve
    // every other Envoy op (taskCreate timeouts mid-trial).
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      await writeTaskBoard(dir, options.envoySpaceId);
      await writeHistory(dir, options.envoySpaceId);
      await writeRunResults(dir);
    } catch {
      // Mirror is best-effort; Envoy CLI may be unavailable during startup.
    } finally {
      pollInFlight = false;
    }
  };

  const unsubscribe = listener.onPacket(async (packet) => {
    if (stopped) return;
    try {
      liveLines = await appendLive(dir, formatLiveLine(packet), liveLines);
    } catch {
      // ignore live feed write errors
    }
  });

  await poll();
  pollTimer = setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);

  const handle: ActiveMirror = {
    stop() {
      stopped = true;
      unsubscribe();
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      mirrors.delete(options.envoySpaceId);
    },
  };
  mirrors.set(options.envoySpaceId, handle);
}

export function stopAllObsidianEnvoyMirrors(): void {
  for (const mirror of mirrors.values()) {
    mirror.stop();
  }
  mirrors.clear();
}

export function _resetObsidianMirrorsForTesting(): void {
  stopAllObsidianEnvoyMirrors();
}
