import { ipcMain } from "electron";
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
    runtimeTarget: input.runtimeTarget === "windows-pty" || input.runtimeTarget === "herdr-wsl"
      ? input.runtimeTarget
      : undefined,
    startupPrompt: typeof input.startupPrompt === "string" ? input.startupPrompt : undefined,
    harnessKind: input.harnessKind === "eve-harness" ? "eve-harness" : undefined,
    endpoint: typeof input.endpoint === "string" ? input.endpoint : undefined,
    modelHint: typeof input.modelHint === "string" ? input.modelHint : undefined,
  };
}

export function registerLegendRecipeHandlers(): void {
  ipcMain.handle("legend:list", async () => listLegendRecipesWithReadiness());
  ipcMain.handle("legend:create", async (_event, raw: unknown) => createLegendRecipe(parseCreateInput(raw)));
  ipcMain.handle("legend:update", async (_event, id: string, raw: unknown) => {
    const patch = parseCreateInput({ ...(raw as Record<string, unknown>), id });
    return updateLegendRecipe(String(id), patch);
  });
  ipcMain.handle("legend:remove", async (_event, id: string) => removeLegendRecipe(String(id)));

  registerMethod(
    "legend.list",
    () => listLegendRecipesWithReadiness(),
    {
      description: "List legend dock recipes with R0 readiness badges",
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
