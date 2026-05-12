import { describe, expect, test } from "bun:test";
import { normalizeToast } from "./toast-controller.js";

describe("normalizeToast", () => {
	test("normalizes a string toast", () => {
		expect(normalizeToast(" Saved ")).toEqual({
			message: "Saved",
			tone: "info",
			timeout: 3200,
		});
	});

	test("keeps supported tones and clamps timeout", () => {
		expect(normalizeToast({
			message: "No route",
			tone: "warn",
			timeout: -10,
		})).toEqual({
			message: "No route",
			tone: "warn",
			timeout: 0,
		});
	});

	test("falls back from unsupported tones", () => {
		expect(normalizeToast({
			message: "Done",
			tone: "success",
			timeout: 100,
		})).toEqual({
			message: "Done",
			tone: "info",
			timeout: 100,
		});
	});
});
