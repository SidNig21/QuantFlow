import { ipcMain } from "electron";
import {
  relayStringMessage,
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
    ) => {
      registerTileSession(tileId, sessionId, label, routeHandle);
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
