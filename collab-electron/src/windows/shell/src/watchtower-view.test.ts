import { describe, expect, test } from "bun:test";
import {
	createConnectionCounts,
	escapeHtml,
	filterWatchtowerAgents,
	filterWatchtowerMessages,
	formatRelayRoute,
	formatWatchtowerAge,
	getWatchtowerAttentionItems,
	renderWatchtowerAgents,
	renderWatchtowerAttention,
	renderWatchtowerMessages,
} from "./watchtower-view.js";

describe("escapeHtml", () => {
	test("escapes terminal and relay text before rendering", () => {
		expect(escapeHtml(`<script data-x="1">'&</script>`)).toBe(
			"&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&lt;/script&gt;",
		);
	});
});

describe("createConnectionCounts", () => {
	test("counts cable endpoints per tile", () => {
		const counts = createConnectionCounts([
			{ id: "a-b", tileAId: "tile-a", tileBId: "tile-b" },
			{ id: "a-c", tileAId: "tile-a", tileBId: "tile-c" },
		]);

		expect(counts.get("tile-a")).toBe(2);
		expect(counts.get("tile-b")).toBe(1);
		expect(counts.get("tile-c")).toBe(1);
	});
});

describe("filterWatchtowerAgents", () => {
	const agents = [
		{ tileId: "a", status: "active" },
		{ tileId: "b", status: "idle" },
		{ tileId: "c", status: "quiet" },
	];

	test("keeps all agents by default", () => {
		expect(filterWatchtowerAgents(agents)).toHaveLength(3);
	});

	test("filters by status", () => {
		expect(filterWatchtowerAgents(agents, "idle")).toEqual([
			{ tileId: "b", status: "idle" },
		]);
	});
});

describe("filterWatchtowerMessages", () => {
	const logs = [
		{ ok: true, errorCode: undefined },
		{ ok: false, errorCode: "missing_pty" },
		{ ok: false, errorCode: "no_route" },
	];

	test("filters failed relay events", () => {
		expect(filterWatchtowerMessages(logs, "failed")).toHaveLength(2);
	});

	test("filters no-route relay events", () => {
		expect(filterWatchtowerMessages(logs, "no_route")).toEqual([
			{ ok: false, errorCode: "no_route" },
		]);
	});
});

describe("formatWatchtowerAge", () => {
	test("formats recent activity", () => {
		expect(formatWatchtowerAge(1_000, 4_500)).toBe("3s ago");
		expect(formatWatchtowerAge(1_000, 121_000)).toBe("2m ago");
	});

	test("handles missing activity", () => {
		expect(formatWatchtowerAge(0, 4_500)).toBe("no activity");
	});
});

describe("getWatchtowerAttentionItems", () => {
	test("returns recent failed relay events newest first", () => {
		const logs = [
			{ ok: false, eventId: "old" },
			{ ok: true, eventId: "sent" },
			{ ok: false, eventId: "middle" },
			{ ok: false, eventId: "new" },
		];

		expect(getWatchtowerAttentionItems(logs, 2)).toEqual([
			{ ok: false, eventId: "new" },
			{ ok: false, eventId: "middle" },
		]);
	});
});

describe("formatRelayRoute", () => {
	test("describes manual relay route with tile fallback", () => {
		expect(formatRelayRoute({
			routeMethod: "manual",
			fromLabel: "Planner",
			targetTileId: "tile-reviewer",
		})).toBe("manual / Planner -> tile-reviewer");
	});

	test("describes agent relay route with requested target handle", () => {
		expect(formatRelayRoute({
			routeMethod: "agent",
			fromLabel: "Planner",
			targetLabel: "@Reviewer",
			targetTileId: "tile-reviewer",
		})).toBe("agent / Planner -> @Reviewer");
	});

	test("falls back when relay labels are blank", () => {
		expect(formatRelayRoute({
			routeMethod: "manual",
			fromLabel: " ",
			fromTileId: "tile-planner",
			targetTileId: " ",
		})).toBe("manual / tile-planner -> unresolved");
	});
});

describe("renderWatchtowerAgents", () => {
	test("escapes agent fields and includes connection count", () => {
		const html = renderWatchtowerAgents([
			{
				tileId: `tile"<a>`,
				label: "<Reviewer>",
				status: "active",
				lastLine: "<ready>",
				lastActivityTs: 1_000,
			},
		], {
			connectionCounts: new Map([[`tile"<a>`, 2]]),
			now: 4_000,
		});

		expect(html).toContain("data-tile-id=\"tile&quot;&lt;a&gt;\"");
		expect(html).toContain("&lt;Reviewer&gt;");
		expect(html).toContain("active / 2 cables / 3s ago");
		expect(html).toContain("&lt;ready&gt;");
		expect(html).not.toContain("<Reviewer>");
	});
});

describe("renderWatchtowerMessages", () => {
	test("escapes failed relay fields and keeps no-route rows filterable", () => {
		const html = renderWatchtowerMessages([
			{
				ok: false,
				errorCode: "no_route",
				connectionId: `conn"<x>`,
				fromTileId: "from",
				targetTileId: null,
				routeMethod: "agent",
				fromLabel: "<sender>",
				targetLabel: "<target>",
				message: "<missing>",
			},
		], {
			filter: "no_route",
		});

		expect(html).toContain("wt-msg-failed");
		expect(html).toContain("data-conn-id=\"conn&quot;&lt;x&gt;\"");
		expect(html).toContain("no_route");
		expect(html).toContain("&lt;missing&gt;");
		expect(html).toContain("agent / &lt;sender&gt; -&gt; @&lt;target&gt;");
		expect(html).not.toContain("<missing>");
	});
});

describe("renderWatchtowerAttention", () => {
	test("returns an empty string when no failed relay needs attention", () => {
		expect(renderWatchtowerAttention([{ ok: true }])).toBe("");
	});

	test("renders escaped clickable failed relay cards", () => {
		const html = renderWatchtowerAttention([
			{
				ok: false,
				errorCode: "missing_pty",
				connectionId: `conn"<x>`,
				fromTileId: `from"<x>`,
				targetTileId: null,
				routeMethod: "agent",
				fromLabel: "Planner",
				targetLabel: "Reviewer",
				message: "<target exited>",
			},
		]);

		expect(html).toContain("Needs attention");
		expect(html).toContain("data-watchtower-kind=\"message\"");
		expect(html).toContain("data-conn-id=\"conn&quot;&lt;x&gt;\"");
		expect(html).toContain("data-from-tile-id=\"from&quot;&lt;x&gt;\"");
		expect(html).toContain("missing_pty");
		expect(html).toContain("agent / Planner -&gt; @Reviewer");
		expect(html).toContain("&lt;target exited&gt;");
		expect(html).not.toContain("<target exited>");
	});
});
