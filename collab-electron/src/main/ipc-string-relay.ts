import { ipcMain } from "electron";
import {
  relayStringMessage,
  getStringLog,
  registerTileSession,
  unregisterTileSession,
  type RelayRequest,
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
    (_event, tileId: string, sessionId: string, label: string) => {
      registerTileSession(tileId, sessionId, label);
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
}
