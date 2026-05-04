import { describe, expect, test } from "bun:test";
import {
	filterCommandItems,
	getCommandSearchText,
	normalizeCommandQuery,
	renderCommandItem,
} from "./command-palette.js";

describe("normalizeCommandQuery", () => {
	test("lowercases and removes empty query tokens", () => {
		expect(normalizeCommandQuery("  Spawn   Codex  ")).toEqual([
			"spawn",
			"codex",
		]);
	});
});

describe("getCommandSearchText", () => {
	test("uses title, subtitle, section, and keywords", () => {
		expect(getCommandSearchText({
			title: "Spawn Codex",
			subtitle: "Role tile",
			section: "Roles",
			keywords: ["agent", "terminal"],
		})).toBe("spawn codex role tile roles agent terminal");
	});
});

describe("filterCommandItems", () => {
	const items = [
		{ id: "watchtower", title: "Open Watchtower", section: "Panels" },
		{ id: "codex", title: "Spawn Codex", section: "Roles", keywords: ["agent"] },
		{ id: "focus", title: "Focus Codex Worker", section: "Tiles" },
		{ id: "context", title: "Preview Shared Context", section: "Context" },
	];

	test("returns first commands for empty queries", () => {
		expect(filterCommandItems(items, "").map((item) => item.id))
			.toEqual(["watchtower", "codex", "focus", "context"]);
	});

	test("matches all query tokens across searchable fields", () => {
		expect(filterCommandItems(items, "codex role").map((item) => item.id))
			.toEqual(["codex"]);
	});

	test("prioritizes title prefix matches", () => {
		expect(filterCommandItems(items, "focus").map((item) => item.id)[0])
			.toBe("focus");
	});
});

describe("renderCommandItem", () => {
	test("escapes command labels and marks active state", () => {
		const html = renderCommandItem({
			id: "x",
			title: "<Spawn>",
			subtitle: "A & B",
			section: "Roles",
		}, true);

		expect(html).toContain("active");
		expect(html).toContain("&lt;Spawn&gt;");
		expect(html).toContain("A &amp; B");
		expect(html).toContain("Roles");
	});
});
