import { describe, expect, test } from "bun:test";
import {
	WATCHTOWER_AGENT_FILTERS,
	WATCHTOWER_ALERT_FILTERS,
	WATCHTOWER_EVENT_FILTERS,
	WATCHTOWER_MESSAGE_FILTERS,
	WATCHTOWER_TABS,
	createConnectionCounts,
	createWatchtowerQueueDepths,
	createWatchtowerQueueDepthsFromDb,
	createWatchtowerSummary,
	dbEventsToWatchtowerEvents,
	escapeHtml,
	filterWatchtowerAgents,
	filterWatchtowerAlerts,
	filterWatchtowerEvents,
	filterWatchtowerMessages,
	formatWatchtowerFilterLabel,
	formatWatchtowerDiagnostics,
	formatRelayRoute,
	formatWatchtowerAge,
	getWatchtowerFocusPlan,
	getWatchtowerRetryRequest,
	getWatchtowerAttentionItems,
	getWatchtowerOperationalAttentionItems,
	groupEventsByCorrelation,
	redactDiagnosticText,
	renderWatchtowerAgents,
	renderWatchtowerAlerts,
	renderWatchtowerAttention,
	renderWatchtowerEvents,
	renderWatchtowerMessages,
	renderWatchtowerQueues,
	renderWatchtowerRail,
	runWatchtowerFocusPlan,
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
		{ ok: false, errorCode: "relay_overflow" },
	];

	test("filters failed relay events", () => {
		expect(filterWatchtowerMessages(logs, "failed")).toHaveLength(6);
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
			"relay_overflow",
		]);
		for (const code of WATCHTOWER_MESSAGE_FILTERS.slice(2)) {
			expect(filterWatchtowerMessages(logs, code)).toEqual([
				{ ok: false, errorCode: code },
			]);
		}
	});
});

describe("filterWatchtowerEvents", () => {
	const events = [
		{ severity: "info", summary: "connected" },
		{ severity: "warn", summary: "missing context" },
		{ severity: "error", summary: "role failed" },
	];

	test("filters operational events by severity", () => {
		expect(WATCHTOWER_EVENT_FILTERS).toEqual([
			"all",
			"error",
			"warn",
			"info",
		]);
		expect(filterWatchtowerEvents(events, "error")).toEqual([
			{ severity: "error", summary: "role failed" },
		]);
		expect(filterWatchtowerEvents(events)).toHaveLength(3);
	});
});

describe("Watchtower redesign summary helpers", () => {
	test("defines the Events-first tab model and alert filters", () => {
		expect(WATCHTOWER_TABS).toEqual([
			"events",
			"queues",
			"agents",
			"alerts",
		]);
		expect(WATCHTOWER_ALERT_FILTERS).toEqual([
			"all",
			"error",
			"warn",
			"relay",
		]);
	});

	test("counts tabs, active agents, failed relays, and hot cable queues", () => {
		const relayLogs = Array.from({ length: 9 }, (_, index) => ({
			ok: index !== 0,
			connectionId: "conn-hot",
			errorCode: index === 0 ? "missing_pty" : undefined,
		}));
		const summary = createWatchtowerSummary({
			agents: [
				{ status: "active" },
				{ status: "idle" },
				{ status: "blocked" },
			],
			relayLogs,
			operationalEvents: [
				{ type: "context.failed", severity: "warn" },
				{ type: "connection.created", severity: "info" },
			],
			connections: [
				{ id: "conn-hot", tileAId: "a", tileBId: "b", label: "hot path" },
			],
		});

		expect(summary.tabs).toEqual({
			events: 2,
			queues: 9,
			agents: 3,
			alerts: 2,
		});
		expect(summary.activeAgents).toBe(2);
		expect(summary.failedRelayCount).toBe(1);
		expect(summary.hotCableCount).toBe(1);
	});

	test("uses DB queue depths and correlation groups when supplied", () => {
		const summary = createWatchtowerSummary({
			agents: [],
			relayLogs: [],
			operationalEvents: [],
			connections: [],
			queueDepths: [
				{ connectionId: "conn-db", label: "db path", depth: 11, hot: true },
			],
			correlationGroups: [
				{ correlationId: "corr-1", events: [] },
				{ correlationId: "corr-2", events: [] },
			],
		});

		expect(summary.queueDepths).toEqual([
			{ connectionId: "conn-db", label: "db path", depth: 11, hot: true },
		]);
		expect(summary.hotCableCount).toBe(1);
		expect(summary.correlationGroupCount).toBe(2);
	});

	test("builds sorted queue depths with hot cable markers", () => {
		const depths = createWatchtowerQueueDepths([
			{ connectionId: "b" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
			{ connectionId: "a" },
		], [
			{ id: "a", label: "alpha" },
			{ id: "b", label: "beta" },
		]);

		expect(depths[0]).toMatchObject({
			connectionId: "a",
			label: "alpha",
			depth: 9,
			hot: true,
		});
		expect(depths[1]).toMatchObject({
			connectionId: "b",
			label: "beta",
			depth: 1,
			hot: false,
		});
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

describe("formatWatchtowerDiagnostics", () => {
	test("formats copyable agent, cable, and relay diagnostics", () => {
		const text = formatWatchtowerDiagnostics({
			now: 4_000,
			runtime: {
				appVersion: "1.2.3",
				os: "win32",
				shellMode: "sidecar",
				terminalTarget: "wsl:Ubuntu",
			},
			agents: [
				{
					tileId: "tile-a",
					label: "Planner",
					routeHandle: "planner",
					sessionId: "session-a",
					status: "waiting",
					lastActivityTs: 1_000,
					lastLine: "Approval required: continue?",
				},
			],
			connections: [
				{ id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b", label: "review" },
			],
			relayLogs: [
				{
					ok: false,
					errorCode: "missing_pty",
					routeMethod: "agent",
					fromLabel: "Planner",
					targetLabel: "Reviewer",
					message: "Target session is not active.",
				},
			],
			operationalEvents: [
				{
					type: "connection.created",
					severity: "info",
					timestamp: 2_000,
					summary: "Planner connected to Reviewer",
				},
			],
			roles: [
				{
					id: "codex",
					name: "Codex",
					defaultShell: "auto",
					cwdPolicy: "workspace",
					commandTemplate: "codex",
					commandAvailable: true,
				},
			],
		});

		expect(text).toContain("QuantFlow Watchtower diagnostics");
		expect(text).toContain("Runtime");
		expect(text).toContain("appVersion: 1.2.3");
		expect(text).toContain("os: win32");
		expect(text).toContain("shellMode: sidecar");
		expect(text).toContain("terminalTarget: wsl:Ubuntu");
		expect(text).toContain("Agents (1)");
		expect(text).toContain("Planner @planner [waiting]");
		expect(text).toContain("Cables (1)");
		expect(text).toContain("conn-ab: tile-a <-> tile-b");
		expect(text).toContain("Roles (1)");
		expect(text).toContain("Codex id=codex shell=auto cwd=workspace command=available command=\"codex\"");
		expect(text).toContain("Relay events (1)");
		expect(text).toContain("failed/missing_pty agent / Planner -> @Reviewer");
		expect(text).toContain("Operational events (1)");
		expect(text).toContain("connection.created 2s ago :: Planner connected to Reviewer");
	});

	test("redacts common secrets from diagnostic fields", () => {
		const text = formatWatchtowerDiagnostics({
			now: 4_000,
			runtime: {
				appVersion: "token=runtime-secret",
				os: "win32",
				shellMode: "sidecar",
				terminalTarget: "auto",
			},
			agents: [
				{
					tileId: "tile-a",
					label: "Planner",
					status: "waiting",
					sessionId: "session-a",
					lastActivityTs: 1_000,
					lastLine: "OPENAI_API_KEY=sk-supersecret123456789",
				},
			],
			connections: [
				{
					id: "conn-ab",
					tileAId: "tile-a",
					tileBId: "tile-b",
					label: "token=conn-secret",
				},
			],
			relayLogs: [
				{
					ok: false,
					errorCode: "write_failed",
					routeMethod: "manual",
					fromLabel: "Planner",
					targetLabel: "Reviewer",
					message: "password=hunter2",
				},
			],
			operationalEvents: [
				{
					type: "context.failed",
					severity: "error",
					timestamp: 2_000,
					summary: "secret=abc123",
					detail: "ghp_abcdefghijklmnopqrstuvwxyz",
				},
			],
			roles: [
				{
					id: "codex",
					name: "Codex",
					commandTemplate: "codex --api-key sk-rolekey123456789",
				},
			],
		});

		expect(text).toContain("[REDACTED]");
		expect(text).not.toContain("supersecret");
		expect(text).not.toContain("conn-secret");
		expect(text).not.toContain("hunter2");
		expect(text).not.toContain("abc123");
		expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz");
		expect(text).not.toContain("rolekey");
	});
});

describe("redactDiagnosticText", () => {
	test("preserves diagnostic keys while redacting values", () => {
		expect(redactDiagnosticText("token=abc123 password: hunter2"))
			.toBe("token=[REDACTED] password: [REDACTED]");
	});
});

describe("getWatchtowerFocusPlan", () => {
	test("focuses agent rows by tile id", () => {
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "agent",
			tileId: "tile-a",
		})).toEqual([{ type: "tile", tileId: "tile-a" }]);
	});

	test("focuses message rows by cable first, then target and source fallback", () => {
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: "conn-ab",
			targetTileId: "tile-b",
			fromTileId: "tile-a",
		})).toEqual([
			{ type: "relay", connId: "conn-ab" },
			{ type: "tile", tileId: "tile-b" },
			{ type: "tile", tileId: "tile-a" },
		]);
	});

	test("focuses operational events by cable, tile, target, then source", () => {
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "event",
			connId: "conn-ab",
			tileId: "tile-c",
			targetTileId: "tile-b",
			fromTileId: "tile-a",
		})).toEqual([
			{ type: "relay", connId: "conn-ab" },
			{ type: "tile", tileId: "tile-c" },
			{ type: "tile", tileId: "tile-b" },
			{ type: "tile", tileId: "tile-a" },
		]);
	});

	test("skips blank focus targets", () => {
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: " ",
			targetTileId: "",
			fromTileId: "tile-a",
		})).toEqual([{ type: "tile", tileId: "tile-a" }]);
		expect(getWatchtowerFocusPlan({ watchtowerKind: "unknown" })).toEqual([]);
	});
});

describe("runWatchtowerFocusPlan", () => {
	test("stops after the first successful relay focus", () => {
		const calls = [];
		const result = runWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: "conn-ab",
			targetTileId: "tile-b",
			fromTileId: "tile-a",
		}, {
			onRelay(connId) {
				calls.push(["relay", connId]);
				return true;
			},
			onTile(tileId) {
				calls.push(["tile", tileId]);
				return true;
			},
		});

		expect(result).toEqual({ type: "relay", connId: "conn-ab" });
		expect(calls).toEqual([["relay", "conn-ab"]]);
	});

	test("falls back through target and source tiles until one succeeds", () => {
		const calls = [];
		const result = runWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: "conn-ab",
			targetTileId: "tile-b",
			fromTileId: "tile-a",
		}, {
			onRelay(connId) {
				calls.push(["relay", connId]);
				return false;
			},
			onTile(tileId) {
				calls.push(["tile", tileId]);
				return tileId === "tile-a";
			},
		});

		expect(result).toEqual({ type: "tile", tileId: "tile-a" });
		expect(calls).toEqual([
			["relay", "conn-ab"],
			["tile", "tile-b"],
			["tile", "tile-a"],
		]);
	});

	test("returns null when no focus action succeeds", () => {
		expect(runWatchtowerFocusPlan({
			watchtowerKind: "agent",
			tileId: "tile-a",
		}, {
			onTile: () => false,
		})).toBeNull();
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

describe("getWatchtowerOperationalAttentionItems", () => {
	test("returns recent error and failed operational events newest first", () => {
		const events = [
			{ type: "connection.created", severity: "info" },
			{ type: "context.failed", severity: "warn", summary: "old" },
			{ type: "pty.failed", severity: "error", summary: "new" },
		];

		expect(getWatchtowerOperationalAttentionItems(events, 2)).toEqual([
			{ type: "pty.failed", severity: "error", summary: "new" },
			{ type: "context.failed", severity: "warn", summary: "old" },
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

		expect(html).toContain("data-watchtower-kind=\"agent\"");
		expect(html).toContain("data-tile-id=\"tile&quot;&lt;a&gt;\"");
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "agent",
			tileId: `tile"<a>`,
		})).toEqual([{ type: "tile", tileId: `tile"<a>` }]);
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
		expect(html).toContain("data-from-tile-id=\"from\"");
		expect(html).toContain("data-target-tile-id=\"\"");
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: `conn"<x>`,
			fromTileId: "from",
			targetTileId: "",
		})).toEqual([
			{ type: "relay", connId: `conn"<x>` },
			{ type: "tile", tileId: "from" },
		]);
		expect(html).toContain("no_route");
		expect(html).toContain("&lt;missing&gt;");
		expect(html).toContain("agent / &lt;sender&gt; -&gt; @&lt;target&gt;");
		expect(html).not.toContain("<missing>");
	});

	test("renders successful relay rows with cable, source, and target focus data", () => {
		const html = renderWatchtowerMessages([
			{
				ok: true,
				eventId: "relay-2",
				connectionId: "conn-ab",
				fromTileId: "tile-a",
				targetTileId: "tile-b",
				routeMethod: "manual",
				fromLabel: "Planner",
				formatted: "[Planner]: ready",
			},
		]);

		expect(html).toContain("data-watchtower-kind=\"message\"");
		expect(html).toContain("data-conn-id=\"conn-ab\"");
		expect(html).toContain("data-from-tile-id=\"tile-a\"");
		expect(html).toContain("data-target-tile-id=\"tile-b\"");
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: "conn-ab",
			targetTileId: "tile-b",
			fromTileId: "tile-a",
		})).toEqual([
			{ type: "relay", connId: "conn-ab" },
			{ type: "tile", tileId: "tile-b" },
			{ type: "tile", tileId: "tile-a" },
		]);
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

	test("renderWatchtowerQueues reuses relay queue rows with search filtering", () => {
		const html = renderWatchtowerQueues([
			{
				ok: true,
				connectionId: "conn-ab",
				fromLabel: "Planner",
				targetLabel: "Reviewer",
				formatted: "queued payload",
			},
			{
				ok: true,
				connectionId: "conn-cd",
				fromLabel: "Trainer",
				targetLabel: "Monitor",
				formatted: "other payload",
			},
		], { query: "reviewer" });

		expect(html).toContain("Planner");
		expect(html).toContain("@Reviewer");
		expect(html).not.toContain("Trainer");
	});
});

describe("renderWatchtowerEvents", () => {
	test("renders escaped operational event rows with route metadata", () => {
		const html = renderWatchtowerEvents([
			{
				type: "connection.created",
				severity: "info",
				timestamp: 2_000,
				summary: "Planner <-> Reviewer",
				detail: "Created from cable port",
				meta: {
					connectionId: "conn-ab",
					tileAId: "tile-a",
					tileBId: "tile-b",
				},
			},
		], { now: 5_000 });

		expect(html).toContain("data-watchtower-kind=\"event\"");
		expect(html).toContain("data-conn-id=\"conn-ab\"");
		expect(html).toContain("data-from-tile-id=\"tile-a\"");
		expect(html).toContain("data-target-tile-id=\"tile-b\"");
		expect(html).toContain("Planner &lt;-&gt; Reviewer");
		expect(html).toContain("3s ago");
	});

	test("renders filtered empty state", () => {
		expect(renderWatchtowerEvents([], { filter: "error" }))
			.toContain("No error operational events.");
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
		expect(html).toContain("data-target-tile-id=\"\"");
		expect(getWatchtowerFocusPlan({
			watchtowerKind: "message",
			connId: `conn"<x>`,
			fromTileId: `from"<x>`,
			targetTileId: "",
		})).toEqual([
			{ type: "relay", connId: `conn"<x>` },
			{ type: "tile", tileId: `from"<x>` },
		]);
		expect(html).toContain("missing_pty");
		expect(html).toContain("agent / Planner -&gt; @Reviewer");
		expect(html).toContain("&lt;target exited&gt;");
		expect(html).not.toContain("<target exited>");
	});

	test("renders escaped operational failure cards", () => {
		const html = renderWatchtowerAttention([], {
			operationalEvents: [
				{
					type: "pty.failed",
					severity: "error",
					summary: "PTY start failed",
					detail: "<spawn ENOENT>",
					meta: {
						tileId: `tile"<x>`,
						targetTileId: "tile-b",
					},
				},
			],
		});

		expect(html).toContain("Needs attention");
		expect(html).toContain("data-watchtower-kind=\"event\"");
		expect(html).toContain("data-tile-id=\"tile&quot;&lt;x&gt;\"");
		expect(html).toContain("pty.failed");
		expect(html).toContain("tile&quot;&lt;x&gt;");
		expect(html).toContain("&lt;spawn ENOENT&gt;");
		expect(html).not.toContain("<spawn ENOENT>");
	});
});

describe("renderWatchtowerAlerts", () => {
	test("renders zero-state when there are no alerts", () => {
		expect(renderWatchtowerAlerts([], { operationalEvents: [] }))
			.toContain("No alerts.");
	});

	test("renders relay and operational alerts with focus data and acknowledge buttons", () => {
		const html = renderWatchtowerAlerts([
			{
				ok: false,
				eventId: "relay-1",
				errorCode: "missing_pty",
				connectionId: "conn-ab",
				fromTileId: "tile-a",
				targetTileId: "tile-b",
				message: "Target exited",
			},
		], {
			operationalEvents: [
				{
					type: "context.failed",
					severity: "warn",
					summary: "Context build failed",
					detail: "<details>",
					meta: { tileId: "tile-c" },
				},
			],
		});

		expect(filterWatchtowerAlerts([
			{ ok: false, errorCode: "missing_pty" },
		], [], "relay")).toHaveLength(1);
		expect(html).toContain("Relay alert");
		expect(html).toContain("Operational alert");
		expect(html).toContain("data-watchtower-kind=\"message\"");
		expect(html).toContain("data-target-tile-id=\"tile-b\"");
		expect(html).toContain("data-watchtower-kind=\"event\"");
		expect(html).toContain("data-tile-id=\"tile-c\"");
		expect(html).toContain("Acknowledge");
		expect(html).toContain("&lt;details&gt;");
	});
});

describe("renderWatchtowerRail", () => {
	test("renders throughput, queue bars, hot cable markers, and agent rollup", () => {
		const html = renderWatchtowerRail({
			agents: [
				{ status: "active" },
				{ status: "idle" },
			],
			relayLogs: Array.from({ length: 9 }, (_, index) => ({
				ok: index !== 1,
				connectionId: "conn-hot",
			})),
			operationalEvents: [],
			connections: [
				{ id: "conn-hot", label: "hot cable" },
			],
			correlationGroups: [
				{ correlationId: "corr-1", events: [] },
			],
		});

		expect(html).toContain("Throughput");
		expect(html).toContain("9 relay events");
		expect(html).toContain("hot cable");
		expect(html).toContain("is-hot");
		expect(html).toContain("1 live");
		expect(html).toContain("1 failed relays");
		expect(html).toContain("1 correlations");
	});
});

// ─── DB-backed Watchtower data path (T004) ────────────────────────────────────

describe("dbEventsToWatchtowerEvents", () => {
	const overflowRow = {
		id: "evt-overflow-1",
		kind: "relay.overflow",
		level: "warn",
		tile_id: "tile-from",
		cable_id: "conn-ab",
		correlation_id: "corr-1",
		trace_id: "trace-1",
		run_id: null,
		task_id: null,
		created_at: 1_000_000,
		data: {
			connectionId: "conn-ab",
			fromTileId: "tile-from",
			targetTileId: "tile-to",
			queue_depth: 11,
			queue_depth_max: 10,
		},
	};

	test("maps relay.overflow DB row to watchtower operational event", () => {
		const events = dbEventsToWatchtowerEvents([overflowRow]);
		expect(events).toHaveLength(1);
		const ev = events[0];
		expect(ev.type).toBe("relay.overflow");
		expect(ev.severity).toBe("warn");
		expect(ev.timestamp).toBe(1_000_000);
		expect(ev.summary).toContain("conn-ab");
		expect(ev.summary).toContain("11/10");
		expect(ev.meta.connectionId).toBe("conn-ab");
		expect(ev.meta.fromTileId).toBe("tile-from");
		expect(ev.meta.targetTileId).toBe("tile-to");
		expect(ev.meta.correlationId).toBe("corr-1");
		expect(ev.meta.traceId).toBe("trace-1");
	});

	test("maps relay.sent DB row with tile_id fallback", () => {
		const row = {
			id: "evt-sent-1",
			kind: "relay.sent",
			level: "info",
			tile_id: "tile-from",
			cable_id: "conn-ab",
			correlation_id: null,
			trace_id: null,
			run_id: null,
			task_id: null,
			created_at: 2_000,
			data: { fromTileId: "tile-from", targetTileId: "tile-to" },
		};
		const events = dbEventsToWatchtowerEvents([row]);
		expect(events[0].type).toBe("relay.sent");
		expect(events[0].severity).toBe("info");
		expect(events[0].summary).toContain("tile-from");
		expect(events[0].meta.tileId).toBe("tile-from");
	});

	test("defaults severity to info when level is null", () => {
		const row = {
			id: "evt-2",
			kind: "context.created",
			level: null,
			tile_id: null,
			cable_id: null,
			correlation_id: null,
			trace_id: null,
			run_id: null,
			task_id: null,
			created_at: 3_000,
			data: {},
		};
		expect(dbEventsToWatchtowerEvents([row])[0].severity).toBe("info");
	});

	test("overflow event surfaces in filterWatchtowerEvents by severity", () => {
		const events = dbEventsToWatchtowerEvents([overflowRow]);
		expect(filterWatchtowerEvents(events, "warn")).toHaveLength(1);
		expect(filterWatchtowerEvents(events, "error")).toHaveLength(0);
		expect(filterWatchtowerEvents(events, "all")).toHaveLength(1);
	});
});

describe("createWatchtowerQueueDepthsFromDb", () => {
	test("returns empty when no connections have queue_depth > 0", () => {
		expect(createWatchtowerQueueDepthsFromDb([
			{ id: "conn-a", tile_a_id: "a", tile_b_id: "b", label: null, queue_depth: 0 },
		])).toEqual([]);
	});

	test("builds sorted queue depths from DB connection rows", () => {
		const depths = createWatchtowerQueueDepthsFromDb([
			{ id: "conn-b", tile_a_id: "x", tile_b_id: "y", label: "beta", queue_depth: 2 },
			{ id: "conn-a", tile_a_id: "a", tile_b_id: "b", label: "alpha", queue_depth: 9 },
		]);

		expect(depths).toHaveLength(2);
		expect(depths[0]).toMatchObject({
			connectionId: "conn-a",
			label: "alpha",
			depth: 9,
			hot: true,
		});
		expect(depths[1]).toMatchObject({
			connectionId: "conn-b",
			label: "beta",
			depth: 2,
			hot: false,
		});
	});

	test("uses tile_a_id -> tile_b_id as label when label is null", () => {
		const depths = createWatchtowerQueueDepthsFromDb([
			{ id: "conn-a", tile_a_id: "tile-x", tile_b_id: "tile-y", label: null, queue_depth: 3 },
		]);
		expect(depths[0].label).toBe("tile-x -> tile-y");
	});

	test("marks hot when depth exceeds 8", () => {
		const depths = createWatchtowerQueueDepthsFromDb([
			{ id: "conn-a", tile_a_id: "a", tile_b_id: "b", label: "ab", queue_depth: 8 },
			{ id: "conn-b", tile_a_id: "c", tile_b_id: "d", label: "cd", queue_depth: 9 },
		]);
		expect(depths.find((d) => d.connectionId === "conn-a")!.hot).toBe(false);
		expect(depths.find((d) => d.connectionId === "conn-b")!.hot).toBe(true);
	});
});

describe("groupEventsByCorrelation", () => {
	test("groups rows by correlation_id, omits rows without one", () => {
		const rows = [
			{ id: "e1", correlation_id: "corr-a", created_at: 1_000, kind: "relay.sent" },
			{ id: "e2", correlation_id: "corr-a", created_at: 2_000, kind: "relay.sent" },
			{ id: "e3", correlation_id: "corr-b", created_at: 3_000, kind: "relay.sent" },
			{ id: "e4", correlation_id: null, created_at: 4_000, kind: "heartbeat" },
		];

		const groups = groupEventsByCorrelation(rows);
		expect(groups).toHaveLength(2);
		expect(groups[0].correlationId).toBe("corr-a");
		expect(groups[0].events).toHaveLength(2);
		expect(groups[1].correlationId).toBe("corr-b");
		expect(groups[1].events).toHaveLength(1);
	});

	test("sorts groups by first event created_at ascending", () => {
		const rows = [
			{ id: "e1", correlation_id: "corr-late", created_at: 5_000, kind: "relay.sent" },
			{ id: "e2", correlation_id: "corr-early", created_at: 1_000, kind: "relay.sent" },
		];
		const groups = groupEventsByCorrelation(rows);
		expect(groups[0].correlationId).toBe("corr-early");
		expect(groups[1].correlationId).toBe("corr-late");
	});

	test("returns empty for rows with no correlation_id", () => {
		expect(groupEventsByCorrelation([
			{ id: "e1", correlation_id: null, created_at: 1_000 },
		])).toEqual([]);
	});
});
