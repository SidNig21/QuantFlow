import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readVaultConfig } from "./vault-config";

const DEFAULT_VAULT_PATH = "C:\\Users\\rybow\\Obsidian\\Cursor Collab";

export const CANVAS_SKILL_RELATIVE_PATH = join(
  "Projects",
  "QuantFlow",
  "QUANTFLOW_CANVAS_SKILL.md",
);

/** Keep one pane.send_text payload comfortably under herdr's text limit. */
export const CANVAS_SKILL_MAX_CHARS = 6000;

export interface CanvasSkill {
  path: string;
  text: string;
  truncated: boolean;
}

export function truncateCanvasSkill(
  raw: string,
  maxChars: number = CANVAS_SKILL_MAX_CHARS,
): { text: string; truncated: boolean } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  const marker = "\n[... truncated — read the full skill file in the vault ...]";
  return {
    text: text.slice(0, maxChars - marker.length) + marker,
    truncated: true,
  };
}

export async function resolveCanvasSkillPath(
  vaultPathOverride?: string,
): Promise<string> {
  const vaultPath = vaultPathOverride?.trim()
    || (await readVaultConfig()).vaultPath?.trim()
    || DEFAULT_VAULT_PATH;
  return join(vaultPath, CANVAS_SKILL_RELATIVE_PATH);
}

export async function readCanvasSkill(options: {
  vaultPath?: string;
  maxChars?: number;
} = {}): Promise<CanvasSkill> {
  const path = await resolveCanvasSkillPath(options.vaultPath);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`QUANTFLOW_CANVAS_SKILL.md is not readable at ${path}: ${reason}`);
  }
  const { text, truncated } = truncateCanvasSkill(raw, options.maxChars);
  if (!text) {
    throw new Error(`QUANTFLOW_CANVAS_SKILL.md is empty at ${path}`);
  }
  return { path, text, truncated };
}
