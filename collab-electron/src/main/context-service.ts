import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { QUANTFLOW_DIR } from "./paths";

const MAX_DECISIONS = 50;
const DEFAULT_CONTEXT_MAX_CHARS = 20_000;
const DEFAULT_EXCERPT_CHARS = 1_500;

export type ContextIncludeMode = "full" | "summary-header" | "excerpt";

export interface ContextPinnedFile {
  path: string;
  mode: ContextIncludeMode;
  excerpt?: string;
}

let ctxDir: string | null = null;

function getCtxPath(): string {
  if (!ctxDir) {
    ctxDir = QUANTFLOW_DIR;
  }
  return join(ctxDir, "context.json");
}

export function _setCtxDir(dir: string): void {
  ctxDir = dir;
}

export interface ContextDecision {
  text: string;
  ts: number;
  timestamp: number;
  author: string;
  source?: string;
  linkedFile?: string;
  cableId?: string;
}

export interface SharedContext {
  pinnedFiles: ContextPinnedFile[];
  decisions: ContextDecision[];
}

export interface ContextPreviewFile {
  path: string;
  ok: boolean;
  charCount: number;
  includedCharCount: number;
  omitted: boolean;
  truncated: boolean;
  mode: ContextIncludeMode;
  error?: string;
}

export interface ContextPreview {
  maxChars: number;
  sourceChars: number;
  injectedChars: number;
  files: ContextPreviewFile[];
  decisionsCount: number;
  omittedDecisionCount: number;
  truncated: boolean;
  text: string;
}

function normalizeHostPath(pathValue: string): string {
  if (process.platform !== "win32") return pathValue;
  const match = pathValue.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) return pathValue;
  return `${match[1]!.toUpperCase()}:\\${match[2]!.replace(/\//g, "\\")}`;
}

export function toVaultRelativePath(filePath: string, vaultPath: string): string {
  const vaultAbs = resolve(normalizeHostPath(vaultPath));
  const fileAbs = resolve(normalizeHostPath(filePath));
  const rel = normalize(relative(vaultAbs, fileAbs));
  if (!rel || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
    throw new Error("Path is outside vault directory");
  }
  return rel;
}

export function resolveVaultPinnedPath(pinnedPath: string, vaultPath: string): string {
  const normalizedPinnedPath = normalizeHostPath(pinnedPath);
  const normalizedVaultPath = normalizeHostPath(vaultPath);
  const absolute = isAbsolute(normalizedPinnedPath)
    ? resolve(normalizedPinnedPath)
    : resolve(normalizedVaultPath, normalizedPinnedPath);
  const rel = toVaultRelativePath(absolute, vaultPath);
  return resolve(normalizedVaultPath, rel);
}

async function load(): Promise<SharedContext> {
  try {
    const raw = await readFile(getCtxPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SharedContext>;
    return {
      pinnedFiles: Array.isArray(parsed.pinnedFiles)
        ? parsed.pinnedFiles.map(normalizePinnedFile).filter((pin): pin is ContextPinnedFile => pin !== null)
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.map(normalizeDecision)
        : [],
    };
  } catch {
    return { pinnedFiles: [], decisions: [] };
  }
}

function normalizeIncludeMode(mode: unknown): ContextIncludeMode {
  return mode === "summary-header" || mode === "excerpt" ? mode : "full";
}

function normalizePinnedFile(value: unknown): ContextPinnedFile | null {
  if (typeof value === "string") {
    const path = value.trim();
    return path ? { path, mode: "full" } : null;
  }
  if (!value || typeof value !== "object") return null;
  const input = value as { path?: unknown; mode?: unknown; includeMode?: unknown; excerpt?: unknown };
  const path = String(input.path ?? "").trim();
  if (!path) return null;
  const excerpt = typeof input.excerpt === "string" ? input.excerpt : undefined;
  return {
    path,
    mode: normalizeIncludeMode(input.mode ?? input.includeMode),
    ...(excerpt ? { excerpt } : {}),
  };
}

function normalizeDecision(value: unknown): ContextDecision {
  const input = value && typeof value === "object"
    ? value as Partial<ContextDecision>
    : { text: String(value ?? "") };
  const timestamp = Number.isFinite(input.timestamp)
    ? Number(input.timestamp)
    : Number.isFinite(input.ts) ? Number(input.ts) : Date.now();
  const author = String(input.author || input.source || "user").trim() || "user";
  return {
    text: String(input.text ?? ""),
    ts: timestamp,
    timestamp,
    author,
    ...(input.source ? { source: String(input.source) } : {}),
    ...(input.linkedFile ? { linkedFile: String(input.linkedFile) } : {}),
    ...(input.cableId ? { cableId: String(input.cableId) } : {}),
  };
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
  if (!ctx.pinnedFiles.some((pin) => pin.path === filePath)) {
    ctx.pinnedFiles.push({ path: filePath, mode: "full" });
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
  ctx.pinnedFiles = ctx.pinnedFiles.filter((pin) => pin.path !== filePath);
  await save(ctx);
  return ctx;
}

export async function setPinnedFileMode(
  filePath: string,
  mode: ContextIncludeMode,
  excerpt?: string,
): Promise<SharedContext> {
  const ctx = await load();
  const pin = ctx.pinnedFiles.find((item) => item.path === filePath);
  if (!pin) {
    ctx.pinnedFiles.push({
      path: filePath,
      mode: normalizeIncludeMode(mode),
      ...(excerpt ? { excerpt } : {}),
    });
  } else {
    pin.mode = normalizeIncludeMode(mode);
    if (excerpt) {
      pin.excerpt = excerpt;
    } else {
      delete pin.excerpt;
    }
  }
  await save(ctx);
  return ctx;
}

export async function addDecision(
  text: string,
  metadata: Partial<Omit<ContextDecision, "text" | "ts" | "timestamp">> = {},
): Promise<SharedContext> {
  const ctx = await load();
  const timestamp = Date.now();
  ctx.decisions.push({
    text,
    ts: timestamp,
    timestamp,
    author: String(metadata.author || metadata.source || "user"),
    ...(metadata.source ? { source: String(metadata.source) } : {}),
    ...(metadata.linkedFile ? { linkedFile: String(metadata.linkedFile) } : {}),
    ...(metadata.cableId ? { cableId: String(metadata.cableId) } : {}),
  });
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
  let truncated = false;

  function append(part: string): boolean {
    const joinerLength = parts.length > 0 ? 1 : 0;
    if (part.length + joinerLength > remaining) return false;
    parts.push(part);
    remaining -= part.length + joinerLength;
    return true;
  }

  function appendBounded(part: string, indicator: string): { included: number; truncated: boolean } {
    const joinerLength = parts.length > 0 ? 1 : 0;
    if (part.length + joinerLength <= remaining) {
      parts.push(part);
      remaining -= part.length + joinerLength;
      return { included: part.length, truncated: false };
    }
    const available = remaining - joinerLength;
    if (available <= 0) {
      truncated = true;
      return { included: 0, truncated: true };
    }
    const visibleIndicator = indicator.length < available
      ? indicator
      : indicator.slice(0, available);
    const sliceLength = Math.max(0, available - visibleIndicator.length);
    parts.push(part.slice(0, sliceLength) + visibleIndicator);
    const included = sliceLength;
    remaining = 0;
    truncated = true;
    return { included, truncated: true };
  }

  function formatDecision(d: ContextDecision): string {
    const source = d.source ? ` source=${d.source}` : "";
    const linked = d.linkedFile ? ` file=${d.linkedFile}` : "";
    const cable = d.cableId ? ` cable=${d.cableId}` : "";
    return `\n- [${new Date(d.timestamp).toISOString()} ${d.author}${source}${linked}${cable}] ${d.text}`;
  }

  if (ctx.pinnedFiles.length > 0) {
    append("## Pinned Files");
    for (const pin of ctx.pinnedFiles) {
      const entry: ContextPreviewFile = {
        path: pin.path,
        ok: true,
        charCount: 0,
        includedCharCount: 0,
        omitted: false,
        truncated: false,
        mode: pin.mode,
      };
      files.push(entry);

      let content = "";
      if (vaultReadFile) {
        try {
          content = await vaultReadFile(pin.path);
          entry.charCount = content.length;
          sourceChars += content.length;
        } catch (err) {
          entry.ok = false;
          entry.error = err instanceof Error && err.message
            ? err.message
            : "could not read file";
        }
      }

      const header = `\n### ${pin.path}\n`;
      if (!entry.ok) {
        appendBounded(`${header}(warning: ${entry.error})`, "\n[truncated warning]");
        continue;
      }
      if (!vaultReadFile) {
        append(header.trimEnd());
        continue;
      }
      if (pin.mode === "summary-header") {
        appendBounded(
          `${header}(summary-header-only: ${content.length} chars available)`,
          "\n[truncated summary]",
        );
        entry.omitted = true;
        continue;
      }
      const body = pin.mode === "excerpt"
        ? (pin.excerpt || content.slice(0, DEFAULT_EXCERPT_CHARS))
        : content;
      const { included, truncated: fileTruncated } = appendBounded(
        header + body,
        `\n[truncated: ${Math.max(0, body.length)} chars available, ${Math.max(0, body.length - Math.max(0, remaining))} chars omitted]`,
      );
      entry.includedCharCount = Math.max(0, included - header.length);
      if (pin.mode === "excerpt") {
        entry.omitted = body.length < content.length;
      }
      if (fileTruncated) {
        entry.truncated = true;
        entry.omitted = true;
      }
      if (remaining <= 0) {
        continue;
      }
    }
  }

  if (ctx.decisions.length > 0) {
    append("\n## Decisions");
    for (const d of ctx.decisions) {
      const line = formatDecision(d);
      sourceChars += d.text.length;
      const result = appendBounded(line, "\n[truncated decisions]");
      if (result.truncated || !result.included) {
        omittedDecisionCount++;
        break;
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
    truncated,
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
