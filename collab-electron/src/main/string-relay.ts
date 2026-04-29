import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { COLLAB_DIR } from "./paths";
import { writeToSession } from "./pty";

const RELAY_LOG_PATH = join(COLLAB_DIR, "string-relay-log.ndjson");
const LOG_RING_CAP = 100;

export interface RelayRequest {
  connectionId: string;
  fromTileId: string;
  fromLabel: string;
  targetTileId: string;
  targetSessionId: string | null;
  text: string;
}

export interface RelayResult {
  ok: true;
  formatted: string;
}

export interface RelayLogEntry {
  connectionId: string;
  fromTileId: string;
  targetTileId: string;
  fromLabel: string;
  text: string;
  formatted: string;
  ts: number;
}

// Per-connection in-memory ring buffers
const logRings = new Map<string, RelayLogEntry[]>();

// tile-session registry for agent-initiated relay (Phase 4)
interface TileSession {
  sessionId: string;
  label: string;
  lastLine?: string;
  lastActivityTs?: number;
}
const tileRegistry = new Map<string, TileSession>();

export interface TileSnapshot {
  tileId: string;
  label: string;
  sessionId: string;
  lastLine: string;
  lastActivityTs: number;
  status: "active" | "idle" | "quiet";
}

export function watchtowerSnapshot(): TileSnapshot[] {
  const now = Date.now();
  return [...tileRegistry.entries()].map(([tileId, entry]) => {
    const age = entry.lastActivityTs != null ? now - entry.lastActivityTs : Infinity;
    const status: TileSnapshot["status"] =
      age < 5_000 ? "active" : age < 30_000 ? "idle" : "quiet";
    return {
      tileId,
      label: entry.label,
      sessionId: entry.sessionId,
      lastLine: entry.lastLine ?? "",
      lastActivityTs: entry.lastActivityTs ?? 0,
      status,
    };
  });
}

export function getAllRelayLogs(
  limit = 50,
): RelayLogEntry[] {
  const all: RelayLogEntry[] = [];
  for (const ring of logRings.values()) {
    all.push(...ring);
  }
  all.sort((a, b) => a.ts - b.ts);
  return all.slice(-limit);
}
// Line buffers for agent-initiated relay (Phase 4)
const lineBuffers = new Map<string, string>();

export function relayStringMessage(req: RelayRequest): RelayResult {
  const { connectionId, fromTileId, targetTileId, fromLabel, targetSessionId, text } = req;

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("relay message must not be empty");
  }

  if (!targetSessionId) {
    throw new Error(`target tile ${targetTileId} has no active PTY session`);
  }

  const formatted = `[${fromLabel}]: ${trimmed}`;
  writeToSession(targetSessionId, formatted + "\n");

  const entry: RelayLogEntry = {
    connectionId,
    fromTileId,
    targetTileId,
    fromLabel,
    text: trimmed,
    formatted,
    ts: Date.now(),
  };

  // Update ring buffer
  let ring = logRings.get(connectionId);
  if (!ring) {
    ring = [];
    logRings.set(connectionId, ring);
  }
  ring.push(entry);
  if (ring.length > LOG_RING_CAP) ring.shift();

  // Append to NDJSON log (fire-and-forget)
  appendRelayLog(entry);

  return { ok: true, formatted };
}

export function getStringLog(
  connectionId: string,
  limit = 50,
): RelayLogEntry[] {
  const ring = logRings.get(connectionId) ?? [];
  return ring.slice(-Math.max(1, limit));
}

async function appendRelayLog(entry: RelayLogEntry): Promise<void> {
  try {
    await mkdir(COLLAB_DIR, { recursive: true });
    await appendFile(RELAY_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Non-fatal: log write failures should not break relay
  }
}

// ── Agent-initiated relay support (Phase 4) ──────────────────────────

export function registerTileSession(
  tileId: string,
  sessionId: string,
  label: string,
): void {
  tileRegistry.set(tileId, { sessionId, label });
}

export function unregisterTileSession(tileId: string): void {
  tileRegistry.delete(tileId);
  lineBuffers.delete(tileId);
}

// Returns the tileId for a given sessionId, or null
function tileIdForSession(sessionId: string): string | null {
  for (const [tileId, entry] of tileRegistry) {
    if (entry.sessionId === sessionId) return tileId;
  }
  return null;
}

// Returns connections for a tile (imported lazily to avoid circular deps)
// Resolved at call time so canvas state is always current
function getConnectionsForTileId(tileId: string): Array<{ tileAId: string; tileBId: string; id: string }> {
  try {
    // canvas-persistence is the source of truth for connections in main
    // but connections live in renderer state. We rely on the registry
    // for routing: tileId -> sessionId -> relay target by label.
    // Actual connection lookup is done by label matching against registry.
    return [];
  } catch {
    return [];
  }
}

const RELAY_PREFIX_RE = /^>>@(.+?):\s*(.+)$/;

export function onPtyData(sessionId: string, chunk: string): void {
  const fromTileId = tileIdForSession(sessionId);
  if (!fromTileId) return;

  // Track last activity
  const registryEntry = tileRegistry.get(fromTileId);
  if (registryEntry) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      registryEntry.lastLine = lines[lines.length - 1]!;
    }
    registryEntry.lastActivityTs = Date.now();
  }

  // Accumulate into line buffer
  let buf = (lineBuffers.get(fromTileId) ?? "") + chunk;
  const lines = buf.split("\n");
  // Keep incomplete last line in buffer
  lineBuffers.set(fromTileId, lines[lines.length - 1] ?? "");

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!.trim();
    const match = RELAY_PREFIX_RE.exec(line);
    if (!match) continue;

    const targetLabel = match[1]!.trim();
    const message = match[2]!.trim();

    // Find a registered tile whose label matches
    let targetTileId: string | null = null;
    let targetSessionId: string | null = null;
    let ambiguous = false;

    for (const [tid, entry] of tileRegistry) {
      if (tid === fromTileId) continue;
      if (entry.label.toLowerCase() === targetLabel.toLowerCase()) {
        if (targetTileId !== null) {
          ambiguous = true;
          break;
        }
        targetTileId = tid;
        targetSessionId = entry.sessionId;
      }
    }

    if (ambiguous) {
      console.warn(`[string-relay] ambiguous target label "${targetLabel}" — skipping`);
      continue;
    }

    if (!targetTileId || !targetSessionId) {
      console.warn(`[string-relay] no registered tile with label "${targetLabel}" — skipping`);
      continue;
    }

    const fromEntry = tileRegistry.get(fromTileId);
    const fromLabel = fromEntry?.label ?? fromTileId;

    // We don't have connectionId here; use a synthetic one for logging
    const connectionId = `agent:${fromTileId}:${targetTileId}`;

    try {
      relayStringMessage({
        connectionId,
        fromTileId,
        fromLabel,
        targetTileId,
        targetSessionId,
        text: message,
      });
    } catch (err) {
      console.warn("[string-relay] agent-relay failed:", err);
    }
  }
}
