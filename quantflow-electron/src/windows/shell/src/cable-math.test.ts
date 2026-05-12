import { describe, expect, it } from "bun:test";
import { bezierPath, portPosition } from "./cable-math.js";

const TILE = { x: 100, y: 200, width: 400, height: 300 };

describe("portPosition", () => {
	it("places N port at top center with upward normal", () => {
		expect(portPosition(TILE, "N")).toEqual({
			x: 300, y: 200, dx: 0, dy: -1,
		});
	});

	it("places S port at bottom center with downward normal", () => {
		expect(portPosition(TILE, "S")).toEqual({
			x: 300, y: 500, dx: 0, dy: 1,
		});
	});

	it("places E port at right middle with outward normal", () => {
		expect(portPosition(TILE, "E")).toEqual({
			x: 500, y: 350, dx: 1, dy: 0,
		});
	});

	it("places W port at left middle with outward normal", () => {
		expect(portPosition(TILE, "W")).toEqual({
			x: 100, y: 350, dx: -1, dy: 0,
		});
	});

	it("throws on unknown side", () => {
		// @ts-expect-error invalid side
		expect(() => portPosition(TILE, "X")).toThrow();
	});
});

describe("bezierPath", () => {
	it("produces an SVG path string starting at point a and ending at point b", () => {
		const a = portPosition(TILE, "E");
		const b = portPosition({ x: 800, y: 200, width: 400, height: 300 }, "W");
		const d = bezierPath(a, b);
		expect(d).toMatch(/^M 500 350 C/);
		expect(d).toMatch(/, 800 350$/);
	});

	it("clamps short-distance curvature to a minimum of 40", () => {
		const a = { x: 0, y: 0, dx: 1, dy: 0 };
		const b = { x: 10, y: 0, dx: -1, dy: 0 };
		const d = bezierPath(a, b);
		expect(d).toBe("M 0 0 C 40 0, -30 0, 10 0");
	});

	it("clamps long-distance curvature to a maximum of 180", () => {
		const a = { x: 0, y: 0, dx: 1, dy: 0 };
		const b = { x: 10000, y: 0, dx: -1, dy: 0 };
		const d = bezierPath(a, b);
		expect(d).toBe("M 0 0 C 180 0, 9820 0, 10000 0");
	});
});
