/**
 * herdr-routes.ts
 *
 * Phase 3C: Routes cable messages through herdr when BOTH tile endpoints
 * have a registered herdrPaneId.  The legacy PTY path (writeToSession) is
 * used for tiles that have no herdr linkage.
 *
 * Integration points
 * ──────────────────
 * • registerHerdrPaneLink(tileId, paneId) — called by ipc-herdr when the
 *   renderer links a tile to a herdr pane.
 * • unregisterHerdrPaneLink(tileId) — called when the link is removed.
 * • shouldRouteViaHerdr(fromTileId, targetTileId) — checked in string-relay
 *   before falling back to PTY.
 * • routeViaHerdr(req, fromLabel) — async send; returns RouteResult.
 */

import { sendToPane } from "./herdr-bridge";
import { createCorrelatedTask } from "./orchestration-service";
import { transitionTask } from "./runtime-state/tasks-repo";
import { appendEvent } from "./runtime-state/events-repo";
import { validatePayload } from "./runtime-state/schemas-repo";

/** Maps tileId → herdr paneId for linked tiles */
const herdrLinks = new Map<string, string>();

// ─── Correlated reply registry ────────────────────────────────────────────────

type PendingReply = {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingReplies = new Map<string, PendingReply>();

/**
 * Resolves an awaiting correlated reply. Called when a target tile sends
 * a response carrying the original correlation_id.
 * Returns true if a pending waiter was found and resolved.
 */
export function resolveCorrelatedReply(
  correlationId: string,
  result: string,
): boolean {
  const pending = pendingReplies.get(correlationId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingReplies.delete(correlationId);
  pending.resolve(result);
  return true;
}

/**
 * Returns a Promise that resolves when the target tile replies with the given
 * correlation_id, or rejects after timeoutMs (default 30s).
 */
export function awaitCorrelatedReply(
  correlationId: string,
  timeoutMs = 30_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReplies.delete(correlationId);
      reject(
        new Error(
          `Correlated reply timeout after ${timeoutMs}ms (correlation_id: ${correlationId})`,
        ),
      );
    }, timeoutMs);
    pendingReplies.set(correlationId, { resolve, reject, timer });
  });
}

export function registerHerdrPaneLink(tileId: string, paneId: string): void {
  herdrLinks.set(tileId, paneId);
}

export function unregisterHerdrPaneLink(tileId: string): void {
  herdrLinks.delete(tileId);
}

export function getHerdrPaneId(tileId: string): string | undefined {
  return herdrLinks.get(tileId);
}

/**
 * Returns true only when BOTH endpoints are herdr-linked.
 * When only the target is linked the message still goes through PTY so the
 * caller (string-relay) falls through to its legacy code path.
 */
export function shouldRouteViaHerdr(
  fromTileId: string,
  targetTileId: string,
): boolean {
  return herdrLinks.has(fromTileId) && herdrLinks.has(targetTileId);
}

export type HerdrRouteOutcome = "sent" | "skipped" | "error";

export interface HerdrRouteResult {
  outcome: HerdrRouteOutcome;
  message: string;
  correlationId?: string;
}

/**
 * Sends a cable message to the target pane via herdr.
 * Records the event in the runtime state repos so the relay log stays
 * consistent regardless of the underlying transport.
 *
 * Does NOT throw — errors are captured and returned as { outcome: "error" }.
 */
export async function routeViaHerdr(
  connectionId: string,
  fromTileId: string,
  targetTileId: string,
  fromLabel: string,
  text: string,
  schemaId?: string | null,
): Promise<HerdrRouteResult> {
  const targetPaneId = herdrLinks.get(targetTileId);
  if (!targetPaneId) {
    return { outcome: "skipped", message: "target has no herdr pane link" };
  }

  // §5 schema validation — permissive when schema not in registry.
  if (schemaId) {
    const rejection = validatePayload(schemaId, text);
    if (rejection) {
      appendEvent({
        kind: "schema.rejected",
        tileId: fromTileId,
        cableId: connectionId,
        data: rejection,
      });
      return { outcome: "error", message: `schema_validation_failed: ${rejection.violations.map((v) => v.message).join("; ")}` };
    }
  }

  const formatted = `[${fromLabel}]: ${text}`;

  try {
    await sendToPane(targetPaneId, formatted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "herdr send failed";

    appendEvent({
      kind: "relay.herdr.error",
      tileId: fromTileId,
      cableId: connectionId,
      data: {
        connectionId,
        targetTileId,
        targetPaneId,
        routeMethod: "herdr",
        text,
        ok: false,
        error: message,
      },
    });

    return { outcome: "error", message };
  }

  const task = createCorrelatedTask({
    cableId: connectionId,
    fromTileId,
    toTileId: targetTileId,
    payload: text,
    schemaId,
  });
  transitionTask(task.id, "sent");

  appendEvent({
    kind: "relay.herdr.sent",
    tileId: fromTileId,
    cableId: connectionId,
    taskId: task.id,
    correlationId: task.correlation_id,
    traceId: task.trace_id,
    data: {
      connectionId,
      targetTileId,
      targetPaneId,
      routeMethod: "herdr",
      text,
      ok: true,
    },
  });

  return {
    outcome: "sent",
    message: "Relay sent via herdr",
    correlationId: task.correlation_id ?? undefined,
  };
}

/** Resets internal state — used only in tests */
export function _resetHerdrRoutesForTests(): void {
  herdrLinks.clear();
  pendingReplies.clear();
}
