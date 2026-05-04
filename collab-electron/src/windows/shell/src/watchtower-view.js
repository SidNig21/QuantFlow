export const WATCHTOWER_AGENT_FILTERS = [
	"all",
	"active",
	"idle",
	"quiet",
	"waiting",
	"blocked",
	"exited",
];
export const WATCHTOWER_RELAY_ERROR_FILTERS = [
	"no_route",
	"missing_pty",
	"ambiguous_route",
	"unconnected_target",
	"write_failed",
];
export const WATCHTOWER_MESSAGE_FILTERS = [
	"all",
	"failed",
	...WATCHTOWER_RELAY_ERROR_FILTERS,
];
export const WATCHTOWER_EVENT_FILTERS = [
	"all",
	"error",
	"warn",
	"info",
];

export function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function createConnectionCounts(connections) {
	const counts = new Map();
	for (const conn of connections) {
		counts.set(conn.tileAId, (counts.get(conn.tileAId) ?? 0) + 1);
		counts.set(conn.tileBId, (counts.get(conn.tileBId) ?? 0) + 1);
	}
	return counts;
}

export function filterWatchtowerAgents(items, filter = "all") {
	if (filter === "all") return items;
	return items.filter((item) => item.status === filter);
}

export function filterWatchtowerMessages(logs, filter = "all") {
	if (filter === "failed") {
		return logs.filter((entry) => entry.ok === false);
	}
	if (WATCHTOWER_RELAY_ERROR_FILTERS.includes(filter)) {
		return logs.filter((entry) => entry.errorCode === filter);
	}
	return logs;
}

export function filterWatchtowerEvents(events, filter = "all") {
	if (filter === "all") return events;
	return events.filter((event) => event.severity === filter);
}

export function formatWatchtowerFilterLabel(filter) {
	if (!filter) return "";
	return String(filter)
		.split("_")
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.map((part) => part === "Pty" ? "PTY" : part)
		.join(" ");
}

export function getWatchtowerAttentionItems(logs, limit = 5) {
	return logs
		.filter((entry) => entry.ok === false)
		.slice(-limit)
		.reverse();
}

export function getWatchtowerOperationalAttentionItems(events, limit = 5) {
	return (Array.isArray(events) ? events : [])
		.filter((event) => {
			if (!event) return false;
			if (event.severity === "error") return true;
			return String(event.type || "").endsWith(".failed");
		})
		.slice(-limit)
		.reverse();
}

export function formatRelayRoute(entry) {
	const method = entry?.routeMethod === "agent" ? "agent" : "manual";
	const source = firstNonBlank(entry?.fromLabel, entry?.fromTileId) || "unknown";
	const targetLabel = String(entry?.targetLabel || "").trim().replace(/^@/, "");
	const target = targetLabel
		? `@${targetLabel}`
		: firstNonBlank(entry?.targetTileId) || "unresolved";
	return `${method} / ${source} -> ${target}`;
}

function firstNonBlank(...values) {
	for (const value of values) {
		const text = String(value ?? "").trim();
		if (text) return text;
	}
	return "";
}

export function formatWatchtowerAge(ts, now = Date.now()) {
	if (!Number.isFinite(ts) || ts <= 0) return "no activity";
	const ageMs = Math.max(0, now - ts);
	const seconds = Math.floor(ageMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const SECRET_PATTERNS = [
	/\bsk-[A-Za-z0-9_-]{12,}\b/g,
	/\bgh[opsu]_[A-Za-z0-9_]{12,}\b/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	/\bglpat-[A-Za-z0-9_-]{12,}\b/g,
	/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g,
	/\b(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi,
];

export function redactDiagnosticText(value) {
	let text = String(value ?? "");
	for (const pattern of SECRET_PATTERNS) {
		text = text.replace(pattern, (match) => {
			const separator = match.match(/\s*[:=]\s*/);
			if (separator?.index !== undefined) {
				return `${match.slice(0, separator.index)}${separator[0]}[REDACTED]`;
			}
			return "[REDACTED]";
		});
	}
	return text;
}

function diagnosticValue(value, fallback = "") {
	return redactDiagnosticText(firstNonBlank(value, fallback));
}

export function getWatchtowerRetryRequest(
	entry,
	connection,
	fromTile,
	targetTile,
	getLabel,
) {
	if (entry?.ok !== false) return null;
	const text = String(entry?.text ?? "").trim();
	if (!text) return null;
	if (!connection || !fromTile || !targetTile) return null;
	const fromTileId = String(entry?.fromTileId ?? "");
	const targetTileId = String(entry?.targetTileId ?? "");
	if (!fromTileId || !targetTileId || fromTileId === targetTileId) return null;
	const direct = connection.tileAId === fromTileId && connection.tileBId === targetTileId;
	const reverse = connection.tileAId === targetTileId && connection.tileBId === fromTileId;
	if (!direct && !reverse) return null;
	if (fromTile.id !== fromTileId || targetTile.id !== targetTileId) return null;
	const labelFor = typeof getLabel === "function" ? getLabel : (tile) => tile.id;
	return {
		connectionId: connection.id,
		fromTileId,
		fromLabel: labelFor(fromTile),
		targetTileId,
		targetSessionId: targetTile.ptySessionId ?? null,
		text,
	};
}

export function shouldRenderWatchtowerRetry(entry) {
	if (entry?.ok !== false) return false;
	if (!String(entry?.eventId ?? "").trim()) return false;
	if (!String(entry?.connectionId ?? "").trim()) return false;
	if (!String(entry?.fromTileId ?? "").trim()) return false;
	if (!String(entry?.targetTileId ?? "").trim()) return false;
	if (!String(entry?.text ?? "").trim()) return false;
	return true;
}

export function formatWatchtowerDiagnostics({
	runtime = {},
	agents = [],
	connections = [],
	relayLogs = [],
	operationalEvents = [],
	roles = [],
	now = Date.now(),
} = {}) {
	const lines = [
		"QuantFlow Watchtower diagnostics",
		`Generated: ${new Date(now).toISOString()}`,
		"",
		"Runtime",
		`- appVersion: ${diagnosticValue(runtime?.appVersion, "unknown")}`,
		`- os: ${diagnosticValue(runtime?.os, "unknown")}`,
		`- shellMode: ${diagnosticValue(runtime?.shellMode, "unknown")}`,
		`- terminalTarget: ${diagnosticValue(runtime?.terminalTarget, "auto")}`,
		"",
		`Agents (${agents.length})`,
	];
	if (agents.length) {
		for (const item of agents) {
			const label = diagnosticValue(item?.label || item?.tileId || "unknown");
			const handle = item?.routeHandle ? ` @${diagnosticValue(item.routeHandle)}` : "";
			const last = item?.lastLine
				? ` last="${redactDiagnosticText(String(item.lastLine).slice(0, 160))}"`
				: "";
			lines.push(
				`- ${label}${handle} [${diagnosticValue(item?.status, "unknown")}] tile=${diagnosticValue(item?.tileId)} session=${diagnosticValue(item?.sessionId)} ${formatWatchtowerAge(item?.lastActivityTs, now)}${last}`,
			);
		}
	} else {
		lines.push("- none");
	}

	lines.push("", `Cables (${connections.length})`);
	if (connections.length) {
		for (const conn of connections) {
			const label = conn?.label ? ` label="${diagnosticValue(conn.label)}"` : "";
			lines.push(`- ${diagnosticValue(conn?.id)}: ${diagnosticValue(conn?.tileAId)} <-> ${diagnosticValue(conn?.tileBId)}${label}`);
		}
	} else {
		lines.push("- none");
	}

	lines.push("", `Roles (${roles.length})`);
	if (roles.length) {
		for (const role of roles) {
			const command = role?.commandTemplate
				? ` command="${redactDiagnosticText(role.commandTemplate)}"`
				: "";
			const available = role?.commandAvailable === false
				? "missing"
				: role?.commandAvailable === true
					? "available"
					: "n/a";
			lines.push(
				`- ${diagnosticValue(role?.name, role?.id || "role")} id=${diagnosticValue(role?.id)} shell=${diagnosticValue(role?.defaultShell, "auto")} cwd=${diagnosticValue(role?.cwdPolicy, "workspace")} command=${available}${command}`,
			);
		}
	} else {
		lines.push("- none");
	}

	lines.push("", `Operational events (${operationalEvents.length})`);
	if (operationalEvents.length) {
		for (const event of operationalEvents.slice(-30).reverse()) {
			const age = formatWatchtowerAge(event?.timestamp, now);
			const summary = redactDiagnosticText(
				String(event?.summary || event?.type || "event").slice(0, 180),
			);
			const detail = event?.detail
				? ` :: ${redactDiagnosticText(String(event.detail).slice(0, 180))}`
				: "";
			lines.push(`- ${diagnosticValue(event?.severity, "info")} ${diagnosticValue(event?.type, "event")} ${age} :: ${summary}${detail}`);
		}
	} else {
		lines.push("- none");
	}

	lines.push("", `Relay events (${relayLogs.length})`);
	if (relayLogs.length) {
		for (const entry of relayLogs.slice(-20).reverse()) {
			const status = entry?.ok === false
				? `failed/${diagnosticValue(entry?.errorCode, "unknown")}`
				: "sent";
			const text = redactDiagnosticText(
				String(entry?.message || entry?.formatted || entry?.text || "").slice(0, 180),
			);
			lines.push(`- ${status} ${redactDiagnosticText(formatRelayRoute(entry))} :: ${text}`);
		}
	} else {
		lines.push("- none");
	}

	return lines.join("\n");
}

export function renderWatchtowerAgents(
	items,
	{
		filter = "all",
		connectionCounts = new Map(),
		now = Date.now(),
	} = {},
) {
	const filtered = filterWatchtowerAgents(items, filter);
	if (!filtered.length) {
		const label = filter === "all" ? "" : `${filter} `;
		return `<p class="wt-empty">No ${escapeHtml(label)}tile sessions.</p>`;
	}
	return filtered.map((item) => {
		const cableCount = connectionCounts.get(item.tileId) ?? 0;
		const meta = [
			item.status,
			`${cableCount} ${cableCount === 1 ? "cable" : "cables"}`,
			formatWatchtowerAge(item.lastActivityTs, now),
		].join(" / ");
		return `
			<div
				class="wt-agent-card wt-status-${escapeHtml(item.status)}"
				data-watchtower-kind="agent"
				data-tile-id="${escapeHtml(item.tileId)}"
				role="button"
				tabindex="0"
			>
				<div class="wt-agent-label">${escapeHtml(item.label)}</div>
				<div class="wt-agent-status">${escapeHtml(meta)}</div>
				${item.lastLine ? `<div class="wt-agent-line">${escapeHtml(item.lastLine.slice(0, 120))}</div>` : ""}
			</div>
		`;
	}).join("");
}

export function renderWatchtowerAttention(
	logs,
	{ limit = 5, operationalEvents = [] } = {},
) {
	const relayItems = getWatchtowerAttentionItems(logs, limit);
	const eventItems = getWatchtowerOperationalAttentionItems(
		operationalEvents,
		limit,
	);
	if (!relayItems.length && !eventItems.length) return "";

	return `
		<section class="wt-attention" aria-label="Needs attention">
			<div class="wt-section-title">Needs attention</div>
			${relayItems.map((entry) => {
				const code = entry.errorCode || "relay failed";
				const text = entry.message || entry.formatted || entry.text || "";
				const route = formatRelayRoute(entry);
				return `
					<div
						class="wt-attention-card"
						data-watchtower-kind="message"
						data-conn-id="${escapeHtml(entry.connectionId)}"
						data-from-tile-id="${escapeHtml(entry.fromTileId)}"
						data-target-tile-id="${escapeHtml(entry.targetTileId ?? "")}"
						role="button"
						tabindex="0"
					>
						<div class="wt-attention-code">${escapeHtml(code)}</div>
						<div class="wt-attention-route">${escapeHtml(route)}</div>
						<div class="wt-attention-text">${escapeHtml(String(text).slice(0, 160))}</div>
					</div>
				`;
			}).join("")}
			${eventItems.map((event) => {
				const meta = event?.meta && typeof event.meta === "object" ? event.meta : {};
				const code = event.type || "event.failed";
				const route = firstNonBlank(
					meta.connectionId,
					meta.tileId,
					meta.targetTileId,
					meta.fromTileId,
				) || "operational event";
				const text = event.detail || event.summary || "";
				return `
					<div
						class="wt-attention-card"
						data-watchtower-kind="event"
						data-conn-id="${escapeHtml(meta.connectionId ?? "")}"
						data-tile-id="${escapeHtml(meta.tileId ?? "")}"
						data-from-tile-id="${escapeHtml(meta.fromTileId ?? meta.tileAId ?? "")}"
						data-target-tile-id="${escapeHtml(meta.targetTileId ?? meta.tileBId ?? "")}"
						role="button"
						tabindex="0"
					>
						<div class="wt-attention-code">${escapeHtml(code)}</div>
						<div class="wt-attention-route">${escapeHtml(route)}</div>
						<div class="wt-attention-text">${escapeHtml(String(text).slice(0, 160))}</div>
					</div>
				`;
			}).join("")}
		</section>
	`;
}

export function renderWatchtowerMessages(
	logs,
	{
		filter = "all",
		limit = 20,
	} = {},
) {
	const filtered = filterWatchtowerMessages(logs, filter);
	if (!filtered.length) {
		const label = filter === "all" ? "" : `${filter.replace(/_/g, "-")} `;
		return `<p class="wt-empty">No ${escapeHtml(label)}relay messages.</p>`;
	}
	return filtered.slice(-limit).reverse().map((entry) => {
		const ok = entry.ok !== false;
		const label = ok ? entry.fromLabel : entry.errorCode || "relay failed";
		const text = ok ? entry.formatted : entry.message || entry.formatted;
		const route = formatRelayRoute(entry);
		const canRetry = shouldRenderWatchtowerRetry(entry);
		return `
			<div
				class="wt-msg ${ok ? "wt-msg-ok" : "wt-msg-failed"}"
				data-watchtower-kind="message"
				data-event-id="${escapeHtml(entry.eventId ?? "")}"
				data-conn-id="${escapeHtml(entry.connectionId)}"
				data-from-tile-id="${escapeHtml(entry.fromTileId)}"
				data-target-tile-id="${escapeHtml(entry.targetTileId ?? "")}"
				role="button"
				tabindex="0"
			>
				<div class="wt-msg-line">
					<span class="wt-msg-from">${escapeHtml(label)}</span>
					<span class="wt-msg-arrow">${ok ? "&rarr;" : "!"}</span>
					<span class="wt-msg-text">${escapeHtml(String(text ?? "").slice(0, 200))}</span>
				</div>
				<div class="wt-msg-meta">
					<span class="wt-msg-route">${escapeHtml(route)}</span>
					${canRetry ? `<button class="wt-msg-retry" data-event-id="${escapeHtml(entry.eventId)}" type="button">Retry</button>` : ""}
				</div>
			</div>
		`;
	}).join("");
}

export function renderWatchtowerEvents(
	events,
	{
		filter = "all",
		limit = 30,
		now = Date.now(),
	} = {},
) {
	const filtered = filterWatchtowerEvents(events, filter);
	if (!filtered.length) {
		const label = filter === "all" ? "" : `${filter} `;
		return `<p class="wt-empty">No ${escapeHtml(label)}operational events.</p>`;
	}
	return filtered.slice(-limit).reverse().map((event) => {
		const meta = event?.meta && typeof event.meta === "object" ? event.meta : {};
		return `
			<div
				class="wt-event wt-event-${escapeHtml(event.severity || "info")}"
				data-watchtower-kind="event"
				data-conn-id="${escapeHtml(meta.connectionId ?? "")}"
				data-tile-id="${escapeHtml(meta.tileId ?? "")}"
				data-from-tile-id="${escapeHtml(meta.fromTileId ?? meta.tileAId ?? "")}"
				data-target-tile-id="${escapeHtml(meta.targetTileId ?? meta.tileBId ?? "")}"
				role="button"
				tabindex="0"
			>
				<div class="wt-event-line">
					<span class="wt-event-type">${escapeHtml(event.type || "event")}</span>
					<span class="wt-event-age">${escapeHtml(formatWatchtowerAge(event.timestamp, now))}</span>
				</div>
				<div class="wt-event-summary">${escapeHtml(String(event.summary || "").slice(0, 180))}</div>
				${event.detail ? `<div class="wt-event-detail">${escapeHtml(String(event.detail).slice(0, 200))}</div>` : ""}
			</div>
		`;
	}).join("");
}
