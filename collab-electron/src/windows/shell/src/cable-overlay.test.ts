import { describe, expect, test } from "bun:test";
import {
	clampFloatingPosition,
	getConnectionPresentation,
} from "./cable-overlay.js";

describe("clampFloatingPosition", () => {
	test("keeps an in-bounds position unchanged", () => {
		expect(clampFloatingPosition(100, 80, 250, 120, 800, 600)).toEqual({
			x: 100,
			y: 80,
		});
	});

	test("clamps against the right and bottom edges", () => {
		expect(clampFloatingPosition(760, 580, 250, 120, 800, 600)).toEqual({
			x: 538,
			y: 468,
		});
	});

	test("clamps against the left and top edges", () => {
		expect(clampFloatingPosition(-40, -30, 250, 120, 800, 600)).toEqual({
			x: 12,
			y: 12,
		});
	});
});

describe("getConnectionPresentation", () => {
	const viewport = { panX: 0, panY: 0, zoom: 1 };
	const tiles = [
		{ id: "tile-a", x: 0, y: 0, width: 100, height: 100 },
		{ id: "tile-b", x: 300, y: 0, width: 100, height: 100 },
	];
	const connections = [
		{ id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
	];

	test("returns endpoint tiles and cable midpoint for a connection", () => {
		const result = getConnectionPresentation(
			"conn-ab",
			connections,
			tiles,
			viewport,
		);

		expect(result?.tileA.id).toBe("tile-a");
		expect(result?.tileB.id).toBe("tile-b");
		expect(result?.mid).toEqual({ x: 200, y: 50 });
		expect(result?.d).toBe("M 100 50 C 180 50, 220 50, 300 50");
	});

	test("returns null when the connection is missing", () => {
		expect(getConnectionPresentation("missing", connections, tiles, viewport))
			.toBeNull();
	});

	test("returns null when an endpoint tile is missing", () => {
		expect(getConnectionPresentation(
			"conn-ab",
			connections,
			tiles.slice(0, 1),
			viewport,
		)).toBeNull();
	});
});
