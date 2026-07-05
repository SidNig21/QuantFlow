import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    });
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("built-in seed keeps dock actors from dock-actors.ts", () => {
    expect(BUILT_IN_LEGEND_RECIPES.map((recipe) => recipe.id)).toEqual([
      ...BUILT_IN_LEGEND_RECIPE_IDS,
    ]);
    expect(BUILT_IN_LEGEND_RECIPES.map((recipe) => recipe.id)).toEqual([
      "codex", "claude", "hermes", "eve", "bovada-odds", "canvas-scout",
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

  test("an Eve persona is a plain role.json that terminal-spawns (Mode 1, no manifest)", async () => {
    // Mode-1 correction: an Eve persona is a normal role row whose commandTemplate
    // runs `npm run dev` in its package cwd — NOT an eve-harness manifest package.
    await createLegendRecipe({
      id: "quantflow-eve",
      name: "QuantFlow Eve",
      description: "Eve · OpenCode",
      color: "#6366f1",
      icon: "hermes",
      commandTemplate: "npm run dev",
      runtimeTarget: "windows-pty",
      type: "agent",
      modelHint: "deepseek-v4-pro",
    });
    const listed = await listLegendRecipes();
    const recipe = listed.find((entry) => entry.id === "quantflow-eve");
    // It is a terminal recipe: the spawn fields reach the legend, no eve-harness fork.
    expect(recipe?.commandTemplate).toBe("npm run dev");
    expect(recipe?.runtimeTarget).toBe("windows-pty");
    expect(recipe?.harnessKind).toBeUndefined();
    expect(recipe?.custom).toBe(true);
    await removeLegendRecipe("quantflow-eve");
    expect((await listLegendRecipes()).some((entry) => entry.id === "quantflow-eve")).toBe(false);
  });

  test("createLegendRecipe (Eve authoring path) persists cwd + defaultShell, no harnessKind", async () => {
    // R8.5: "Add Eve agent" writes a Mode-1 role — folder + npm run dev + windows-pty
    // + powershell — NOT a harnessKind:eve-harness row.
    const created = await createLegendRecipe({
      id: "my-eve",
      name: "My Eve",
      description: "Eve · OpenCode",
      color: "#6366f1",
      icon: "hermes",
      type: "agent",
      commandTemplate: "npm run dev",
      cwd: "C:/Users/me/my-eve",
      runtimeTarget: "windows-pty",
      defaultShell: "powershell",
      modelHint: "deepseek-v4-pro",
    });
    expect(created.cwd).toBe("C:/Users/me/my-eve");
    expect(created.runtimeTarget).toBe("windows-pty");
    expect(created.harnessKind).toBeUndefined();
    // Round-trips through disk read.
    const listed = (await listLegendRecipes()).find((r) => r.id === "my-eve");
    expect(listed?.cwd).toBe("C:/Users/me/my-eve");
    expect(listed?.commandTemplate).toBe("npm run dev");
    expect(listed?.harnessKind).toBeUndefined();
    await removeLegendRecipe("my-eve");
  });

  test("an operator-authored role.json round-trips cwd + commandTemplate to the recipe", async () => {
    // The Mode-1 path: the operator drops a roles/*.json with an absolute cwd (the
    // Eve package folder). The registry must thread cwd + commandTemplate + runtimeTarget
    // to the recipe so the dock spawn runs `npm run dev` in that folder.
    const rolesDir = join(tempDir, "roles");
    await mkdir(rolesDir, { recursive: true });
    await writeFile(
      join(rolesDir, "eve-on-disk.json"),
      JSON.stringify({
        id: "eve-on-disk",
        name: "Eve On Disk",
        description: "Eve · OpenCode",
        color: "#14d9ff",
        icon: "hermes",
        commandTemplate: "npm run dev",
        cwd: "C:\\Users\\rybow\\quantflow-eve",
        runtimeTarget: "windows-pty",
        showInLegend: true,
        legendType: "agent",
        modelHint: "deepseek-v4-pro",
      }, null, 2),
      "utf-8",
    );
    const recipe = (await listLegendRecipes()).find((entry) => entry.id === "eve-on-disk");
    expect(recipe).toBeDefined();
    expect(recipe?.commandTemplate).toBe("npm run dev");
    expect(recipe?.cwd).toBe("C:\\Users\\rybow\\quantflow-eve");
    expect(recipe?.runtimeTarget).toBe("windows-pty");
    expect(recipe?.runtime).toBe("windows-pty");
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
