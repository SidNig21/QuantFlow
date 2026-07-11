import { BrowserWindow, ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import {
  createLegendRecipe,
  listLegendRecipes,
  listLegendRecipesWithReadiness,
  removeLegendRecipe,
  updateLegendRecipe,
  type LegendRecipeCreateInput,
} from "./legend-recipes";

function parseCreateInput(raw: unknown): LegendRecipeCreateInput {
  const input = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const id = String(input.id ?? "").trim();
  const name = String(input.name ?? "").trim();
  const color = String(input.color ?? "").trim();
  const icon = String(input.icon ?? "shell").trim();
  if (!id || !name || !color) {
    throw new Error("legend.create requires id, name, and color");
  }
  return {
    id,
    name,
    roleId: typeof input.roleId === "string" ? input.roleId.trim() : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    color,
    icon,
    type: typeof input.type === "string" ? input.type as LegendRecipeCreateInput["type"] : undefined,
    commandTemplate: typeof input.commandTemplate === "string" ? input.commandTemplate : undefined,
    cwd: typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : undefined,
    runtimeTarget: input.runtimeTarget === "windows-pty" || input.runtimeTarget === "herdr-wsl"
      || input.runtimeTarget === "agentos"
      ? input.runtimeTarget
      : undefined,
    defaultShell: input.defaultShell === "powershell" || input.defaultShell === "wsl"
      || input.defaultShell === "shell" || input.defaultShell === "auto"
      ? input.defaultShell
      : undefined,
    startupPrompt: typeof input.startupPrompt === "string" ? input.startupPrompt : undefined,
    harnessKind: input.harnessKind === "eve-harness" || input.harnessKind === "agentos"
      ? input.harnessKind
      : undefined,
    agentosSoftware: input.agentosSoftware === "pi" || input.agentosSoftware === "opencode"
      || input.agentosSoftware === "claude-code" || input.agentosSoftware === "eve"
      ? input.agentosSoftware
      : undefined,
    agentosInstruction: typeof input.agentosInstruction === "string"
      ? input.agentosInstruction
      : undefined,
    endpoint: typeof input.endpoint === "string" ? input.endpoint : undefined,
    modelHint: typeof input.modelHint === "string" ? input.modelHint : undefined,
  };
}

function notifyLegendRegistryChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("legend:registry-changed");
  }
}

export function registerLegendRecipeHandlers(): void {
  ipcMain.handle("legend:list", async () =>
    listLegendRecipesWithReadiness({ runPreflight: false }));
  ipcMain.handle("legend:create", async (_event, raw: unknown) => {
    const recipe = await createLegendRecipe(parseCreateInput(raw));
    notifyLegendRegistryChanged();
    return recipe;
  });
  ipcMain.handle("legend:update", async (_event, id: string, raw: unknown) => {
    const patch = parseCreateInput({ ...(raw as Record<string, unknown>), id });
    const recipe = await updateLegendRecipe(String(id), patch);
    notifyLegendRegistryChanged();
    return recipe;
  });
  ipcMain.handle("legend:remove", async (_event, id: string) => {
    const removed = await removeLegendRecipe(String(id));
    notifyLegendRegistryChanged();
    return removed;
  });

  registerMethod(
    "legend.list",
    () => listLegendRecipesWithReadiness({ runPreflight: false }),
    {
      description: "List legend dock recipes with cached/lightweight readiness badges",
      params: {},
    },
  );

  registerMethod(
    "legend.recipes",
    () => listLegendRecipes(),
    {
      description: "List legend dock recipes without readiness probe pass",
      params: {},
    },
  );
}
