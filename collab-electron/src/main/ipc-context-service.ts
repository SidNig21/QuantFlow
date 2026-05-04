import { ipcMain } from "electron";
import {
  type ContextIncludeMode,
  getContext,
  injectVaultContextToTile,
  pinVaultFile,
  previewForVaultTile,
  setPinnedFileMode,
  unpinFile,
  addDecision,
} from "./context-service";
import { readFile as readVaultFile } from "node:fs/promises";
import { readVaultConfig } from "./ipc-vault";

async function requireVaultPath(): Promise<string> {
  const cfg = await readVaultConfig();
  if (!cfg.vaultPath) {
    throw new Error("No vault path configured");
  }
  return cfg.vaultPath;
}

export function registerContextServiceHandlers(): void {
  ipcMain.handle("context:get", async () => {
    return getContext();
  });

  ipcMain.handle("context:pin-file", async (_event, filePath: string) => {
    return pinVaultFile(filePath, await requireVaultPath());
  });

  ipcMain.handle("context:unpin-file", async (_event, filePath: string) => {
    return unpinFile(filePath);
  });

  ipcMain.handle(
    "context:set-file-mode",
    async (
      _event,
      params: { filePath: string; mode: ContextIncludeMode; excerpt?: string },
    ) => {
      return setPinnedFileMode(params.filePath, params.mode, params.excerpt);
    },
  );

  ipcMain.handle("context:add-decision", async (_event, text: string, metadata?: object) => {
    return addDecision(text, metadata as Parameters<typeof addDecision>[1] ?? {});
  });

  ipcMain.handle("context:preview-for-tile", async () => {
    return previewForVaultTile(await requireVaultPath(), (p) =>
      readVaultFile(p, "utf-8")
    );
  });

  ipcMain.handle(
    "context:inject-to-tile",
    async (_event, sessionId: string) => {
      await injectVaultContextToTile(
        sessionId,
        await requireVaultPath(),
        (p) => readVaultFile(p, "utf-8"),
      );
      return { ok: true };
    },
  );
}
