import { listSessions } from "./pty";

export interface ConnectionGraphEntry {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
}

export interface TileSnapshot {
  tileId: string;
  label: string;
  routeHandle: string;
  sessionId: string;
  lastLine: string;
  lastActivityTs: number;
  status: TileSnapshotStatus;
}

export type TileSnapshotStatus =
  | "active"
  | "idle"
  | "quiet"
  | "waiting"
  | "blocked"
  | "exited";

export interface TileStatusParser {
  waiting?: string[];
  blocked?: string[];
}

interface TileSession {
  sessionId: string;
  label: string;
  routeHandle?: string;
  statusParser?: TileStatusParser;
  lastLine?: string;
  lastActivityTs?: number;
}

const tileRegistry = new Map<string, TileSession>();
const connectionGraph = new Map<string, ConnectionGraphEntry>();

export function watchtowerSnapshot(): TileSnapshot[] {
  const now = Date.now();
  const activeSessionIds = new Set(listSessions());
  return [...tileRegistry.entries()].map(([tileId, entry]) => {
    const age = entry.lastActivityTs != null
      ? now - entry.lastActivityTs
      : Infinity;
    const status = inferTileSnapshotStatus({
      hasActiveSession: activeSessionIds.has(entry.sessionId),
      lastLine: entry.lastLine ?? "",
      ageMs: age,
      statusParser: entry.statusParser,
    });
    return {
      tileId,
      label: entry.label,
      routeHandle: entry.routeHandle ?? "",
      sessionId: entry.sessionId,
      lastLine: entry.lastLine ?? "",
      lastActivityTs: entry.lastActivityTs ?? 0,
      status,
    };
  });
}

export function inferTileSnapshotStatus({
  hasActiveSession,
  lastLine,
  ageMs,
  statusParser,
}: {
  hasActiveSession: boolean;
  lastLine?: string;
  ageMs: number;
  statusParser?: TileStatusParser;
}): TileSnapshotStatus {
  if (!hasActiveSession) return "exited";
  const normalized = String(lastLine ?? "").trim().toLowerCase();
  if (normalized) {
    if (matchesStatusHints(normalized, statusParser?.blocked)) {
      return "blocked";
    }
    if (matchesStatusHints(normalized, statusParser?.waiting)) {
      return "waiting";
    }
    if (/\b(blocked|fatal|traceback|exception|panic)\b/.test(normalized) ||
      /\b(error|failed|failure):/.test(normalized)) {
      return "blocked";
    }
    if (/\b(waiting for|approval required|input required|press enter|press return|confirm)\b|continue\?|\byes\/no\b|\(y\/n\)|\[y\/n\]/.test(normalized)) {
      return "waiting";
    }
  }
  return ageMs < 5_000 ? "active" : ageMs < 30_000 ? "idle" : "quiet";
}

function matchesStatusHints(normalizedLine: string, hints?: string[]): boolean {
  if (!Array.isArray(hints)) return false;
  return hints.some((hint) => {
    const text = String(hint ?? "").trim().toLowerCase();
    return text.length > 0 && normalizedLine.includes(text);
  });
}

export function syncConnectionGraph(connections: ConnectionGraphEntry[]): void {
  connectionGraph.clear();
  for (const conn of connections) {
    if (!conn.id || !conn.tileAId || !conn.tileBId) continue;
    const entry: ConnectionGraphEntry = {
      id: conn.id,
      tileAId: conn.tileAId,
      tileBId: conn.tileBId,
    };
    if (conn.label != null) entry.label = conn.label;
    connectionGraph.set(conn.id, entry);
  }
}

export function registerTileSession(
  tileId: string,
  sessionId: string,
  label: string,
  routeHandle?: string,
  statusParser?: TileStatusParser,
): void {
  const entry: TileSession = {
    sessionId,
    label,
    lastActivityTs: Date.now(),
  };
  if (routeHandle) entry.routeHandle = routeHandle;
  if (statusParser) entry.statusParser = statusParser;
  tileRegistry.set(tileId, entry);
}

export function unregisterTileSession(tileId: string): void {
  tileRegistry.delete(tileId);
}

/** Relay logs retired with v1 string relay — returns empty until A2A. */
export function getAllRelayLogs(_limit = 50): [] {
  return [];
}

export function getStringLog(_connectionId: string, _limit = 50): [] {
  return [];
}
