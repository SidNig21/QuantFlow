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
import { createTask } from "./runtime-state/tasks-repo";
import { appendEvent } from "./runtime-state/events-repo";

/** Maps tileId → herdr paneId for linked tiles */
const herdrLinks = new Map<string, string>();

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
): Promise<HerdrRouteResult> {
  const targetPaneId = herdrLinks.get(targetTileId);
  if (!targetPaneId) {
    return { outcome: "skipped", message: "target has no herdr pane link" };
  }

  const formatted = `[${fromLabel}]: ${text}`;

  try {
    await sendToPane(targetPaneId, formatted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "herdr send failed";

    appendEvent({
      kind: "relay.herdr.error",
      tileId: fromTileId,
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

  appendEvent({
    kind: "relay.herdr.sent",
    tileId: fromTileId,
    data: {
      connectionId,
      targetTileId,
      targetPaneId,
      routeMethod: "herdr",
      text,
      ok: true,
    },
  });

  createTask({
    cableId: connectionId,
    fromTileId,
    toTileId: targetTileId,
    payload: text,
  });

  return { outcome: "sent", message: "Relay sent via herdr" };
}

/** Resets internal state — used only in tests */
export function _resetHerdrRoutesForTests(): void {
  herdrLinks.clear();
}
