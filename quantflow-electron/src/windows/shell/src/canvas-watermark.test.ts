import { describe, expect, test } from "bun:test";
import {
	getWatermarkOpacity,
	updateCanvasWatermark,
} from "./canvas-watermark.js";

function mockWatermark() {
	const attrs = new Map<string, string>();
	return {
		style: {} as Record<string, string>,
		dataset: {} as Record<string, string>,
		setAttribute(name: string, value: string) {
			attrs.set(name, value);
		},
		getAttribute(name: string) {
			return attrs.get(name) ?? null;
		},
	};
}

describe("getWatermarkOpacity", () => {
	test("keeps the mark strongest for empty canvases", () => {
		expect(getWatermarkOpacity(0)).toBe(0.22);
	});

	test("softens the mark for sparse and populated canvases", () => {
		expect(getWatermarkOpacity(1)).toBe(0.12);
		expect(getWatermarkOpacity(2)).toBe(0.12);
		expect(getWatermarkOpacity(3)).toBe(0.04);
		expect(getWatermarkOpacity(12)).toBe(0.04);
	});
});

describe("updateCanvasWatermark", () => {
	test("shows empty-state hints when no tiles exist", () => {
		const watermark = mockWatermark();

		updateCanvasWatermark(watermark, 0);

		expect(watermark.style.opacity).toBe("0.22");
		expect(watermark.dataset.empty).toBe("true");
		expect(watermark.getAttribute("aria-hidden")).toBe("false");
	});

	test("keeps the brand mark faint when tiles exist", () => {
		const watermark = mockWatermark();

		updateCanvasWatermark(watermark, 4);

		expect(watermark.style.opacity).toBe("0.04");
		expect(watermark.dataset.empty).toBe("false");
		expect(watermark.getAttribute("aria-hidden")).toBe("true");
	});

	test("ignores missing DOM nodes", () => {
		expect(() => updateCanvasWatermark(null, 0)).not.toThrow();
	});
});
