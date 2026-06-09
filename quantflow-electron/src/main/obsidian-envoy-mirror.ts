import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { readVaultConfig } from "./vault-config";
import { ensureEnvoyListener } from "./envoy-listener";
import type { NormalizedEnvoyPacket } from "./envoy-listener";
import { getEnvoyService } from "./envoy-service";

const DEFAULT_VAULT_PATH = "C:\\Users\\rybow\\Obsidian\\Cursor Collab";
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
  return cfg.vaultPath?.trim() || DEFAULT_VAULT_PATH;
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
  const envoy = getEnvoyService();
  const tasksJson = await envoy.listTasks({
    envoySpaceId,
    includeCompleted: true,
  });
  const content = [
    "# Envoy Task Board",
    "",
    `Updated: ${formatTimestamp()}`,
    `Canvas space: ${envoySpaceId}`,
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

  const poll = async (): Promise<void> => {
    if (stopped) return;
    try {
      await writeTaskBoard(dir, options.envoySpaceId);
      await writeHistory(dir, options.envoySpaceId);
    } catch {
      // Mirror is best-effort; Envoy CLI may be unavailable during startup.
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
