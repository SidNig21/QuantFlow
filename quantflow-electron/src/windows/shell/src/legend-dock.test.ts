import { describe, expect, test } from "bun:test";
import {
	LEGEND_RECIPES,
	createLegendState,
	getCommenceCopy,
	getDisabledRecipeIds,
	getLegendRootAttributes,
	getSpawnModeChipText,
	getToggleContent,
	normalizeLegendDensity,
	normalizeLegendSpawnMode,
} from "./legend-dock.js";

function createStorage(seed: Record<string, string> = {}) {
	const values = new Map(Object.entries(seed));
	return {
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
		values,
	};
}

describe("Legend v1 recipes", () => {
	test("keeps the Session 1A recipe order and copy", () => {
		expect(LEGEND_RECIPES.map((recipe) => recipe.id)).toEqual([
			"hermes",
			"codex",
			"claude",
			"puffer",
			"python",
			"shell",
		]);
		expect(LEGEND_RECIPES.map((recipe) => recipe.name)).toEqual([
			"Hermes",
			"Codex CLI",
			"Claude Code",
			"PufferLib worker",
			"Python script",
			"Generic CLI",
		]);
		expect(LEGEND_RECIPES.map((recipe) => recipe.roleId)).toEqual([
			"hermes",
			"codex",
			"claude-worker",
			"puffer",
			"python",
			"shell",
		]);
		expect(LEGEND_RECIPES.find((recipe) => recipe.id === "puffer")?.description)
			.toBe("RL training · dumb");
	});
});

describe("LegendState", () => {
	test("defaults to compact density and center spawn mode", () => {
		const state = createLegendState({ storage: createStorage() });
		expect(state.getSnapshot()).toMatchObject({
			density: "compact",
			spawnMode: "center",
			armedTemplate: null,
			running: false,
		});
	});

	test("normalizes invalid persisted values", () => {
		expect(normalizeLegendDensity("wide")).toBe("compact");
		expect(normalizeLegendSpawnMode("drag")).toBe("center");
	});

	test("loads and persists density and spawn mode", () => {
		const storage = createStorage({
			"legendV1.density": "comfortable",
			"legendV1.spawnMode": "click",
		});
		const state = createLegendState({ storage });
		expect(state.getSnapshot()).toMatchObject({
			density: "comfortable",
			spawnMode: "click",
		});

		state.toggleDensity();
		state.toggleSpawnMode();

		expect(storage.values.get("legendV1.density")).toBe("compact");
		expect(storage.values.get("legendV1.spawnMode")).toBe("center");
	});

	test("transitions template visual states without spawn side effects", () => {
		const state = createLegendState({ storage: createStorage() });
		state.toggleTemplate("rl-training");
		expect(getCommenceCopy(state.getSnapshot())).toMatchObject({
			state: "armed",
			label: "Commence",
			subLabel: "Start armed workers",
			compactLabel: "GO",
			ariaDisabled: "false",
		});

		expect(state.commence()).toBe(true);
		expect(getCommenceCopy(state.getSnapshot())).toMatchObject({
			state: "running",
			label: "Running",
			subLabel: "Workers live",
			compactLabel: "LIVE",
			ariaDisabled: "true",
		});

		expect([...getDisabledRecipeIds(state.getSnapshot())].sort()).toEqual([
			"hermes",
			"puffer",
		]);
	});

	test("exposes root data attributes for CSS state selectors", () => {
		const state = createLegendState({ storage: createStorage() });
		state.setDensity("comfortable");
		state.setSpawnMode("click");
		state.toggleTemplate("rl-training");
		state.commence();

		expect(getLegendRootAttributes(state.getSnapshot())).toEqual({
			"data-density": "comfortable",
			"data-armed-template": "rl-training",
			"data-running": "true",
			"data-spawn-mode": "click",
		});
	});

	test("reports toggle labels and canvas chip copy from current state", () => {
		const state = createLegendState({ storage: createStorage() });
		expect(getSpawnModeChipText(state.getSnapshot().spawnMode))
			.toBe("spawn · viewport center");
		expect(getToggleContent(state.getSnapshot()).density.label)
			.toBe("Density · comfortable");

		state.setDensity("comfortable");
		state.setSpawnMode("click");

		expect(getSpawnModeChipText(state.getSnapshot().spawnMode))
			.toBe("spawn · click-to-place");
		expect(getToggleContent(state.getSnapshot()).density.label)
			.toBe("Density · compact");
		expect(getToggleContent(state.getSnapshot()).spawnMode.label)
			.toBe("Spawn · click-to-place");
	});

	test("tracks click-to-place pending recipe without changing persisted preferences", () => {
		const storage = createStorage();
		const state = createLegendState({ storage });
		state.setSpawnMode("click");
		expect(state.activateRecipe("python")).toMatchObject({
			recipeId: "python",
			spawnMode: "click",
			pendingRecipe: "python",
		});
		expect(state.getSnapshot().pendingRecipe).toBe("python");

		state.clearPendingRecipe();

		expect(state.getSnapshot().pendingRecipe).toBeNull();
		expect(storage.values.get("legendV1.spawnMode")).toBe("click");
	});
});
