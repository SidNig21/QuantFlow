/** Canonical Obsidian vault for QuantFlow mirrors, skills, and operator output. */
export const DEFAULT_VAULT_PATH = "C:\\Users\\rybow\\Obsidian\\QuantFlow Vault";

/** Old repo default before operator confirmed QuantFlow Vault as canonical. */
export const STALE_VAULT_PATHS = [
  "C:\\Users\\rybow\\Obsidian\\QuantFlow",
] as const;

export function isStaleVaultPath(path: string | undefined | null): boolean {
  if (!path?.trim()) return false;
  const normalized = path.trim().replace(/\//g, "\\");
  return (STALE_VAULT_PATHS as readonly string[]).includes(normalized);
}

/** Configured path when set and non-stale; otherwise DEFAULT_VAULT_PATH. */
export function resolveVaultPath(configured?: string | null): string {
  const trimmed = configured?.trim();
  if (trimmed && !isStaleVaultPath(trimmed)) return trimmed;
  return DEFAULT_VAULT_PATH;
}
