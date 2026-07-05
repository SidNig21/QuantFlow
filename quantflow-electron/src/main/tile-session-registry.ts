import { listSessions } from "./pty";
import type { RoleRuntimeTarget } from "./role-service";

export interface TileRelayBinding {
  runtimeTarget: RoleRuntimeTarget;
  herdrPaneId?: string;
  ptySessionId?: string;
}

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
  relay?: TileRelayBinding;
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
  void pushConnectionGraphToHost(connections);
}

async function hostSidecarBaseUrl(): Promise<string | null> {
  try {
    const { resolveAgentOsHostAddress } = await import('@qf-harness/agentos/host-lifecycle');
    const port = Number.parseInt(
      process.env.AGENTOS_HOST_PORT ?? process.env.QF_AGENTOS_PORT ?? '7430',
      10,
    );
    const host = await resolveAgentOsHostAddress({ port });
    return `http://${host}:${port}`;
  } catch {
    return null;
  }
}

/** Push Kernel-synced cables to the WSL host for agentos-cable toolkit ACL. */
export async function pushConnectionGraphToHost(
  connections: ConnectionGraphEntry[],
): Promise<void> {
  const base = await hostSidecarBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/connections/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ connections }),
    });
  } catch {
    // Host may be down during unit tests.
  }
}

/** Register tile↔session on the host so toolkit sends resolve fromTileId. */
export async function registerHostTileSession(
  tileId: string,
  sessionId: string,
): Promise<void> {
  const base = await hostSidecarBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/tile-registry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tileId, sessionId }),
    });
  } catch {
    // Best-effort when host is unavailable.
  }
}

export function registerTileSession(
  tileId: string,
  sessionId: string,
  label: string,
  routeHandle?: string,
  statusParser?: TileStatusParser,
  relay?: TileRelayBinding,
): void {
  const prior = tileRegistry.get(tileId);
  const entry: TileSession = {
    sessionId,
    label,
    lastActivityTs: Date.now(),
  };
  if (routeHandle) entry.routeHandle = routeHandle;
  if (statusParser) entry.statusParser = statusParser;
  if (relay) entry.relay = relay;
  else if (prior?.relay) entry.relay = prior.relay;
  tileRegistry.set(tileId, entry);
}

export function registerTileRelayBinding(
  tileId: string,
  relay: TileRelayBinding,
): void {
  const prior = tileRegistry.get(tileId);
  if (prior) {
    prior.relay = relay;
    tileRegistry.set(tileId, prior);
    return;
  }
  tileRegistry.set(tileId, {
    sessionId: tileId,
    label: tileId,
    relay,
    lastActivityTs: Date.now(),
  });
}

export function getTileRelayBinding(tileId: string): TileRelayBinding | null {
  return tileRegistry.get(tileId)?.relay ?? null;
}

export function unregisterTileSession(tileId: string): void {
  tileRegistry.delete(tileId);
}

export function getConnectionById(connectionId: string): ConnectionGraphEntry | null {
  return connectionGraph.get(connectionId) ?? null;
}

export function removeConnectionFromGraph(connectionId: string): void {
  connectionGraph.delete(connectionId);
}

interface RelayLogEntry {
  connectionId: string;
  fromTileId: string;
  toTileId: string;
  text: string;
  ts: number;
}

const relayLogs = new Map<string, RelayLogEntry[]>();

export function appendRelayLog(entry: Omit<RelayLogEntry, "ts">): void {
  const list = relayLogs.get(entry.connectionId) ?? [];
  list.push({ ...entry, ts: Date.now() });
  relayLogs.set(entry.connectionId, list.slice(-100));
}

/** Relay logs for watchtower / proof gates (V4 A2A). */
export function getAllRelayLogs(limit = 50): RelayLogEntry[] {
  const all = [...relayLogs.values()].flat().sort((a, b) => b.ts - a.ts);
  return all.slice(0, limit);
}

export function getStringLog(connectionId: string, limit = 50): RelayLogEntry[] {
  const list = relayLogs.get(connectionId) ?? [];
  return list.slice(-limit);
}
