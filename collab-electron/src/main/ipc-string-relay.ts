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
