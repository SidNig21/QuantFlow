import { describe, expect, test } from "bun:test";
import { buildDockLegendRecipes, DOCK_SPAWN_ACTOR_IDS } from "./dock-actors";
import { LEGEND_RECIPES } from "../windows/shell/src/legend-dock.js";

function seedFields(recipe: {
  id: string;
  roleId: string;
  name: string;
  description: string;
  runtime: string;
  runtimeTarget?: string;
  harnessKind?: string;
  agentosSoftware?: string;
}) {
  return {
    id: recipe.id,
    roleId: recipe.roleId,
    name: recipe.name,
    description: recipe.description,
    runtime: recipe.runtime,
    runtimeTarget: recipe.runtimeTarget,
    harnessKind: recipe.harnessKind,
    agentosSoftware: recipe.agentosSoftware,
  };
}

describe("dock legend seed sync", () => {
  test("legend-dock.js seed matches verified dock spawn rail", () => {
    const canonical = buildDockLegendRecipes();
    expect(LEGEND_RECIPES.map((r) => r.id)).toEqual([...DOCK_SPAWN_ACTOR_IDS]);
    expect(canonical.map((r) => r.id)).toEqual([...DOCK_SPAWN_ACTOR_IDS]);
    expect(LEGEND_RECIPES.map(seedFields)).toEqual(canonical.map(seedFields));
  });
});
