import { describe, expect, test } from "bun:test";
import {
	isCableDrawBlockedTarget,
	shouldCancelCableDrawMode,
	shouldEnterCableDrawMode,
	shouldExitCableDrawModeOnKeyup,
	shouldForwardCableDrawMouseDown,
	shouldStartCableDraw,
} from "./cable-draw-mode.js";

function mockTarget({
	closestSelector = null,
	matchesSelector = null,
}: {
	closestSelector?: string | null;
	matchesSelector?: string | null;
} = {}) {
	return {
		closest: (selector: string) =>
			selector === closestSelector ? { selector } : null,
		matches: (selector: string) => selector === matchesSelector,
	};
}

describe("isCableDrawBlockedTarget", () => {
	test("blocks cable mode inside webviews and editable inputs", () => {
		expect(isCableDrawBlockedTarget(
			mockTarget({ closestSelector: "webview" }),
		)).toBe(true);
		expect(isCableDrawBlockedTarget(
			mockTarget({ matchesSelector: "input, textarea" }),
		)).toBe(true);
	});

	test("allows ordinary canvas targets", () => {
		expect(isCableDrawBlockedTarget(mockTarget())).toBe(false);
		expect(isCableDrawBlockedTarget(null)).toBe(false);
	});
});

describe("shouldEnterCableDrawMode", () => {
	test("enters only on a fresh C key press outside blocked targets", () => {
		expect(shouldEnterCableDrawMode({
			code: "KeyC",
			repeat: false,
			target: mockTarget(),
		})).toBe(true);
		expect(shouldEnterCableDrawMode({
			code: "KeyC",
			repeat: true,
			target: mockTarget(),
		})).toBe(false);
		expect(shouldEnterCableDrawMode({
			code: "KeyC",
			repeat: false,
			target: mockTarget({ closestSelector: "webview" }),
		})).toBe(false);
		expect(shouldEnterCableDrawMode({
			code: "KeyK",
			repeat: false,
			target: mockTarget(),
		})).toBe(false);
	});
});

describe("shouldCancelCableDrawMode", () => {
	test("cancels only held cable mode with Escape", () => {
		expect(shouldCancelCableDrawMode({ key: "Escape" }, true)).toBe(true);
		expect(shouldCancelCableDrawMode({ key: "Escape" }, false)).toBe(false);
		expect(shouldCancelCableDrawMode({ key: "C" }, true)).toBe(false);
	});
});

describe("shouldExitCableDrawModeOnKeyup", () => {
	test("exits when C is released", () => {
		expect(shouldExitCableDrawModeOnKeyup({ code: "KeyC" })).toBe(true);
		expect(shouldExitCableDrawModeOnKeyup({ code: "KeyV" })).toBe(false);
	});
});

describe("shouldStartCableDraw", () => {
	test("starts from held-C mode or a forced cable port drag", () => {
		expect(shouldStartCableDraw({ cableHeld: true })).toBe(true);
		expect(shouldStartCableDraw({ force: true })).toBe(true);
		expect(shouldStartCableDraw({ cableHeld: false, force: false })).toBe(false);
		expect(shouldStartCableDraw()).toBe(false);
	});
});

describe("shouldForwardCableDrawMouseDown", () => {
	test("forwards only left-button tile mousedowns", () => {
		expect(shouldForwardCableDrawMouseDown({ button: 0 })).toBe(true);
		expect(shouldForwardCableDrawMouseDown({ button: 1 })).toBe(false);
		expect(shouldForwardCableDrawMouseDown({ button: 2 })).toBe(false);
		expect(shouldForwardCableDrawMouseDown(null)).toBe(false);
	});
});
