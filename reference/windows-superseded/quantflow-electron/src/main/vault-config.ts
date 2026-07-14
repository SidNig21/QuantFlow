import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";
import {
  DEFAULT_VAULT_PATH,
  isStaleVaultPath,
  resolveVaultPath,
} from "./vault-paths";

const CONFIG_PATH = join(QUANTFLOW_DIR, "vault-config.json");

export interface VaultConfig {
  vaultPath?: string;
}

export async function readVaultConfig(): Promise<VaultConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const cfg = JSON.parse(raw) as VaultConfig;
    if (isStaleVaultPath(cfg.vaultPath)) {
      cfg.vaultPath = DEFAULT_VAULT_PATH;
      await writeFile(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`);
    }
    return cfg;
  } catch {
    return {};
  }
}

/** Effective vault root: configured path or canonical default. */
export async function getVaultPath(): Promise<string> {
  const cfg = await readVaultConfig();
  return resolveVaultPath(cfg.vaultPath);
}
