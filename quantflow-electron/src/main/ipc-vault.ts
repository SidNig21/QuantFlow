import { ipcMain, dialog, type BrowserWindow } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { QUANTFLOW_DIR } from "./paths";
import { readVaultConfig, type VaultConfig } from "./vault-config";
import { getKernelDb } from "../../../src/kernel/database";
import { exportWorkflowToVault } from "../../../src/vault/index";

const CONFIG_PATH = join(QUANTFLOW_DIR, "vault-config.json");

async function writeConfig(cfg: VaultConfig): Promise<void> {
  await mkdir(QUANTFLOW_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

export function registerVaultHandlers(
  mainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("vault:get-path", async () => {
    const cfg = await readVaultConfig();
    return cfg.vaultPath ?? null;
  });

  ipcMain.handle("vault:set-path", async (_event, path: string) => {
    await writeConfig({ ...(await readVaultConfig()), vaultPath: path });
    return { ok: true };
  });

  ipcMain.handle("vault:pick-file", async () => {
    const win = mainWindow();
    if (!win) return null;
    const cfg = await readVaultConfig();
    const result = await dialog.showOpenDialog(win, {
      title: "Select vault file",
      defaultPath: cfg.vaultPath,
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "txt"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle("vault:read-file", async (_event, filePath: string) => {
    const cfg = await readVaultConfig();
    if (!cfg.vaultPath) {
      throw new Error("No vault path configured");
    }
    const safe = resolve(filePath);
    const vaultAbs = resolve(cfg.vaultPath);
    if (!safe.startsWith(normalize(vaultAbs))) {
      throw new Error("Path is outside vault directory");
    }
    return readFile(safe, "utf-8");
  });

  ipcMain.handle("vault:export-workflow", async (_event, workflowId: string) => {
    const cfg = await readVaultConfig();
    if (!cfg.vaultPath) {
      throw new Error("No vault path configured");
    }
    const written = await exportWorkflowToVault(
      getKernelDb(),
      workflowId,
      cfg.vaultPath,
      {
        mkdir: (dir) => mkdir(dir, { recursive: true }),
        writeFile: (path, content) => writeFile(path, content, "utf-8"),
      },
      join,
    );
    return { ok: written !== null, paths: written ?? [] };
  });
}
