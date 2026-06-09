import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";

const CONFIG_PATH = join(QUANTFLOW_DIR, "vault-config.json");

export interface VaultConfig {
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
