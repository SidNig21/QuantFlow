import { ipcMain } from "electron";
import {
  getAllRelayLogs,
  getStringLog,
  registerTileSession,
  syncConnectionGraph,
  unregisterTileSession,
  watchtowerSnapshot,
  type ConnectionGraphEntry,
} from "./tile-session-registry";

export function registerTileRegistryHandlers(): void {
  ipcMain.handle(
    "string:register-tile-session",
    (
      _event,
      tileId: string,
      sessionId: string,
      label: string,
      routeHandle?: string,
      statusParser?: { waiting?: string[]; blocked?: string[] },
      relay?: {
        runtimeTarget?: string;
        herdrPaneId?: string;
        ptySessionId?: string;
      },
    ) => {
      const binding = relay?.runtimeTarget
        ? {
            runtimeTarget: relay.runtimeTarget as "herdr-wsl" | "windows-pty" | "agentos",
            herdrPaneId: relay.herdrPaneId,
            ptySessionId: relay.ptySessionId,
          }
        : undefined;
      registerTileSession(tileId, sessionId, label, routeHandle, statusParser, binding);
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

  ipcMain.handle(
    "string:get-log",
    (_event, connectionId: string, limit?: number) => {
      return getStringLog(connectionId, limit);
    },
  );

  ipcMain.handle("watchtower:snapshot", () => watchtowerSnapshot());

  ipcMain.handle("watchtower:relay-log", (_event, limit?: number) => {
    return getAllRelayLogs(limit);
  });
}
