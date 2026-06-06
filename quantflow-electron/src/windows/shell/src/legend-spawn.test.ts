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
} from "./legend-spawn.js";

describe("legend recipe role mapping", () => {
	test("shared role spawn waits for herdr before opening one terminal webview", () => {
		const source = readFileSync(
			path.join(import.meta.dir, "role-tile-spawn.js"),
			"utf8",
		);

		expect(source).toContain("requiresHerdrSpawn(role)");
		expect(source).toContain("await shellApi.herdrSpawnRole");
		expect(source).toContain("tile.terminalPending = true");
		expect(source).toContain("Herdr spawn API is unavailable");
		expect(source.indexOf("Herdr spawn API is unavailable"))
			.toBeLessThan(source.indexOf("tileManager.createCanvasTile"));
		expect(source.indexOf("await shellApi.herdrSpawnRole"))
			.toBeLessThan(source.lastIndexOf("spawnTerminalWebview(tile, true)"));
		expect(source).not.toContain("connectHerdrRoleTile");
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

		expect(legendSpawn).toContain("await spawnRoleTileAt");
		expect(source).toContain('from "./role-tile-spawn.js"');
	});

	test("maps all six legend recipes to role ids", () => {
		expect(LEGEND_RECIPE_ROLE_IDS).toEqual({
			hermes: "hermes",
			codex: "codex",
			claude: "claude-worker",
			puffer: "puffer",
			python: "python",
			shell: "shell",
		});
		expect(getLegendRoleId("unknown")).toBeNull();
	});

	test("resolves a recipe against a role list", () => {
		const roles = [
			{ id: "shell", name: "Shell" },
			{ id: "claude-worker", name: "Claude Worker" },
		];
		expect(resolveLegendRecipeRole("claude", roles)).toEqual({
			id: "claude-worker",
			name: "Claude Worker",
		});
		expect(resolveLegendRecipeRole("puffer", roles)).toBeNull();
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
		})).toEqual({ x: 460, y: 310 });
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
		})).toEqual({ x: 272, y: 160 });
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
