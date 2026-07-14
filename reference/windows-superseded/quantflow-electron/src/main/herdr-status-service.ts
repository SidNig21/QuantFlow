/**
 * Gate 3: live herdr tile status from events.subscribe (main process).
 * NON-CANONICAL harness telemetry (Stage E1): pushes herdr:status-changed IPC
 * and appends herdr.agent_status to runtime events-repo. Renderer projection for
 * worker status must follow kernel:event worker.* after kernel.worker.status_update.
 */

import { HerdrEventSubscriber } from "./herdr-event-subscriber";
import {
  normalizeHerdrEventLine,
  type HerdrAgentStatus,
  type NormalizedHerdrStatusEvent,
} from "./herdr-event-normalize";
import { getTileIdForPane } from "./herdr-routes";
import { appendEvent } from "./runtime-state/events-repo";
import { appendStatusTransition, latestStatus } from "./runtime-state/status-repo";

export interface HerdrStatusChangedPayload {
  paneId: string;
  tileId: string | null;
  status: HerdrAgentStatus;
  fromStatus: HerdrAgentStatus;
  timestamp: number;
}

const paneStatusCache = new Map<string, HerdrAgentStatus>();

let subscriber: HerdrEventSubscriber | null = null;

function sendToShell(
  channel: "herdr:status-changed",
  payload: HerdrStatusChangedPayload,
): void {
  const { BrowserWindow } = require("electron") as typeof import("electron");
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function handleHerdrStatusEvent(
  event: NormalizedHerdrStatusEvent,
  deps: {
    getTileId?: (paneId: string) => string | undefined;
    getPreviousStatus?: (paneId: string) => HerdrAgentStatus | null;
    onStatusChanged?: (payload: HerdrStatusChangedPayload) => void;
    recordTransition?: typeof appendStatusTransition;
    recordEvent?: typeof appendEvent;
  } = {},
): HerdrStatusChangedPayload | null {
  const getTileId = deps.getTileId ?? getTileIdForPane;
  const getPreviousStatus = deps.getPreviousStatus ?? ((paneId: string) => {
    if (paneStatusCache.has(paneId)) {
      return paneStatusCache.get(paneId) ?? null;
    }
    return latestStatus(paneId) as HerdrAgentStatus | null;
  });
  const onStatusChanged = deps.onStatusChanged ?? ((payload) => {
    sendToShell("herdr:status-changed", payload);
  });
  const recordTransition = deps.recordTransition ?? appendStatusTransition;
  const recordEvent = deps.recordEvent ?? appendEvent;

  const previous = getPreviousStatus(event.paneId)
    ?? (event.fromStatus !== "unknown" ? event.fromStatus : "unknown");
  if (event.toStatus === previous) return null;

  paneStatusCache.set(event.paneId, event.toStatus);
  const tileId = getTileId(event.paneId) ?? null;
  const timestamp = Date.now();

  recordTransition({
    paneId: event.paneId,
    tileId,
    fromStatus: previous,
    toStatus: event.toStatus,
  });

  recordEvent({
    kind: "herdr.agent_status",
    tileId,
    data: {
      pane_id: event.paneId,
      from_status: previous,
      to_status: event.toStatus,
      raw: event.raw,
    },
  });

  const payload: HerdrStatusChangedPayload = {
    paneId: event.paneId,
    tileId,
    status: event.toStatus,
    fromStatus: previous,
    timestamp,
  };
  onStatusChanged(payload);
  return payload;
}

export function startHerdrStatusService(): void {
  if (subscriber) return;

  subscriber = new HerdrEventSubscriber();
  subscriber.onLine((line) => {
    const normalized = normalizeHerdrEventLine(line);
    if (!normalized) return;
    handleHerdrStatusEvent(normalized);
  });
  void subscriber.start();
}

export function stopHerdrStatusService(): void {
  subscriber?.stop();
  subscriber = null;
}

export function isHerdrStatusServiceConnected(): boolean {
  return subscriber?.isConnected() ?? false;
}

export function _resetHerdrStatusServiceForTesting(): void {
  stopHerdrStatusService();
  paneStatusCache.clear();
}
