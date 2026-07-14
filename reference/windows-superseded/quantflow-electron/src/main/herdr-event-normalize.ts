/**
 * Normalizes newline-delimited herdr socket events into QuantFlow status shapes.
 */

export type HerdrAgentStatus =
  | "idle"
  | "working"
  | "blocked"
  | "done"
  | "unknown";

const VALID_STATUSES = new Set<HerdrAgentStatus>([
  "idle",
  "working",
  "blocked",
  "done",
  "unknown",
]);

export interface NormalizedHerdrStatusEvent {
  kind: "pane.agent_status_changed";
  paneId: string;
  fromStatus: HerdrAgentStatus;
  toStatus: HerdrAgentStatus;
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export function coerceHerdrAgentStatus(value: unknown): HerdrAgentStatus {
  if (typeof value === "string" && VALID_STATUSES.has(value as HerdrAgentStatus)) {
    return value as HerdrAgentStatus;
  }
  return "unknown";
}

export function parseHerdrEventLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

export function isHerdrSubscriptionAck(line: Record<string, unknown>): boolean {
  const result = asRecord(line.result);
  if (!result) return false;
  const type = result.type;
  return type === "subscription_ack"
    || type === "subscribe_ack"
    || type === "events_subscribed";
}

export function normalizeHerdrEventLine(
  line: Record<string, unknown>,
): NormalizedHerdrStatusEvent | null {
  if (line.error) return null;
  if (isHerdrSubscriptionAck(line)) return null;
  if (line.id && line.result && line.event === undefined) return null;

  const payload = asRecord(line.event) ?? line;
  if (payload.type !== "pane.agent_status_changed") return null;

  const paneId =
    (typeof payload.pane_id === "string" && payload.pane_id)
    || (typeof payload.paneId === "string" && payload.paneId);
  if (!paneId) return null;

  const toStatus = coerceHerdrAgentStatus(
    payload.agent_status
    ?? payload.agentStatus
    ?? payload.to_status
    ?? payload.toStatus,
  );
  const fromStatus = coerceHerdrAgentStatus(
    payload.previous_agent_status
    ?? payload.previousAgentStatus
    ?? payload.from_status
    ?? payload.fromStatus
    ?? "unknown",
  );

  return {
    kind: "pane.agent_status_changed",
    paneId,
    fromStatus,
    toStatus,
    raw: payload,
  };
}
