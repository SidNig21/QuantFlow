import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const MAX_DECISIONS = 50;

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

export async function composeForTile(
  vaultReadFile?: (p: string) => Promise<string>,
): Promise<string> {
  const ctx = await load();
  const parts: string[] = [];

  if (ctx.pinnedFiles.length > 0) {
    parts.push("## Pinned Files");
    for (const filePath of ctx.pinnedFiles) {
      parts.push(`\n### ${filePath}`);
      if (vaultReadFile) {
        try {
          const content = await vaultReadFile(filePath);
          parts.push(content);
        } catch {
          parts.push("(could not read file)");
        }
      }
    }
  }

  if (ctx.decisions.length > 0) {
    parts.push("\n## Decisions");
    for (const d of ctx.decisions) {
      parts.push(`- ${d.text}`);
    }
  }

  return parts.join("\n");
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
