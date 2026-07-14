import { describe, expect, test } from "bun:test";
import { finalizeGridPlacement } from "./tile-interactions.js";

describe("finalizeGridPlacement", () => {
	test("snaps ordinary drag-end placement to the grid", () => {
		const tile = {
			id: "normal",
			x: 13,
			y: 27,
			width: 405,
			height: 513,
			userPlaced: true,
		};

		finalizeGridPlacement(tile);

		expect(tile).toMatchObject({
			x: 16,
			y: 24,
			width: 408,
			height: 512,
			userPlaced: false,
		});
	});

	test("leaves Shift drag-end placement free and marks it user placed", () => {
		const tile = { id: "free", x: 13, y: 27, width: 405, height: 513 };

		finalizeGridPlacement(tile, { freePlacement: true });

		expect(tile).toMatchObject({
			x: 13,
			y: 27,
			width: 405,
			height: 513,
			userPlaced: true,
		});
	});
});
