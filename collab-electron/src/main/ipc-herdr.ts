/**
 * ipc-herdr.ts
 *
 * Exposes herdr bridge operations to the renderer via five IPC handlers:
 *
 *   herdr:available  → boolean
 *   herdr:list       → HerdrPane[]
 *   herdr:read       → string   (visible pane text)
 *   herdr:send       → void     (two-step send-text + send-keys Enter)
 *   herdr:status     → agent_status string
 */

import { ipcMain } from "electron";
import {
  isHerdrAvailable,
  listPanes,
  readPane,
  sendToPane,
  getPaneStatus,
} from "./herdr-bridge";
import {
  registerHerdrPaneLink,
  unregisterHerdrPaneLink,
} from "./herdr-routes";

export function registerHerdrHandlers(): void {
  /** Check whether the herdr daemon is reachable */
  ipcMain.handle("herdr:available", (): Promise<boolean> => {
    return isHerdrAvailable();
  });

  /** List all panes known to herdr */
  ipcMain.handle("herdr:list", () => {
    return listPanes();
  });

  /**
   * Read visible text from a pane.
   * args[0] = paneId (string, required)
   * args[1] = lines  (number, optional, default 50)
   */
  ipcMain.handle("herdr:read", (_event, paneId: unknown, lines?: unknown) => {
    if (typeof paneId !== "string" || !paneId) {
      throw new Error("herdr:read requires a non-empty paneId string");
    }
    const lineCount =
      typeof lines === "number" && lines > 0 ? Math.floor(lines) : 50;
    return readPane(paneId, lineCount);
  });

  /**
   * Send a command to a pane.
   * args[0] = paneId (string, required)
   * args[1] = text   (string, required — do not embed \n)
   */
  ipcMain.handle("herdr:send", (_event, paneId: unknown, text: unknown) => {
    if (typeof paneId !== "string" || !paneId) {
      throw new Error("herdr:send requires a non-empty paneId string");
    }
    if (typeof text !== "string") {
      throw new Error("herdr:send requires a text string");
    }
    return sendToPane(paneId, text);
  });

  /**
   * Get agent_status for a single pane.
   * args[0] = paneId (string, required)
   */
  ipcMain.handle("herdr:status", (_event, paneId: unknown) => {
    if (typeof paneId !== "string" || !paneId) {
      throw new Error("herdr:status requires a non-empty paneId string");
    }
    return getPaneStatus(paneId);
  });

  /**
   * Link a canvas tile to a herdr pane so Phase 3C routing is active.
   * args[0] = tileId (string, required)
   * args[1] = paneId (string, required)
   */
  ipcMain.handle("herdr:link-pane", (_event, tileId: unknown, paneId: unknown) => {
    if (typeof tileId !== "string" || !tileId) {
      throw new Error("herdr:link-pane requires a non-empty tileId string");
    }
    if (typeof paneId !== "string" || !paneId) {
      throw new Error("herdr:link-pane requires a non-empty paneId string");
    }
    registerHerdrPaneLink(tileId, paneId);
  });

  /**
   * Remove the herdr pane link for a tile.
   * args[0] = tileId (string, required)
   */
  ipcMain.handle("herdr:unlink-pane", (_event, tileId: unknown) => {
    if (typeof tileId !== "string" || !tileId) {
      throw new Error("herdr:unlink-pane requires a non-empty tileId string");
    }
    unregisterHerdrPaneLink(tileId);
  });
}
