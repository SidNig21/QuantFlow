/**
 * NON-CANONICAL renderer-side event logs (Stage E1).
 * operationalEvents + kernelEventLog feed Watchtower UI only — never drive
 * canvas cache or projection. Canonical facts arrive via kernelApi.onEvent only.
 */

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

const KERNEL_EVENT_EXACT_KINDS = new Set([
	"artifact.created",
	"checkpoint.awaiting-selection",
	"connection.created",
	"connection.deleted",
	"human_decision",
	"evaluation.created",
	"receipt.posted",
	"tile.created",
	"tile.removed",
	"tile.status",
	"tile.status_updated",
	"verification_started",
	"verification_completed",
	"verification_failed",
]);

function nonBlank(...values) {
	for (const value of values) {
		const text = String(value ?? "").trim();
		if (text) return text;
	}
	return "";
}

export function isWatchtowerKernelEventKind(kind) {
	const value = String(kind ?? "").trim();
	return KERNEL_EVENT_EXACT_KINDS.has(value) ||
		value.startsWith("task.") ||
		value.startsWith("worker.") ||
		value.startsWith("workflow.") ||
		value.startsWith("verification_");
}

function kernelEventSeverity(kind, data) {
	const text = String(kind ?? "");
	if (data?.ok === false || /(?:failed|error|rejected)$/i.test(text)) return "error";
	if (/(?:awaiting|waiting|blocked|warn)/i.test(text)) return "warn";
	return "info";
}

function kernelEventMeta(payload, data) {
	const meta = {
		correlationId: nonBlank(payload?.correlationId, data?.correlationId) || null,
		taskId: nonBlank(payload?.taskId, data?.taskId) || null,
		workflowId: nonBlank(payload?.workflowId, data?.workflowId) || null,
		artifactId: nonBlank(payload?.artifactId, data?.artifactId) || null,
		checkpointId: nonBlank(payload?.checkpointId, data?.checkpointId) || null,
		proposalToken: nonBlank(payload?.proposalToken, data?.proposalToken) || null,
		tileId: nonBlank(payload?.tileId, data?.tileId) || null,
	};
	return Object.fromEntries(
		Object.entries(meta).filter(([, value]) => value !== null),
	);
}

function kernelEventSummary(kind, meta, data) {
	const explicit = nonBlank(data?.summary, data?.message, data?.status);
	if (explicit) return explicit;
	const ids = [
		meta.taskId ? `task ${meta.taskId}` : null,
		meta.workflowId ? `workflow ${meta.workflowId}` : null,
		meta.artifactId ? `artifact ${meta.artifactId}` : null,
		meta.checkpointId ? `checkpoint ${meta.checkpointId}` : null,
		meta.tileId ? `tile ${meta.tileId}` : null,
	].filter(Boolean);
	return ids.length ? `${kind} / ${ids.join(" / ")}` : kind;
}

export function kernelEventToWatchtowerEvent(payload = {}, now = Date.now()) {
	const kind = String(payload?.kind ?? "").trim();
	if (!isWatchtowerKernelEventKind(kind)) return null;
	const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
	const meta = kernelEventMeta(payload, data);
	return normalizeOperationalEvent({
		id: nonBlank(payload?.id, data?.id) || undefined,
		type: kind,
		severity: kernelEventSeverity(kind, data),
		timestamp: Number.isFinite(payload?.timestamp) ? payload.timestamp : now,
		summary: kernelEventSummary(kind, meta, data),
		meta,
	}, now);
}

export function createKernelEventLog({ limit = 120, now = Date.now } = {}) {
	const max = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 120);
	const events = [];

	function record(payload) {
		const event = kernelEventToWatchtowerEvent(payload, now());
		if (!event) return null;
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
