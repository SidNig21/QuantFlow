import { describe, expect, test } from "bun:test";
import {
	LEGEND_RECIPES,
	createLegendState,
	getCommenceCopy,
	getDisabledRecipeIds,
	getLegendRootAttributes,
	getSpawnModeChipText,
	getToggleContent,
	mapHealthLevelToBadge,
	normalizeLegendDensity,
	normalizeLegendSpawnMode,
	renderDockHtml,
	resolveReadinessBadge,
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

describe("Legend v2 dock recipes", () => {
	test("keeps the dock actor seed in sync with dock-actors.ts", () => {
		expect(LEGEND_RECIPES.map((recipe) => recipe.id)).toEqual([
			"pi-stick",
			"codex",
			"claude",
			"hermes",
			"eve",
			"bovada-odds",
			"canvas-scout",
		]);
		expect(LEGEND_RECIPES.map((recipe) => recipe.name)).toEqual([
			"Pi Stick",
			"Codex",
			"Claude Code",
			"Hermes",
			"Eve",
			"Bovada Odds",
			"Canvas Scout",
		]);
		expect(LEGEND_RECIPES.map((recipe) => recipe.roleId)).toEqual([
			"pi-stick",
			"codex",
			"claude",
			"hermes",
			"eve",
			"bovada-odds",
			"canvas-scout",
		]);
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

	test("play button is Run Workflow when no template is armed", () => {
		const state = createLegendState({ storage: createStorage() });
		expect(getCommenceCopy(state.getSnapshot())).toMatchObject({
			state: "workflow",
			label: "Run Workflow",
			subLabel: "Describe a task for Hermes",
			compactLabel: "RUN",
			ariaDisabled: "false",
		});
		// Run Workflow does not flip the RL-template running state.
		expect(state.commence()).toBe(false);
		expect(state.getSnapshot().running).toBe(false);
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
			.toBe("spawn - viewport center");
		expect(getToggleContent(state.getSnapshot()).density.label)
			.toBe("Density - comfortable");

		state.setDensity("comfortable");
		state.setSpawnMode("click");

		expect(getSpawnModeChipText(state.getSnapshot().spawnMode))
			.toBe("spawn - click-to-place");
		expect(getToggleContent(state.getSnapshot()).density.label)
			.toBe("Density - compact");
		expect(getToggleContent(state.getSnapshot()).spawnMode.label)
			.toBe("Spawn - click-to-place");
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

	test("does not activate disabled custom recipes", () => {
		const state = createLegendState({ storage: createStorage() });
		const recipes = [
			...LEGEND_RECIPES,
			{
				id: "disabled-tool",
				roleId: "disabled-tool",
				group: "spawn",
				type: "tool",
				name: "Disabled",
				description: "off",
				runtime: "herdr-wsl",
				color: "#6366f1",
				icon: "shell",
				disabled: true,
			},
		];
		expect(state.activateRecipe("disabled-tool", recipes)).toBe(false);
		expect(state.getSnapshot().pendingRecipe).toBeNull();
	});
});

describe("Legend registry rendering", () => {
	test("renders a visible tidy-grid dock action beside add", () => {
		const html = renderDockHtml(createLegendState({ storage: createStorage() }).getSnapshot());
		expect(html).toContain('data-action="tidy-grid"');
		expect(html).toContain('class="lv1-dock__tidy"');
		expect(html.indexOf('data-action="tidy-grid"')).toBeLessThan(
			html.indexOf('data-action="add-agent"'),
		);
	});

	test("renders injected custom recipes without rebuild", () => {
		const recipes = [
			...LEGEND_RECIPES,
			{
				id: "odds-scraper",
				roleId: "odds-scraper",
				group: "spawn",
				type: "tool",
				name: "Odds Scraper",
				description: "python script",
				runtime: "herdr-wsl",
				color: "#6366f1",
				icon: "python",
				custom: true,
			},
		];
		const html = renderDockHtml(createLegendState({ storage: createStorage() }).getSnapshot(), recipes, {
			"odds-scraper": "amber",
		});
		expect(html).toContain("Odds Scraper");
		expect(html).toContain('data-readiness="amber"');
		expect(html).toContain('data-recipe="odds-scraper"');
	});

	test("maps readiness levels to badge colors deterministically", () => {
		const recipe = {
			roleId: "codex",
			runtimeTarget: "herdr-wsl",
			harnessKind: "herdr-shell",
		};
		expect(mapHealthLevelToBadge("healthy")).toBe("green");
		expect(mapHealthLevelToBadge("degraded")).toBe("amber");
		expect(mapHealthLevelToBadge("down")).toBe("red");
		expect(resolveReadinessBadge(recipe, {
			"role:codex": "healthy",
			"harness:herdr-shell": "healthy",
		})).toBe("green");
		expect(resolveReadinessBadge(recipe, {
			"role:codex": "healthy",
			"harness:herdr-shell": "down",
		})).toBe("red");
	});
});
