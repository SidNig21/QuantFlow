import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";
import { listSessions, writeToSession } from "./pty";
import { createCorrelatedTask } from "./orchestration-service";
import { transitionTask } from "./runtime-state/tasks-repo";
import { appendEvent } from "./runtime-state/events-repo";
import { shouldRouteViaHerdr, routeViaHerdr } from "./herdr-routes";
import { validatePayload } from "./runtime-state/schemas-repo";
import {
  incrementQueueDepth,
  decrementQueueDepth,
  QUEUE_DEPTH_MAX,
} from "./runtime-state/connections-repo";

const RELAY_LOG_PATH = join(QUANTFLOW_DIR, "string-relay-log.ndjson");
const LOG_RING_CAP = 100;
const EVENT_RING_CAP = 250;

export interface RelayRequest {
  connectionId: string;
  fromTileId: string;
  fromLabel: string;
  targetTileId: string;
  targetSessionId: string | null;
  text: string;
  schemaId?: string | null;
}

export interface RelayConnectionRequest {
  connectionId: string;
  fromTileId: string;
  text: string;
  schemaId?: string | null;
}

export type RelayRouteMethod = "manual" | "agent";

export type RelayErrorCode =
  | "empty_message"
  | "missing_pty"
  | "no_route"
  | "ambiguous_route"
  | "unconnected_target"
  | "write_failed"
  | "schema_validation_failed"
  | "relay_overflow";

export type RelayResult =
  | {
    ok: true;
    formatted: string;
    eventId: string;
    message: string;
  }
  | {
    ok: false;
    eventId: string;
    errorCode: RelayErrorCode;
    message: string;
  };

export interface RelayEvent {
  eventId: string;
  type: "relay.sent" | "relay.failed";
  ok: boolean;
  connectionId: string;
  fromTileId: string;
  targetTileId: string | null;
  fromLabel: string;
  targetLabel?: string;
  routeMethod: RelayRouteMethod;
  text: string;
  formatted: string;
  ts: number;
  errorCode?: RelayErrorCode;
  message: string;
  correlationId?: string;
  traceId?: string;
  schemaId?: string | null;
}

export interface RelayLogEntry extends RelayEvent {}

export interface ConnectionGraphEntry {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
}

interface TileSession {
  sessionId: string;
  label: string;
  routeHandle?: string;
  statusParser?: TileStatusParser;
  lastLine?: string;
  lastActivityTs?: number;
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

const logRings = new Map<string, RelayLogEntry[]>();
const eventRing: RelayLogEntry[] = [];
const tileRegistry = new Map<string, TileSession>();
const lineBuffers = new Map<string, string>();
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

export function getAllRelayLogs(limit = 50): RelayLogEntry[] {
  return eventRing.slice(-Math.max(1, limit));
}

export function relayConnectionMessage(
  req: RelayConnectionRequest,
): RelayResult {
  const input = req ?? ({} as RelayConnectionRequest);
  const connectionId = String(input.connectionId ?? "").trim();
  const fromTileId = String(input.fromTileId ?? "").trim();
  const text = String(input.text ?? "");
  const connection = connectionGraph.get(connectionId);
  const fromEntry = tileRegistry.get(fromTileId);
  const fromLabel = fromEntry?.label ?? fromTileId;

  if (!connection) {
    return relayFailed({
      connectionId: connectionId || "missing-connection",
      fromTileId: fromTileId || "missing-source",
      targetTileId: null,
      fromLabel: fromLabel || "Unknown",
      routeMethod: "manual",
      text,
      errorCode: "no_route",
      message: `Connection ${connectionId || "(missing)"} was not found.`,
    });
  }

  const targetTileId = connection.tileAId === fromTileId
    ? connection.tileBId
    : connection.tileBId === fromTileId
      ? connection.tileAId
      : null;

  if (!targetTileId) {
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId: null,
      fromLabel,
      routeMethod: "manual",
      text,
      errorCode: "unconnected_target",
      message:
        `Source tile ${fromTileId || "(missing)"} is not an endpoint of ${connectionId}.`,
    });
  }

  const targetEntry = tileRegistry.get(targetTileId);
  return relayStringMessage({
    connectionId,
    fromTileId,
    fromLabel,
    targetTileId,
    targetSessionId: targetEntry?.sessionId ?? null,
    text,
    schemaId: input.schemaId,
  }, "manual");
}

export function relayStringMessage(
  req: RelayRequest,
  routeMethod: RelayRouteMethod = "manual",
): RelayResult {
  const {
    connectionId,
    fromTileId,
    targetTileId,
    fromLabel,
    targetSessionId,
    text,
    schemaId,
  } = req;

  const trimmed = text.trim();
  if (!trimmed) {
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text,
      errorCode: "empty_message",
      message: "Relay message must not be empty.",
    });
  }

  if (!findConnection(connectionId, fromTileId, targetTileId)) {
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      errorCode: "unconnected_target",
      message: "Relay blocked because the tiles are not connected by this cable.",
    });
  }

  if (!targetSessionId) {
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      errorCode: "missing_pty",
      message: `Target tile ${targetTileId} has no active PTY session.`,
    });
  }

  if (!listSessions().includes(targetSessionId)) {
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      errorCode: "missing_pty",
      message: `Target PTY session ${targetSessionId} is not active.`,
    });
  }

  // §5 schema validation — fires before task creation; permissive when schema not in registry.
  if (schemaId) {
    const rejection = validatePayload(schemaId, trimmed);
    if (rejection) {
      return relayFailed({
        connectionId,
        fromTileId,
        targetTileId,
        fromLabel,
        routeMethod,
        text: trimmed,
        errorCode: "schema_validation_failed",
        message: `Schema validation failed for schema '${schemaId}': ${rejection.violations.map((v) => v.message).join("; ")}`,
        schemaRejection: rejection,
      });
    }
  }

  // §6 / spine §2.6 backpressure — increment queue_depth before send.
  // If depth exceeds QUEUE_DEPTH_MAX, emit relay.overflow event and reject.
  const { queue_depth, overflow } = incrementQueueDepth(connectionId);
  if (overflow) {
    appendEvent({
      kind: "relay.overflow",
      tileId: fromTileId,
      cableId: connectionId,
      level: "warn",
      data: {
        connectionId,
        fromTileId,
        targetTileId,
        queue_depth,
        queue_depth_max: QUEUE_DEPTH_MAX,
      },
    });
    decrementQueueDepth(connectionId);
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      errorCode: "relay_overflow",
      message: `Cable ${connectionId} is at capacity (queue_depth ${queue_depth} > ${QUEUE_DEPTH_MAX}). Message dropped.`,
    });
  }

  const formatted = `[${fromLabel}]: ${trimmed}`;

  // Phase 3C: when BOTH tiles are herdr-linked, route through herdr instead.
  // The function is async but relayStringMessage is sync; we fire-and-forget
  // and immediately return a success frame so callers aren't blocked.
  // The runtime state (event + task) is written inside routeViaHerdr.
  // Decrement is called inside routeViaHerdr after async completion.
  if (shouldRouteViaHerdr(fromTileId, targetTileId)) {
    void routeViaHerdr(connectionId, fromTileId, targetTileId, fromLabel, trimmed)
      .finally(() => decrementQueueDepth(connectionId));
    return relaySent({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      formatted,
      schemaId,
    });
  }

  // Legacy PTY path for tiles without herdr pane links.
  try {
    writeToSession(targetSessionId, formatted + "\n");
  } catch (err) {
    decrementQueueDepth(connectionId);
    return relayFailed({
      connectionId,
      fromTileId,
      targetTileId,
      fromLabel,
      routeMethod,
      text: trimmed,
      errorCode: "write_failed",
      message: err instanceof Error ? err.message : "Relay write failed.",
    });
  }

  decrementQueueDepth(connectionId);
  return relaySent({
    connectionId,
    fromTileId,
    targetTileId,
    fromLabel,
    routeMethod,
    text: trimmed,
    formatted,
    schemaId,
  });
}

export function getStringLog(
  connectionId: string,
  limit = 50,
): RelayLogEntry[] {
  const ring = logRings.get(connectionId) ?? [];
  return ring.slice(-Math.max(1, limit));
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
  const entry: TileSession = { sessionId, label };
  if (routeHandle) entry.routeHandle = routeHandle;
  if (statusParser) entry.statusParser = statusParser;
  tileRegistry.set(tileId, entry);
}

export function unregisterTileSession(tileId: string): void {
  tileRegistry.delete(tileId);
  lineBuffers.delete(tileId);
}

export function onPtyData(sessionId: string, chunk: string): void {
  const fromTileId = tileIdForSession(sessionId);
  if (!fromTileId) return;

  const registryEntry = tileRegistry.get(fromTileId);
  if (registryEntry) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      registryEntry.lastLine = lines[lines.length - 1]!;
    }
    registryEntry.lastActivityTs = Date.now();
  }

  const buf = (lineBuffers.get(fromTileId) ?? "") + chunk;
  const lines = buf.split("\n");
  lineBuffers.set(fromTileId, lines[lines.length - 1] ?? "");

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!.trim();
    const match = RELAY_PREFIX_RE.exec(line);
    if (!match) continue;

    const targetLabel = match[1]!.trim();
    const message = match[2]!.trim();
    routeAgentRelay(fromTileId, targetLabel, message);
  }
}

export function resetStringRelayForTests(): void {
  logRings.clear();
  eventRing.length = 0;
  tileRegistry.clear();
  lineBuffers.clear();
  connectionGraph.clear();
}

const RELAY_PREFIX_RE = /^>>@(.+?):\s*(.+)$/;

function routeAgentRelay(
  fromTileId: string,
  targetLabel: string,
  message: string,
): void {
  const normalizedTarget = normalizeLabel(targetLabel);
  const fromEntry = tileRegistry.get(fromTileId);
  const fromLabel = fromEntry?.label ?? fromTileId;
  const globalMatches = [...tileRegistry.entries()]
    .filter(([tid, entry]) =>
      tid !== fromTileId && matchesTarget(entry, normalizedTarget),
    );
  const connectedCandidates = connectedEdges(fromTileId)
    .map(({ connection, otherTileId }) => ({
      connection,
      otherTileId,
      entry: tileRegistry.get(otherTileId),
    }))
    .filter((candidate) => candidate.entry != null);
  const connectedHandleMatches = connectedCandidates
    .filter((candidate) => normalizeHandle(candidate.entry!.routeHandle) === normalizedTarget);
  const connectedMatches = connectedHandleMatches.length > 0
    ? connectedHandleMatches
    : connectedCandidates.filter((candidate) =>
      normalizeLabel(candidate.entry!.label) === normalizedTarget,
    );

  if (connectedMatches.length > 1) {
    relayFailed({
      connectionId: `agent:${fromTileId}:${normalizedTarget}`,
      fromTileId,
      targetTileId: null,
      fromLabel,
      targetLabel,
      routeMethod: "agent",
      text: message,
      errorCode: "ambiguous_route",
      message: `Ambiguous relay target "${targetLabel}" across connected tiles.`,
    });
    return;
  }

  if (connectedMatches.length === 0) {
    relayFailed({
      connectionId: `agent:${fromTileId}:${normalizedTarget}`,
      fromTileId,
      targetTileId: globalMatches.length === 1 ? globalMatches[0]![0] : null,
      fromLabel,
      targetLabel,
      routeMethod: "agent",
      text: message,
      errorCode: globalMatches.length > 0 ? "unconnected_target" : "no_route",
      message: globalMatches.length > 0
        ? `Relay target "${targetLabel}" exists but is not connected to this tile.`
        : `No connected relay target matches "${targetLabel}".`,
    });
    return;
  }

  const connectedMatch = connectedMatches[0]!;
  relayStringMessage({
    connectionId: connectedMatch.connection.id,
    fromTileId,
    fromLabel,
    targetTileId: connectedMatch.otherTileId,
    targetSessionId: connectedMatch.entry!.sessionId,
    text: message,
  }, "agent");
}

function relayFailed(params: {
  connectionId: string;
  fromTileId: string;
  targetTileId: string | null;
  fromLabel: string;
  targetLabel?: string;
  routeMethod: RelayRouteMethod;
  text: string;
  errorCode: RelayErrorCode;
  message: string;
  schemaRejection?: import("./runtime-state/types").SchemaValidationRejection;
}): RelayResult {
  const eventId = makeEventId();
  const entry: RelayLogEntry = {
    eventId,
    type: "relay.failed",
    ok: false,
    connectionId: params.connectionId,
    fromTileId: params.fromTileId,
    targetTileId: params.targetTileId,
    fromLabel: params.fromLabel,
    routeMethod: params.routeMethod,
    text: params.text,
    formatted: params.message,
    ts: Date.now(),
    errorCode: params.errorCode,
    message: params.message,
  };
  if (params.targetLabel != null) entry.targetLabel = params.targetLabel;
  pushRelayEvent(entry, params.schemaRejection);
  return {
    ok: false,
    eventId,
    errorCode: params.errorCode,
    message: params.message,
  };
}

function relaySent(params: {
  connectionId: string;
  fromTileId: string;
  targetTileId: string;
  fromLabel: string;
  routeMethod: RelayRouteMethod;
  text: string;
  formatted: string;
  schemaId?: string | null;
}): RelayResult {
  const eventId = makeEventId();
  const entry: RelayLogEntry = {
    eventId,
    type: "relay.sent",
    ok: true,
    connectionId: params.connectionId,
    fromTileId: params.fromTileId,
    targetTileId: params.targetTileId,
    fromLabel: params.fromLabel,
    routeMethod: params.routeMethod,
    text: params.text,
    formatted: params.formatted,
    ts: Date.now(),
    message: "Relay sent",
    schemaId: params.schemaId,
  };
  pushRelayEvent(entry);
  return {
    ok: true,
    formatted: params.formatted,
    eventId,
    message: "Relay sent",
  };
}

function pushRelayEvent(
  entry: RelayLogEntry,
  schemaRejection?: import("./runtime-state/types").SchemaValidationRejection,
): void {
  let ring = logRings.get(entry.connectionId);
  if (!ring) {
    ring = [];
    logRings.set(entry.connectionId, ring);
  }
  ring.push(entry);
  if (ring.length > LOG_RING_CAP) ring.shift();

  eventRing.push(entry);
  if (eventRing.length > EVENT_RING_CAP) eventRing.shift();

  appendRelayLog(entry);

  // For schema rejections, emit a structured event instead of creating a task.
  if (schemaRejection) {
    appendEvent({
      kind: "schema.rejected",
      tileId: entry.fromTileId,
      cableId: entry.connectionId,
      taskId: null,
      correlationId: null,
      traceId: null,
      data: schemaRejection,
    });
    return;
  }

  // For sent messages, create a correlated task first so we have the
  // correlation_id and trace_id to attach to the mirrored event row.
  let correlationId: string | undefined;
  let traceId: string | undefined;
  let taskId: string | undefined;
  if (entry.type === "relay.sent") {
    const task = createCorrelatedTask({
      cableId: entry.connectionId,
      fromTileId: entry.fromTileId,
      toTileId: entry.targetTileId ?? "",
      payload: entry.text,
      sentAt: entry.ts,
      schemaId: entry.schemaId,
    });
    correlationId = task.correlation_id ?? undefined;
    traceId = task.trace_id ?? undefined;
    taskId = task.id;
    entry.correlationId = correlationId;
    entry.traceId = traceId;
    transitionTask(task.id, "sent");
  }

  appendEvent({
    kind: entry.type,
    tileId: entry.fromTileId,
    cableId: entry.connectionId,
    taskId: taskId ?? null,
    correlationId: correlationId ?? null,
    traceId: traceId ?? null,
    data: {
      connectionId: entry.connectionId,
      targetTileId: entry.targetTileId ?? null,
      routeMethod: entry.routeMethod,
      text: entry.text,
      ok: entry.ok,
    },
  });
}

async function appendRelayLog(entry: RelayLogEntry): Promise<void> {
  try {
    await mkdir(QUANTFLOW_DIR, { recursive: true });
    await appendFile(RELAY_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Non-fatal: log write failures should not break relay
  }
}

function makeEventId(): string {
  return `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findConnection(
  connectionId: string,
  fromTileId: string,
  targetTileId: string,
): ConnectionGraphEntry | null {
  const conn = connectionGraph.get(connectionId);
  if (!conn) return null;
  const direct = conn.tileAId === fromTileId && conn.tileBId === targetTileId;
  const reverse = conn.tileAId === targetTileId && conn.tileBId === fromTileId;
  return direct || reverse ? conn : null;
}

function tileIdForSession(sessionId: string): string | null {
  for (const [tileId, entry] of tileRegistry) {
    if (entry.sessionId === sessionId) return tileId;
  }
  return null;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/^@/, "").toLowerCase();
}

function normalizeHandle(handle: string | undefined): string {
  return (handle ?? "").trim().replace(/^@/, "").toLowerCase();
}

function matchesTarget(entry: TileSession, normalizedTarget: string): boolean {
  return normalizeHandle(entry.routeHandle) === normalizedTarget ||
    normalizeLabel(entry.label) === normalizedTarget;
}

function connectedEdges(tileId: string): Array<{
  connection: ConnectionGraphEntry;
  otherTileId: string;
}> {
  const edges: Array<{ connection: ConnectionGraphEntry; otherTileId: string }> = [];
  for (const conn of connectionGraph.values()) {
    if (conn.tileAId === tileId) {
      edges.push({ connection: conn, otherTileId: conn.tileBId });
    } else if (conn.tileBId === tileId) {
      edges.push({ connection: conn, otherTileId: conn.tileAId });
    }
  }
  return edges;
}
