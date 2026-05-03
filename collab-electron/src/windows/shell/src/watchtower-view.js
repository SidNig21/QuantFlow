export const WATCHTOWER_AGENT_FILTERS = ["all", "active", "idle", "quiet", "exited"];
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

export function renderWatchtowerAttention(logs, { limit = 5 } = {}) {
	const items = getWatchtowerAttentionItems(logs, limit);
	if (!items.length) return "";

	return `
		<section class="wt-attention" aria-label="Needs attention">
			<div class="wt-section-title">Needs attention</div>
			${items.map((entry) => {
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
		return `
			<div
				class="wt-msg ${ok ? "wt-msg-ok" : "wt-msg-failed"}"
				data-watchtower-kind="message"
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
				<div class="wt-msg-meta">${escapeHtml(route)}</div>
			</div>
		`;
	}).join("");
}
