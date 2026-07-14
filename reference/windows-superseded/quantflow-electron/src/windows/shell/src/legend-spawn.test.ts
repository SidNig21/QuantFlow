import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	LEGEND_RECIPE_ROLE_IDS,
	LEGEND_TILE_SIZE,
	getLegendClickPlacement,
	getLegendRoleId,
	getLegendViewportCenterPlacement,
	resolveLegendRecipeRole,
	spawnLegendRecipeViaRolePath,
} from "./legend-spawn.js";

describe("legend recipe role mapping", () => {
	test("shared role spawn waits for herdr before opening one terminal webview", () => {
		const source = readFileSync(
			path.join(import.meta.dir, "role-tile-spawn.js"),
			"utf8",
		);

		const roleSpawnSource = source.slice(
			0,
			source.indexOf("export async function spawnAgentOsTileAt"),
		);

		expect(roleSpawnSource).toContain("requiresHerdrSpawn(role)");
		expect(roleSpawnSource).toContain("await shellApi.herdrSpawnRole");
		expect(roleSpawnSource).toContain("tile.terminalPending = true");
		expect(roleSpawnSource).toContain("Herdr spawn API is unavailable");
		expect(roleSpawnSource.indexOf("Herdr spawn API is unavailable"))
			.toBeLessThan(roleSpawnSource.indexOf("tileManager.createCanvasTile"));
		expect(roleSpawnSource.indexOf("await shellApi.herdrSpawnRole"))
			.toBeLessThan(roleSpawnSource.lastIndexOf("spawnTerminalWebview(tile, true)"));
		expect(roleSpawnSource).not.toContain("connectHerdrRoleTile");
		// Mode-1 correction: no headless eve-harness fork in the UI spawn path.
		expect(roleSpawnSource).not.toContain("isEveHarness");
		expect(roleSpawnSource).not.toContain('ptyStatus = "idle"');
	});

	test("renderer delegates role spawn to the shared module", () => {
		const source = readFileSync(
			path.join(import.meta.dir, "renderer.js"),
			"utf8",
		);
		const legendSpawn = source.slice(
			source.indexOf("async function spawnLegendRecipeAt"),
			source.indexOf("function handleLegendRecipeActivate"),
		);

		expect(legendSpawn).toMatch(/spawnAgentOsTileAt|await spawnRoleTileAt/);
		expect(source).toContain('from "./role-tile-spawn.js"');
	});

	test("maps all visible dock recipes to role ids", () => {
		expect(LEGEND_RECIPE_ROLE_IDS).toEqual({
			"pi-stick": "pi-stick",
			codex: "codex",
			claude: "claude",
			hermes: "hermes",
			eve: "eve",
			"bovada-odds": "bovada-odds",
			"canvas-scout": "canvas-scout",
		});
		expect(getLegendRoleId("unknown")).toBeNull();
	});

	test("resolves a recipe against a role list", () => {
		const roles = [
			{ id: "claude", name: "Claude Code" },
		];
		expect(resolveLegendRecipeRole("claude", roles)).toMatchObject({
			id: "claude",
			name: "Claude Code",
		});
	});

	test("built-in Eve actor threads commandTemplate/cwd/runtimeTarget for Mode-1 spawn", () => {
		const recipes = [{
			id: "eve",
			roleId: "eve",
			group: "spawn",
			type: "eve",
			name: "Eve",
			description: "eve · OpenCode Go",
			runtime: "windows-pty",
			color: "#6366f1",
			icon: "eve",
			commandTemplate: "npm run dev",
			cwd: "C:\\Users\\rybow\\quantflow-eve",
			runtimeTarget: "windows-pty",
		}];

		const fromRoleList = resolveLegendRecipeRole("eve", [{
			id: "eve",
			name: "Eve",
			commandTemplate: "npm run dev",
			cwd: "C:\\Users\\rybow\\quantflow-eve",
			runtimeTarget: "windows-pty",
		}], recipes);
		expect(fromRoleList).toMatchObject({
			commandTemplate: "npm run dev",
			cwd: "C:\\Users\\rybow\\quantflow-eve",
			runtimeTarget: "windows-pty",
		});

		const synthesized = resolveLegendRecipeRole("eve", [], recipes);
		expect(synthesized).toMatchObject({
			commandTemplate: "npm run dev",
			cwd: "C:\\Users\\rybow\\quantflow-eve",
			runtimeTarget: "windows-pty",
		});
		expect(synthesized.harnessKind).toBeUndefined();
	});

	test("custom recipe uses the shared role-spawn path via fake spawn", async () => {
		const recipes = [
			...Object.entries(LEGEND_RECIPE_ROLE_IDS).map(([id, roleId]) => ({
				id,
				roleId,
				group: "spawn",
				type: "tool",
				name: id,
				description: id,
				runtime: "herdr-wsl",
				color: "#fff",
				icon: "shell",
			})),
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
		const roles = [{ id: "odds-scraper", name: "Odds Scraper", commandTemplate: "python" }];
		const calls: Array<Record<string, unknown>> = [];
		await spawnLegendRecipeViaRolePath({
			recipeId: "odds-scraper",
			recipes,
			roles,
			spawnRole: async (role, meta) => {
				calls.push({ roleId: role.id, ...meta });
				return { ok: true };
			},
		});
		expect(calls).toEqual([{
			roleId: "odds-scraper",
			recipeId: "odds-scraper",
			harnessKind: null,
		}]);
	});
});

describe("legend placement", () => {
	test("centers a tile in the viewport", () => {
		expect(getLegendViewportCenterPlacement({
			viewportWidth: 1200,
			viewportHeight: 800,
			panX: 0,
			panY: 0,
			zoom: 1,
			dockWidth: 56,
			tileSize: LEGEND_TILE_SIZE,
		})).toEqual({ x: 400, y: 150 });
	});

	test("clamps viewport center placement so the tile clears the dock", () => {
		expect(getLegendViewportCenterPlacement({
			viewportWidth: 260,
			viewportHeight: 220,
			panX: 0,
			panY: 0,
			zoom: 1,
			dockWidth: 56,
			tileSize: LEGEND_TILE_SIZE,
		})).toEqual({ x: 88, y: 40 });
	});

	test("places click-to-place tiles centered on the click and clamps top/left", () => {
		expect(getLegendClickPlacement({
			clientX: 300,
			clientY: 260,
			rectLeft: 20,
			rectTop: 10,
			viewportWidth: 900,
			viewportHeight: 700,
			panX: 0,
			panY: 0,
			zoom: 1,
			dockWidth: 240,
			tileSize: LEGEND_TILE_SIZE,
		})).toEqual({ x: 272, y: 40 });
	});

	test("accounts for pan and zoom when clamping against dock screen space", () => {
		expect(getLegendClickPlacement({
			clientX: 220,
			clientY: 120,
			rectLeft: 0,
			rectTop: 0,
			viewportWidth: 1000,
			viewportHeight: 800,
			panX: -100,
			panY: -40,
			zoom: 2,
			dockWidth: 240,
			tileSize: LEGEND_TILE_SIZE,
		})).toEqual({ x: 186, y: 40 });
	});
});
