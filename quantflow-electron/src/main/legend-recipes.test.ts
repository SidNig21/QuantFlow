import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUILT_IN_LEGEND_RECIPE_IDS,
  BUILT_IN_LEGEND_RECIPES,
  createLegendRecipe,
  listLegendRecipes,
  mapHealthLevelToBadge,
  removeLegendRecipe,
  resolveReadinessForRecipe,
  resolveRecipeCapabilityId,
  _setLegendRegistryDirs,
} from "./legend-recipes";

describe("legend-recipes registry", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qf-legend-"));
    _setLegendRegistryDirs({
      rolesDir: join(tempDir, "roles"),
      evePackagesDir: join(tempDir, "eve-packages"),
    });
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("built-in seed keeps the seven dock recipes", () => {
    expect(BUILT_IN_LEGEND_RECIPES.map((recipe) => recipe.id)).toEqual([
      ...BUILT_IN_LEGEND_RECIPE_IDS,
    ]);
  });

  test("create/remove round-trips a custom CLI recipe through roles/*.json", async () => {
    await createLegendRecipe({
      id: "odds-scraper",
      name: "Odds Scraper",
      description: "python script",
      color: "#6366f1",
      icon: "python",
      commandTemplate: "python",
      runtimeTarget: "herdr-wsl",
      type: "tool",
    });
    const listed = await listLegendRecipes();
    expect(listed.some((recipe) => recipe.id === "odds-scraper")).toBe(true);
    await removeLegendRecipe("odds-scraper");
    const afterRemove = await listLegendRecipes();
    expect(afterRemove.some((recipe) => recipe.id === "odds-scraper")).toBe(false);
  });

  test("create/remove round-trips an Eve manifest package", async () => {
    await createLegendRecipe({
      id: "qf-research-eve",
      name: "QF Research (Eve)",
      roleId: "eve-researcher",
      color: "#14d9ff",
      icon: "codex",
      harnessKind: "eve-harness",
      endpoint: "http://127.0.0.1:3000",
      modelHint: "deepseek-v4-pro",
      type: "eve",
    });
    const listed = await listLegendRecipes();
    const recipe = listed.find((entry) => entry.id === "qf-research-eve");
    expect(recipe?.harnessKind).toBe("eve-harness");
    expect(recipe?.roleId).toBe("eve-researcher");
    await removeLegendRecipe("qf-research-eve");
    expect((await listLegendRecipes()).some((entry) => entry.id === "qf-research-eve")).toBe(false);
  });

  test("maps readiness from injected capability levels", () => {
    const recipe = BUILT_IN_LEGEND_RECIPES[1];
    const levels = new Map<string, "healthy" | "degraded" | "down">([
      [resolveRecipeCapabilityId(recipe), "degraded"],
    ]);
    expect(mapHealthLevelToBadge(resolveReadinessForRecipe(recipe, levels))).toBe("amber");
    expect(mapHealthLevelToBadge("healthy")).toBe("green");
    expect(mapHealthLevelToBadge("down")).toBe("red");
  });

  test("Eve recipes use the provider capability id", () => {
    expect(resolveRecipeCapabilityId({
      roleId: "eve-researcher",
      harnessKind: "eve-harness",
    })).toBe("provider:eve-openrouter");
  });
});
