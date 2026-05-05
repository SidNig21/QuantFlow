import { ipcMain } from "electron";
import { isAbsolute } from "node:path";
import { registerMethod } from "./json-rpc-server";
import {
  type ContextIncludeMode,
  getContext,
  injectVaultContextToTile,
  pinVaultFile,
  previewForVaultTile,
  setPinnedFileMode,
  toVaultRelativePath,
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

function requireString(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function requireIncludeMode(value: unknown): ContextIncludeMode {
  if (value === "full" || value === "summary-header" || value === "excerpt") {
    return value;
  }
  throw new Error("mode must be full, summary-header, or excerpt");
}

async function normalizeContextFileParam(filePath: unknown): Promise<string> {
  const input = requireString(filePath, "filePath");
  if (!isAbsolute(input)) return input;
  return toVaultRelativePath(input, await requireVaultPath());
}

function normalizeMaxChars(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const maxChars = Number(value);
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error("maxChars must be a positive integer");
  }
  return maxChars;
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

  registerMethod(
    "context.get",
    () => getContext(),
    {
      description: "Get shared context pins and decisions",
      params: {},
    },
  );

  registerMethod(
    "context.pinFile",
    async (params) => {
      const input = params as { filePath?: unknown } | null;
      return pinVaultFile(
        requireString(input?.filePath, "filePath"),
        await requireVaultPath(),
      );
    },
    {
      description: "Pin a vault file into shared context",
      params: { filePath: "Absolute path to a file inside the configured vault" },
    },
  );

  registerMethod(
    "context.unpinFile",
    async (params) => {
      const input = params as { filePath?: unknown } | null;
      return unpinFile(await normalizeContextFileParam(input?.filePath));
    },
    {
      description: "Remove a shared context file pin",
      params: { filePath: "Vault-relative or absolute pinned file path" },
    },
  );

  registerMethod(
    "context.setFileMode",
    async (params) => {
      const input = params as {
        filePath?: unknown;
        mode?: unknown;
        excerpt?: unknown;
      } | null;
      return setPinnedFileMode(
        await normalizeContextFileParam(input?.filePath),
        requireIncludeMode(input?.mode),
        typeof input?.excerpt === "string" ? input.excerpt : undefined,
      );
    },
    {
      description: "Set a pinned file include mode",
      params: {
        filePath: "Vault-relative or absolute pinned file path",
        mode: "full, summary-header, or excerpt",
        excerpt: "(optional) Explicit excerpt text for excerpt mode",
      },
    },
  );

  registerMethod(
    "context.addDecision",
    async (params) => {
      const input = params as {
        text?: unknown;
        author?: unknown;
        source?: unknown;
        linkedFile?: unknown;
        cableId?: unknown;
      } | null;
      return addDecision(
        requireString(input?.text, "text"),
        {
          ...(input?.author ? { author: String(input.author) } : {}),
          ...(input?.source ? { source: String(input.source) } : {}),
          ...(input?.linkedFile ? { linkedFile: String(input.linkedFile) } : {}),
          ...(input?.cableId ? { cableId: String(input.cableId) } : {}),
        },
      );
    },
    {
      description: "Append a shared context decision",
      params: {
        text: "Decision text",
        author: "(optional) Decision author",
        source: "(optional) Decision source",
        linkedFile: "(optional) Linked vault file",
        cableId: "(optional) Related cable ID",
      },
    },
  );

  registerMethod(
    "context.preview",
    async (params) => {
      const input = params as { maxChars?: unknown } | null;
      return previewForVaultTile(
        await requireVaultPath(),
        (p) => readVaultFile(p, "utf-8"),
        normalizeMaxChars(input?.maxChars),
      );
    },
    {
      description: "Preview composed shared context with warnings and truncation metadata",
      params: { maxChars: "(optional) Positive character limit" },
    },
  );

  registerMethod(
    "context.inject",
    async (params) => {
      const input = params as { sessionId?: unknown } | null;
      await injectVaultContextToTile(
        requireString(input?.sessionId, "sessionId"),
        await requireVaultPath(),
        (p) => readVaultFile(p, "utf-8"),
      );
      return { ok: true };
    },
    {
      description: "Inject composed shared context into a terminal PTY session",
      params: { sessionId: "PTY session ID for the target terminal tile" },
    },
  );
}
