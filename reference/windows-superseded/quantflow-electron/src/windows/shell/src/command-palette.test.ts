import { describe, expect, test } from "bun:test";
import {
	filterCommandItems,
	formatConnectionCommandTitle,
	formatContextInjectionSubtitle,
	formatContextInjectionTitle,
	formatRelayLogDetail,
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

describe("formatConnectionCommandTitle", () => {
	test("uses cable labels and endpoint names", () => {
		expect(formatConnectionCommandTitle(
			{ id: "conn-1", label: "review", tileAId: "tile-a", tileBId: "tile-b" },
			"Worker",
			"Reviewer",
		)).toBe("Cable review: Worker -> Reviewer");
	});

	test("falls back to endpoint ids", () => {
		expect(formatConnectionCommandTitle(
			{ id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
		)).toBe("Cable: tile-a -> tile-b");
	});
});

describe("formatRelayLogDetail", () => {
	test("formats recent relay events with route and message", () => {
		const detail = formatRelayLogDetail([
			{
				ts: Date.UTC(2026, 0, 2, 3, 4, 5),
				ok: true,
				routeMethod: "agent",
				fromLabel: "Worker",
				targetLabel: "@Reviewer",
				text: "Please review this patch.",
			},
		]);

		expect(detail).toContain("[2026-01-02T03:04:05.000Z] sent");
		expect(detail).toContain("agent / Worker -> @Reviewer");
		expect(detail).toContain("Please review this patch.");
	});

	test("surfaces failures and empty logs", () => {
		expect(formatRelayLogDetail([]))
			.toBe("No relay events recorded for this cable.");

		expect(formatRelayLogDetail([
			{
				ok: false,
				message: "Target PTY missing",
				fromTileId: "tile-a",
				targetTileId: "tile-b",
				text: "hello",
			},
		])).toContain("failed (Target PTY missing)");
	});
});

describe("context injection command labels", () => {
	test("formats terminal context injection commands", () => {
		expect(formatContextInjectionTitle("Codex Worker"))
			.toBe("Inject Context into Codex Worker");
		expect(formatContextInjectionSubtitle({
			type: "term",
			ptySessionId: "session-1",
		})).toBe("Shared context -> running terminal");
	});

	test("explains disabled context injection commands", () => {
		expect(formatContextInjectionSubtitle({ type: "term" }))
			.toBe("Terminal has no PTY session");
		expect(formatContextInjectionSubtitle({ type: "note" }))
			.toBe("Only terminal tiles can receive context");
	});
});
