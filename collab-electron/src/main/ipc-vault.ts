import { ipcMain, dialog, type BrowserWindow } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { QUANTFLOW_DIR } from "./paths";

const CONFIG_PATH = join(QUANTFLOW_DIR, "vault-config.json");

interface VaultConfig {
  vaultPath?: string;
}

export async function readVaultConfig(): Promise<VaultConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as VaultConfig;
  } catch {
    return {};
  }
}

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
}
