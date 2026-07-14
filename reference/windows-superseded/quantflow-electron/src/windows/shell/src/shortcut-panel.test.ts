import { describe, expect, test } from "bun:test";
import {
	groupShortcuts,
	renderShortcutPanel,
} from "./shortcut-panel.js";

describe("shortcut panel", () => {
	test("groups shortcuts by context", () => {
		expect(groupShortcuts([
			{ actionId: "a", keys: ["a"], when: "canvas", description: "A" },
			{ actionId: "b", keys: ["b"], when: "global", description: "B" },
			{ actionId: "c", keys: ["c"], when: "canvas", description: "C" },
		])).toEqual([
			{ when: "canvas", items: [
				{ actionId: "a", keys: ["a"], when: "canvas", description: "A" },
				{ actionId: "c", keys: ["c"], when: "canvas", description: "C" },
			] },
			{ when: "global", items: [
				{ actionId: "b", keys: ["b"], when: "global", description: "B" },
			] },
		]);
	});

	test("renders escaped shortcut rows", () => {
		const html = renderShortcutPanel([
			{ actionId: "x", keys: ["mod", "k"], when: "shell", description: "<Open>" },
		], { platform: "darwin" });

		expect(html).toContain("&lt;Open&gt;");
		expect(html).toContain("Cmd+K");
	});
});
