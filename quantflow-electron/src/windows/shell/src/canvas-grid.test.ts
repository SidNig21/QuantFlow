import { describe, expect, test } from "bun:test";
import {
	buildGridOverlayGeometry,
	GRID_TOKENS,
	markUserPlaced,
	snapRectToGrid,
	snapToGrid,
	verifyCanvasAlignment,
} from "./canvas-grid.js";
import { CANVAS_GRID_TOKENS } from "@qf-renderer/canvas/grid";

describe("canvas grid tokens", () => {
	test("come from the shared renderer source of truth", () => {
		expect(GRID_TOKENS).toBe(CANVAS_GRID_TOKENS);
		expect(GRID_TOKENS.columns).toBe(12);
		expect(GRID_TOKENS.baseline).toBe(8);
		expect(GRID_TOKENS.gutter).toBeGreaterThan(0);
		expect(GRID_TOKENS.margin).toBeGreaterThan(0);
	});
});

describe("snapToGrid", () => {
	test("is deterministic and idempotent", () => {
		const first = snapRectToGrid(
			{ x: 13, y: 27 },
			{ width: 405, height: 513 },
		);
		const second = snapRectToGrid(first, first);
		expect(first).toEqual({ x: 16, y: 24, width: 408, height: 512 });
		expect(second).toEqual(first);
	});

	test("mutates the legacy tile shape for existing callers", () => {
		const tile = { id: "t1", x: 13, y: 27, width: 405, height: 513 };
		expect(snapToGrid(tile)).toBe(tile);
		expect(tile).toMatchObject({ x: 16, y: 24, width: 408, height: 512 });
	});

	test("does not snap locked or user-placed tiles", () => {
		const locked = { id: "locked", x: 13, y: 27, width: 405, height: 513, locked: true };
		const userPlaced = markUserPlaced({ id: "manual", x: 17, y: 19, width: 401, height: 503 });
		snapToGrid(locked);
		snapToGrid(userPlaced);
		expect(locked).toMatchObject({ x: 13, y: 27, width: 405, height: 513 });
		expect(userPlaced).toMatchObject({ x: 17, y: 19, width: 401, height: 503 });
	});

	test("supports explicit lock sets in the pure path", () => {
		const tile = { id: "t1", x: 13, y: 27, width: 405, height: 513 };
		snapToGrid(tile, { locks: new Set(["t1"]) });
		expect(tile).toMatchObject({ x: 13, y: 27, width: 405, height: 513 });
	});
});

describe("verifyCanvasAlignment", () => {
	test("passes clean grid-aligned layouts", () => {
		expect(verifyCanvasAlignment([
			{ id: "a", x: 0, y: 0, width: 400, height: 504 },
			{ id: "b", x: 424, y: 0, width: 400, height: 504 },
		]).ok).toBe(true);
	});

	test("flags off-grid tiles", () => {
		const result = verifyCanvasAlignment([
			{ id: "a", x: 3, y: 0, width: 400, height: 504 },
		]);
		expect(result.ok).toBe(false);
		expect(result.offGridTileIds).toEqual(["a"]);
		expect(result.errors).toContain("off-grid:a");
	});

	test("flags overlapping tile pairs", () => {
		const result = verifyCanvasAlignment([
			{ id: "a", x: 0, y: 0, width: 400, height: 504 },
			{ id: "b", x: 392, y: 0, width: 400, height: 504 },
		]);
		expect(result.ok).toBe(false);
		expect(result.overlappingPairs).toEqual([["a", "b"]]);
		expect(result.errors).toContain("overlap:a:b");
	});
});

describe("grid overlay geometry", () => {
	test("builds measurable column and baseline geometry", () => {
		const geometry = buildGridOverlayGeometry(
			{ panX: 0, panY: 0, zoom: 1 },
			{ width: 1280, height: 720 },
		);
		expect(geometry.columns.some((col) => col.index === 0)).toBe(true);
		expect(geometry.columns.length).toBeGreaterThanOrEqual(12);
		expect(geometry.baselines[1] - geometry.baselines[0]).toBe(GRID_TOKENS.baseline);
	});
});
