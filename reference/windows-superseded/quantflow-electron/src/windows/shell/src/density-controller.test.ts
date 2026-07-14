import { describe, expect, test } from "bun:test";
import { applyDensity, normalizeDensity } from "./density-controller.js";

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

describe("density-controller", () => {
	test("normalizes unknown values", () => {
		expect(normalizeDensity("compact")).toBe("compact");
		expect(normalizeDensity("dense")).toBe("comfortable");
	});

	test("applies density state to the root", () => {
		const root = createRoot();
		applyDensity("compact", { root });
		expect(root.dataset.density).toBe("compact");
		expect(root.classList.contains("density-compact")).toBe(true);

		applyDensity("comfortable", { root });
		expect(root.dataset.density).toBe("comfortable");
		expect(root.classList.contains("density-compact")).toBe(false);
	});
});
