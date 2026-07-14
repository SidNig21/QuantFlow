import { describe, expect, test } from "bun:test";
import {
	getWatermarkOpacity,
	updateCanvasWatermark,
	WATERMARK_OPACITY,
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
	test("holds a constant opacity regardless of tile count (no fade)", () => {
		expect(getWatermarkOpacity(0)).toBe(WATERMARK_OPACITY);
		expect(getWatermarkOpacity(1)).toBe(WATERMARK_OPACITY);
		expect(getWatermarkOpacity(4)).toBe(WATERMARK_OPACITY);
		expect(getWatermarkOpacity(12)).toBe(WATERMARK_OPACITY);
	});
});

describe("updateCanvasWatermark", () => {
	test("shows empty-state hints when no tiles exist", () => {
		const watermark = mockWatermark();

		updateCanvasWatermark(watermark, 0);

		expect(watermark.style.opacity).toBe(String(WATERMARK_OPACITY));
		expect(watermark.dataset.empty).toBe("true");
		expect(watermark.getAttribute("aria-hidden")).toBe("false");
	});

	test("keeps the logo opacity steady and hides hints when tiles exist", () => {
		const watermark = mockWatermark();

		updateCanvasWatermark(watermark, 4);

		// Logo no longer fades — same opacity as the empty state.
		expect(watermark.style.opacity).toBe(String(WATERMARK_OPACITY));
		// data-empty still flips so the quick-action hints hide via CSS.
		expect(watermark.dataset.empty).toBe("false");
		expect(watermark.getAttribute("aria-hidden")).toBe("true");
	});

	test("ignores missing DOM nodes", () => {
		expect(() => updateCanvasWatermark(null, 0)).not.toThrow();
	});
});
