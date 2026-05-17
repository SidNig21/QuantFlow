import { describe, expect, test } from "bun:test";
import {
	SHORTCUTS,
	findDuplicateShortcuts,
	formatShortcutKeys,
	shortcutToCommand,
	shouldOpenShortcutPanel,
} from "./shortcut-registry.js";

describe("shortcut registry", () => {
	test("has no duplicate key/context tuples", () => {
		expect(findDuplicateShortcuts(SHORTCUTS)).toEqual([]);
	});

	test("formats platform-specific shortcuts", () => {
		expect(formatShortcutKeys(["mod", "k"], { platform: "darwin" })).toBe("Cmd+K");
		expect(formatShortcutKeys(["mod", "k"], { platform: "win32" })).toBe("Ctrl+K");
		expect(formatShortcutKeys(["alt", "arrowleft"], { platform: "darwin" })).toBe("Opt+Left");
	});

	test("converts shortcuts into palette command metadata", () => {
		expect(shortcutToCommand(SHORTCUTS[0], { platform: "linux" })).toMatchObject({
			id: "shortcut:toggle-settings",
			section: "Shortcuts",
			subtitle: "Ctrl+,",
		});
	});

	test("opens help on question mark outside editable targets", () => {
		expect(shouldOpenShortcutPanel({ key: "?", target: { tagName: "DIV" } })).toBe(true);
		expect(shouldOpenShortcutPanel({ key: "?", target: { tagName: "INPUT" } })).toBe(false);
		expect(shouldOpenShortcutPanel({ key: "?", ctrlKey: true, target: { tagName: "DIV" } })).toBe(false);
	});
});
