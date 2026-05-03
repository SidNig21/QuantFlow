import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { homedir } from "node:os";

const MAX_DECISIONS = 50;
const DEFAULT_CONTEXT_MAX_CHARS = 20_000;

let ctxDir: string | null = null;

function getCtxPath(): string {
  if (!ctxDir) {
    ctxDir = join(homedir(), ".collaborator");
  }
  return join(ctxDir, "context.json");
}

export function _setCtxDir(dir: string): void {
  ctxDir = dir;
}

export interface ContextDecision {
  text: string;
  ts: number;
}

export interface SharedContext {
  pinnedFiles: string[];
  decisions: ContextDecision[];
}

export interface ContextPreviewFile {
  path: string;
  ok: boolean;
  charCount: number;
  includedCharCount: number;
  omitted: boolean;
  error?: string;
}

export interface ContextPreview {
  maxChars: number;
  sourceChars: number;
  injectedChars: number;
  files: ContextPreviewFile[];
  decisionsCount: number;
  omittedDecisionCount: number;
  text: string;
}

export function toVaultRelativePath(filePath: string, vaultPath: string): string {
  const vaultAbs = resolve(vaultPath);
  const fileAbs = resolve(filePath);
  const rel = normalize(relative(vaultAbs, fileAbs));
  if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
    throw new Error("Path is outside vault directory");
  }
  return rel;
}

export function resolveVaultPinnedPath(pinnedPath: string, vaultPath: string): string {
  const absolute = isAbsolute(pinnedPath)
    ? resolve(pinnedPath)
    : resolve(vaultPath, pinnedPath);
  const rel = toVaultRelativePath(absolute, vaultPath);
  return resolve(vaultPath, rel);
}

async function load(): Promise<SharedContext> {
  try {
    const raw = await readFile(getCtxPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SharedContext>;
    return {
      pinnedFiles: Array.isArray(parsed.pinnedFiles) ? parsed.pinnedFiles : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    };
  } catch {
    return { pinnedFiles: [], decisions: [] };
  }
}

async function save(ctx: SharedContext): Promise<void> {
  const p = getCtxPath();
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, JSON.stringify(ctx, null, 2), "utf-8");
}

export async function getContext(): Promise<SharedContext> {
  return load();
}

export async function pinFile(filePath: string): Promise<SharedContext> {
  const ctx = await load();
  if (!ctx.pinnedFiles.includes(filePath)) {
    ctx.pinnedFiles.push(filePath);
    await save(ctx);
  }
  return ctx;
}

export async function pinVaultFile(
  filePath: string,
  vaultPath: string,
): Promise<SharedContext> {
  return pinFile(toVaultRelativePath(filePath, vaultPath));
}

export async function unpinFile(filePath: string): Promise<SharedContext> {
  const ctx = await load();
  ctx.pinnedFiles = ctx.pinnedFiles.filter((p) => p !== filePath);
  await save(ctx);
  return ctx;
}

export async function addDecision(text: string): Promise<SharedContext> {
  const ctx = await load();
  ctx.decisions.push({ text, ts: Date.now() });
  if (ctx.decisions.length > MAX_DECISIONS) {
    ctx.decisions = ctx.decisions.slice(-MAX_DECISIONS);
  }
  await save(ctx);
  return ctx;
}

async function buildPreview(
  vaultReadFile?: (p: string) => Promise<string>,
  maxChars = DEFAULT_CONTEXT_MAX_CHARS,
): Promise<ContextPreview> {
  const ctx = await load();
  const parts: string[] = [];
  const files: ContextPreviewFile[] = [];
  let sourceChars = 0;
  let remaining = Math.max(0, maxChars);
  let omittedDecisionCount = 0;

  function append(part: string): boolean {
    if (part.length > remaining) return false;
    parts.push(part);
    remaining -= part.length;
    return true;
  }

  if (ctx.pinnedFiles.length > 0) {
    append("## Pinned Files");
    for (const filePath of ctx.pinnedFiles) {
      const entry: ContextPreviewFile = {
        path: filePath,
        ok: true,
        charCount: 0,
        includedCharCount: 0,
        omitted: false,
      };
      files.push(entry);

      let content = "";
      if (vaultReadFile) {
        try {
          content = await vaultReadFile(filePath);
          entry.charCount = content.length;
          sourceChars += content.length;
        } catch {
          entry.ok = false;
          entry.error = "could not read file";
        }
      }

      const header = `\n### ${filePath}\n`;
      if (!entry.ok) {
        append(`${header}(could not read file)`);
        continue;
      }
      if (!vaultReadFile) {
        append(header.trimEnd());
        continue;
      }
      if (header.length + content.length <= remaining) {
        append(header + content);
        entry.includedCharCount = content.length;
        continue;
      }
      entry.omitted = true;
      append(`${header}(omitted: ${content.length} chars exceeds context limit)`);
    }
  }

  if (ctx.decisions.length > 0) {
    append("\n## Decisions");
    for (const d of ctx.decisions) {
      const line = `\n- ${d.text}`;
      sourceChars += d.text.length;
      if (!append(line)) {
        omittedDecisionCount++;
      }
    }
  }

  const text = parts.join("\n");
  return {
    maxChars,
    sourceChars,
    injectedChars: text.length,
    files,
    decisionsCount: ctx.decisions.length,
    omittedDecisionCount,
    text,
  };
}

export async function previewForTile(
  vaultReadFile?: (p: string) => Promise<string>,
  maxChars = DEFAULT_CONTEXT_MAX_CHARS,
): Promise<ContextPreview> {
  return buildPreview(vaultReadFile, maxChars);
}

export async function previewForVaultTile(
  vaultPath: string,
  vaultReadFile: (p: string) => Promise<string>,
  maxChars = DEFAULT_CONTEXT_MAX_CHARS,
): Promise<ContextPreview> {
  return buildPreview((p) =>
    vaultReadFile(resolveVaultPinnedPath(p, vaultPath)), maxChars);
}

export async function composeForTile(
  vaultReadFile?: (p: string) => Promise<string>,
  maxChars = DEFAULT_CONTEXT_MAX_CHARS,
): Promise<string> {
  const preview = await buildPreview(vaultReadFile, maxChars);
  return preview.text;
}

export async function composeForVaultTile(
  vaultPath: string,
  vaultReadFile: (p: string) => Promise<string>,
  maxChars = DEFAULT_CONTEXT_MAX_CHARS,
): Promise<string> {
  const preview = await previewForVaultTile(vaultPath, vaultReadFile, maxChars);
  return preview.text;
}

export async function injectToTile(
  sessionId: string,
  vaultReadFile?: (p: string) => Promise<string>,
): Promise<void> {
  const text = await composeForTile(vaultReadFile);
  if (!text.trim()) return;
  const { writeToSession } = await import("./pty");
  writeToSession(
    sessionId,
    `\n--- Shared Context ---\n${text}\n--- End Context ---\n`,
  );
}

export async function injectVaultContextToTile(
  sessionId: string,
  vaultPath: string,
  vaultReadFile: (p: string) => Promise<string>,
): Promise<void> {
  const text = await composeForVaultTile(vaultPath, vaultReadFile);
  if (!text.trim()) return;
  const { writeToSession } = await import("./pty");
  writeToSession(
    sessionId,
    `\n--- Shared Context ---\n${text}\n--- End Context ---\n`,
  );
}
