import { describe, expect, test } from "bun:test";
import {
	WATCHTOWER_AGENT_FILTERS,
	WATCHTOWER_MESSAGE_FILTERS,
	createConnectionCounts,
	escapeHtml,
	filterWatchtowerAgents,
	filterWatchtowerMessages,
	formatWatchtowerFilterLabel,
	formatRelayRoute,
	formatWatchtowerAge,
	getWatchtowerRetryRequest,
	getWatchtowerAttentionItems,
	renderWatchtowerAgents,
	renderWatchtowerAttention,
	renderWatchtowerMessages,
	shouldRenderWatchtowerRetry,
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
		{ tileId: "d", status: "waiting" },
		{ tileId: "e", status: "blocked" },
		{ tileId: "f", status: "exited" },
	];

	test("keeps all agents by default", () => {
		expect(filterWatchtowerAgents(agents)).toHaveLength(6);
	});

	test("filters by status", () => {
		expect(filterWatchtowerAgents(agents, "idle")).toEqual([
			{ tileId: "b", status: "idle" },
		]);
	});

	test("includes attention statuses as first-class filters", () => {
		expect(WATCHTOWER_AGENT_FILTERS).toEqual([
			"all",
			"active",
			"idle",
			"quiet",
			"waiting",
			"blocked",
			"exited",
		]);
		expect(filterWatchtowerAgents(agents, "waiting")).toEqual([
			{ tileId: "d", status: "waiting" },
		]);
		expect(filterWatchtowerAgents(agents, "blocked")).toEqual([
			{ tileId: "e", status: "blocked" },
		]);
		expect(WATCHTOWER_AGENT_FILTERS).toContain("exited");
		expect(filterWatchtowerAgents(agents, "exited")).toEqual([
			{ tileId: "f", status: "exited" },
		]);
	});
});

describe("filterWatchtowerMessages", () => {
	const logs = [
		{ ok: true, errorCode: undefined },
		{ ok: false, errorCode: "missing_pty" },
		{ ok: false, errorCode: "no_route" },
		{ ok: false, errorCode: "ambiguous_route" },
		{ ok: false, errorCode: "unconnected_target" },
		{ ok: false, errorCode: "write_failed" },
	];

	test("filters failed relay events", () => {
		expect(filterWatchtowerMessages(logs, "failed")).toHaveLength(5);
	});

	test("includes relay failure codes as first-class filters", () => {
		expect(WATCHTOWER_MESSAGE_FILTERS).toEqual([
			"all",
			"failed",
			"no_route",
			"missing_pty",
			"ambiguous_route",
			"unconnected_target",
			"write_failed",
		]);
		for (const code of WATCHTOWER_MESSAGE_FILTERS.slice(2)) {
			expect(filterWatchtowerMessages(logs, code)).toEqual([
				{ ok: false, errorCode: code },
			]);
		}
	});
});

describe("formatWatchtowerFilterLabel", () => {
	test("formats underscore filters for readable controls", () => {
		expect(formatWatchtowerFilterLabel("no_route")).toBe("No Route");
		expect(formatWatchtowerFilterLabel("missing_pty")).toBe("Missing PTY");
		expect(formatWatchtowerFilterLabel("failed")).toBe("Failed");
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

describe("getWatchtowerRetryRequest", () => {
	const connection = { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" };
	const fromTile = { id: "tile-a", userTitle: "Planner", ptySessionId: "session-a" };
	const targetTile = { id: "tile-b", userTitle: "Reviewer", ptySessionId: "session-b" };
	const labelFor = (tile) => tile.userTitle || tile.id;

	test("builds a cable-bounded retry request from a failed relay event", () => {
		expect(getWatchtowerRetryRequest({
			ok: false,
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "retry this",
		}, connection, fromTile, targetTile, labelFor)).toEqual({
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			fromLabel: "Planner",
			targetTileId: "tile-b",
			targetSessionId: "session-b",
			text: "retry this",
		});
	});

	test("rejects sent, unresolved, and off-cable relay events", () => {
		expect(getWatchtowerRetryRequest({
			ok: true,
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "already sent",
		}, connection, fromTile, targetTile, labelFor)).toBeNull();
		expect(getWatchtowerRetryRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: null,
			text: "no target",
		}, connection, fromTile, targetTile, labelFor)).toBeNull();
		expect(getWatchtowerRetryRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: "tile-c",
			text: "off cable",
		}, connection, fromTile, targetTile, labelFor)).toBeNull();
	});
});

describe("shouldRenderWatchtowerRetry", () => {
	test("requires a failed relay event with concrete route and text", () => {
		expect(shouldRenderWatchtowerRetry({
			ok: false,
			eventId: "relay-1",
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "retry this",
		})).toBe(true);
		expect(shouldRenderWatchtowerRetry({
			ok: false,
			eventId: "relay-1",
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			targetTileId: null,
			text: "retry this",
		})).toBe(false);
		expect(shouldRenderWatchtowerRetry({
			ok: false,
			eventId: "relay-1",
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: " ",
		})).toBe(false);
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
				eventId: "relay-1",
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
		expect(html).toContain("data-event-id=\"relay-1\"");
		expect(html).toContain("data-conn-id=\"conn&quot;&lt;x&gt;\"");
		expect(html).toContain("no_route");
		expect(html).toContain("&lt;missing&gt;");
		expect(html).toContain("agent / &lt;sender&gt; -&gt; @&lt;target&gt;");
		expect(html).not.toContain("<missing>");
	});

	test("renders retry for failed relay rows with concrete route text", () => {
		const html = renderWatchtowerMessages([
			{
				ok: false,
				eventId: "relay-1",
				errorCode: "missing_pty",
				connectionId: "conn-ab",
				fromTileId: "tile-a",
				targetTileId: "tile-b",
				message: "Target PTY session is not active.",
				text: "retry this",
			},
		]);

		expect(html).toContain("wt-msg-retry");
		expect(html).toContain("data-event-id=\"relay-1\"");
	});

	test("does not render retry for failed relay rows without a concrete target", () => {
		const html = renderWatchtowerMessages([
			{
				ok: false,
				eventId: "relay-1",
				errorCode: "no_route",
				connectionId: "agent:tile-a:reviewer",
				fromTileId: "tile-a",
				targetTileId: null,
				message: "No connected relay target matches reviewer.",
				text: "retry this",
			},
		]);

		expect(html).not.toContain("wt-msg-retry");
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
