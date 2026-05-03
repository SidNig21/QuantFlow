import { ipcMain } from "electron";
import {
  getContext,
  pinFile,
  unpinFile,
  addDecision,
  previewForTile,
  injectToTile,
} from "./context-service";
import { resolve } from "node:path";
import { readFile as readVaultFile } from "node:fs/promises";

export function registerContextServiceHandlers(): void {
  ipcMain.handle("context:get", async () => {
    return getContext();
  });

  ipcMain.handle("context:pin-file", async (_event, filePath: string) => {
    return pinFile(filePath);
  });

  ipcMain.handle("context:unpin-file", async (_event, filePath: string) => {
    return unpinFile(filePath);
  });

  ipcMain.handle("context:add-decision", async (_event, text: string) => {
    return addDecision(text);
  });

  ipcMain.handle("context:preview-for-tile", async () => {
    return previewForTile((p) => readVaultFile(resolve(p), "utf-8"));
  });

  ipcMain.handle(
    "context:inject-to-tile",
    async (_event, sessionId: string) => {
      await injectToTile(sessionId, (p) => readVaultFile(resolve(p), "utf-8"));
      return { ok: true };
    },
  );
}
