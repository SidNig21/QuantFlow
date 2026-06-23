import { describe, expect, test } from "bun:test";
import {
	alignTilesToGrid,
	buildGridOverlayGeometry,
	formatRepackTilesToast,
	GRID_TOKENS,
	markUserPlaced,
	repackTilesToGrid,
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

	test("aligns all tiles after clearing pins but leaves hard locks untouched", () => {
		const free = markUserPlaced({ id: "free", x: 13, y: 27, width: 405, height: 513 });
		const locked = { id: "locked", x: 21, y: 31, width: 403, height: 511, locked: true };
		const normal = { id: "normal", x: 17, y: 19, width: 401, height: 503 };
		const result = alignTilesToGrid([free, locked, normal]);

		expect(result).toEqual({ aligned: 2, skipped: 1 });
		expect(free).toMatchObject({
			x: 16,
			y: 24,
			width: 408,
			height: 512,
			userPlaced: false,
		});
		expect(locked).toMatchObject({ x: 21, y: 31, width: 403, height: 511 });
		expect(normal).toMatchObject({ x: 16, y: 16, width: 400, height: 504 });
	});
});

function testOverlap(a, b) {
	return a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y;
}

describe("repackTilesToGrid", () => {
	test("packs deterministically at column pitch with no overlaps", () => {
		const first = [
			{ id: "b", x: 280, y: 200, width: 400, height: 500, zIndex: 2 },
			{ id: "a", x: 30, y: 10, width: 400, height: 500, zIndex: 1, userPlaced: true },
			{ id: "c", x: 620, y: 220, width: 280, height: 280, zIndex: 3 },
		];
		const second = first.map((tile) => ({ ...tile }));
		const result = repackTilesToGrid(first, { viewport: { width: 1280 } });
		const secondResult = repackTilesToGrid(second, { viewport: { width: 1280 } });

		expect(result).toEqual({ tidied: 3, skipped: 0 });
		expect(secondResult).toEqual(result);
		expect(first.map(({ x, y, width, height }) => ({ x, y, width, height })))
			.toEqual(second.map(({ x, y, width, height }) => ({ x, y, width, height })));
		expect(first[1]).toMatchObject({ x: 32, y: 32, width: 400, height: 504, userPlaced: false });
		expect(first[0]).toMatchObject({ x: 552, y: 32, width: 400, height: 504 });
		expect(first[0].x - first[1].x).toBe((GRID_TOKENS.columnWidth + GRID_TOKENS.gutter) * 5);
		expect(first[2].y).toBeGreaterThan(first[1].y);
		for (const tile of first) {
			expect(tile.x % GRID_TOKENS.baseline).toBe(0);
			expect(tile.y % GRID_TOKENS.baseline).toBe(0);
			expect(tile.width % GRID_TOKENS.baseline).toBe(0);
			expect(tile.height % GRID_TOKENS.baseline).toBe(0);
		}
		for (let i = 0; i < first.length; i++) {
			for (let j = i + 1; j < first.length; j++) {
				expect(testOverlap(first[i], first[j])).toBe(false);
			}
		}
	});

	test("skips hard locks and packs other tiles around them", () => {
		const locked = { id: "locked", x: 32, y: 32, width: 400, height: 504, locked: true };
		const softPinned = { id: "soft", x: 35, y: 35, width: 400, height: 500, userPlaced: true };
		const normal = { id: "normal", x: 70, y: 60, width: 280, height: 280 };
		const result = repackTilesToGrid([locked, softPinned, normal], {
			viewport: { width: 980 },
		});

		expect(result).toEqual({ tidied: 2, skipped: 1 });
		expect(locked).toMatchObject({ x: 32, y: 32, width: 400, height: 504, locked: true });
		expect(softPinned.userPlaced).toBe(false);
		expect(testOverlap(locked, softPinned)).toBe(false);
		expect(testOverlap(locked, normal)).toBe(false);
		expect(testOverlap(softPinned, normal)).toBe(false);
	});

	test("formats informative tidy toast text", () => {
		expect(formatRepackTilesToast({ tidied: 2, skipped: 0 })).toBe("Tidied 2 tiles");
		expect(formatRepackTilesToast({ tidied: 1, skipped: 1 })).toBe("Tidied 1 tile; 1 locked skipped");
		expect(formatRepackTilesToast({ tidied: 0, skipped: 0 })).toBe("No tiles to tidy");
		expect(formatRepackTilesToast({ tidied: 0, skipped: 2 })).toBe("No tiles to tidy; 2 locked skipped");
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
