export function normalizeOperationalEvent(input = {}, now = Date.now()) {
	const type = String(input.type ?? "event").trim() || "event";
	const severity = ["info", "warn", "error"].includes(input.severity)
		? input.severity
		: "info";
	const timestamp = Number.isFinite(input.timestamp) ? input.timestamp : now;
	const summary = String(input.summary ?? type).trim() || type;
	return {
		id: String(input.id ?? `${timestamp}-${Math.random().toString(36).slice(2, 8)}`),
		type,
		severity,
		timestamp,
		summary,
		detail: String(input.detail ?? ""),
		meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : {},
	};
}

export function createOperationalEventLog({ limit = 100, now = Date.now } = {}) {
	const max = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 100);
	const events = [];

	function record(input) {
		const event = normalizeOperationalEvent(input, now());
		events.push(event);
		if (events.length > max) {
			events.splice(0, events.length - max);
		}
		return event;
	}

	return {
		record,
		list: () => [...events],
		clear: () => {
			events.length = 0;
		},
	};
}
