import { ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import {
  relayStringMessage,
  relayConnectionMessage,
  getStringLog,
  registerTileSession,
  unregisterTileSession,
  syncConnectionGraph,
  watchtowerSnapshot,
  getAllRelayLogs,
  type RelayRequest,
  type ConnectionGraphEntry,
} from "./string-relay";

function readLimitParam(req: unknown, fallback = 50): number {
  const input = req as { limit?: unknown } | null;
  const limit = Number(input?.limit ?? fallback);
  return Number.isInteger(limit) && limit > 0 ? limit : fallback;
}

export function registerStringRelayHandlers(): void {
  ipcMain.handle("string:relay", (_event, req: RelayRequest) => {
    return relayStringMessage(req);
  });

  registerMethod(
    "relay.connectionSend",
    (req) =>
      relayConnectionMessage(
        req as Parameters<typeof relayConnectionMessage>[0],
      ),
    {
      description: "Send a cable-bounded message across an existing connection",
      params: {
        connectionId: "ID of the cable/connection",
        fromTileId: "Endpoint tile ID to send from",
        text: "Plain-English message to relay",
      },
    },
  );

  registerMethod(
    "relay.log",
    (req) => getAllRelayLogs(readLimitParam(req)),
    {
      description: "List recent cable relay success and failure events",
      params: {
        limit: "(optional) Maximum number of relay events to return",
      },
    },
  );

  registerMethod(
    "relay.connectionLog",
    (req) => {
      const input = req as { connectionId?: unknown; limit?: unknown } | null;
      return getStringLog(
        String(input?.connectionId ?? ""),
        readLimitParam(req),
      );
    },
    {
      description: "List recent relay events for one cable/connection",
      params: {
        connectionId: "ID of the cable/connection",
        limit: "(optional) Maximum number of relay events to return",
      },
    },
  );

  registerMethod(
    "watchtower.snapshot",
    () => watchtowerSnapshot(),
    {
      description: "List Watchtower agent status snapshots",
      params: {},
    },
  );

  ipcMain.handle(
    "string:get-log",
    (_event, connectionId: string, limit?: number) => {
      return getStringLog(connectionId, limit);
    },
  );

  ipcMain.handle(
    "string:register-tile-session",
    (
      _event,
      tileId: string,
      sessionId: string,
      label: string,
      routeHandle?: string,
      statusParser?: { waiting?: string[]; blocked?: string[] },
    ) => {
      registerTileSession(tileId, sessionId, label, routeHandle, statusParser);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "string:unregister-tile-session",
    (_event, tileId: string) => {
      unregisterTileSession(tileId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    "string:sync-connections",
    (_event, connections: ConnectionGraphEntry[]) => {
      syncConnectionGraph(Array.isArray(connections) ? connections : []);
      return { ok: true };
    },
  );

  ipcMain.handle("watchtower:snapshot", () => {
    return watchtowerSnapshot();
  });

  ipcMain.handle("watchtower:relay-log", (_event, limit?: number) => {
    return getAllRelayLogs(limit);
  });
}
