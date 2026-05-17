import { describe, expect, test } from "bun:test";
import {
	applyThemeMode,
	normalizeThemeMode,
	watchSystemTheme,
} from "./theme-controller.js";

function createRoot() {
	const classes = new Set<string>();
	return {
		dataset: {} as Record<string, string>,
		classList: {
			toggle(name: string, enabled?: boolean) {
				if (enabled) classes.add(name);
				else classes.delete(name);
			},
			contains(name: string) {
				return classes.has(name);
			},
		},
	};
}

function matchMedia(matches: boolean) {
	return () => ({
		matches,
		addEventListener() {},
		removeEventListener() {},
	});
}

describe("theme-controller", () => {
	test("normalizes unknown values to system", () => {
		expect(normalizeThemeMode("dark")).toBe("dark");
		expect(normalizeThemeMode("high-contrast")).toBe("high-contrast");
		expect(normalizeThemeMode("unknown")).toBe("system");
	});

	test("applies light, dark, system, and high-contrast classes", () => {
		const root = createRoot();
		applyThemeMode("light", { root, matchMedia: matchMedia(true) });
		expect(root.dataset.theme).toBe("light");
		expect(root.classList.contains("theme-light")).toBe(true);
		expect(root.classList.contains("dark")).toBe(false);

		applyThemeMode("system", { root, matchMedia: matchMedia(true) });
		expect(root.dataset.theme).toBe("system");
		expect(root.classList.contains("dark")).toBe(true);
		expect(root.classList.contains("theme-light")).toBe(false);

		applyThemeMode("high-contrast", { root, matchMedia: matchMedia(false) });
		expect(root.dataset.theme).toBe("high-contrast");
		expect(root.classList.contains("dark")).toBe(true);
		expect(root.classList.contains("theme-high-contrast")).toBe(true);
	});

	test("returns a cleanup function for system listeners", () => {
		let added = false;
		let removed = false;
		const cleanup = watchSystemTheme(() => {}, {
			matchMedia: () => ({
				matches: false,
				addEventListener() { added = true; },
				removeEventListener() { removed = true; },
			}),
		});
		cleanup();
		expect(added).toBe(true);
		expect(removed).toBe(true);
	});
});
