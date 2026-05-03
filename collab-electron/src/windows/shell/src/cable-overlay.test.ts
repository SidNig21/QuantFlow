import { describe, expect, test } from "bun:test";
import { clampFloatingPosition } from "./cable-overlay.js";

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
