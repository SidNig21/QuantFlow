/**
 * Kernel event routing for the shell renderer (extracted from renderer.js).
 * Owns per-kind dispatch, snapshot-refetch trigger policy, and watchtower feed
 * decisions. DOM work stays in renderer.js via injected handlers.
 *
 * Refetch policy mirrors qa/lib/refetch-policy.ts (do not import across packages).
 */

/** PF0 baseline — frozen for perf-baseline B4 capture (do not change). */
export const REFETCH_PROJECTION_KINDS_BASELINE = [
	"artifact.created",
	"checkpoint.awaiting-selection",
	"human_decision",
	"evaluation.created",
	"conductor.plan_posted",
	"worker.spawned",
	"worker.status_updated",
	"worker.stopped",
];

export const REFETCH_KIND_PREFIXES_BASELINE = [
	"tile.",
	"task.",
	"connection.",
	"workflow.",
];

export const REFETCH_EXACT_KINDS_BASELINE = ["receipt.posted"];

/** PF1 — debounced full refresh kinds (targeted kinds excluded). */
export const REFETCH_PROJECTION_KINDS = [
	"artifact.created",
	"checkpoint.awaiting-selection",
	"human_decision",
	"evaluation.created",
	"conductor.plan_posted",
];

export const REFETCH_KIND_PREFIXES = [
	"tile.",
	"connection.",
	"workflow.",
];

export const REFETCH_EXACT_KINDS = [];

export const TARGETED_RECEIPT_KIND = "receipt.posted";
export const TARGETED_KIND_PREFIXES = ["task.", "worker."];

export const DEFAULT_PROJECTION_DEBOUNCE_MS = 50;

const REFETCH_PROJECTION_KIND_SET_BASELINE = new Set(REFETCH_PROJECTION_KINDS_BASELINE);
const REFETCH_PROJECTION_KIND_SET = new Set(REFETCH_PROJECTION_KINDS);

/**
 * Returns true when the pre-PF1 renderer would call refreshWorkflowProjection.
 * @param {string} kind
 */
export function shouldTriggerSnapshotRefetchBaseline(kind) {
	if (REFETCH_EXACT_KINDS_BASELINE.includes(kind)) return true;
	if (REFETCH_PROJECTION_KIND_SET_BASELINE.has(kind)) return true;
	for (const prefix of REFETCH_KIND_PREFIXES_BASELINE) {
		if (kind.startsWith(prefix)) return true;
	}
	return false;
}

/**
 * Returns true when the PF1 renderer schedules a debounced full projection refresh.
 * @param {string} kind
 */
export function shouldTriggerSnapshotRefetch(kind) {
	if (REFETCH_EXACT_KINDS.includes(kind)) return true;
	if (REFETCH_PROJECTION_KIND_SET.has(kind)) return true;
	for (const prefix of REFETCH_KIND_PREFIXES) {
		if (kind.startsWith(prefix)) return true;
	}
	return false;
}

/**
 * Targeted kinds use injected handlers instead of snapshot refetch.
 * @param {string} kind
 */
export function isTargetedProjectionKind(kind) {
	if (kind === TARGETED_RECEIPT_KIND) return true;
	for (const prefix of TARGETED_KIND_PREFIXES) {
		if (kind.startsWith(prefix)) return true;
	}
	return false;
}

/**
 * @param {string} kind
 * @returns {"onReceiptPosted"|"onTaskEvent"|"onWorkerEvent"|null}
 */
export function getTargetedHandlerName(kind) {
	if (kind === TARGETED_RECEIPT_KIND) return "onReceiptPosted";
	if (kind.startsWith("task.")) return "onTaskEvent";
	if (kind.startsWith("worker.")) return "onWorkerEvent";
	return null;
}

/**
 * Trailing-edge debouncer for full projection refresh (injectable for tests).
 *
 * @param {() => void} refreshFn
 * @param {object} [options]
 * @param {number} [options.delayMs]
 * @param {typeof setTimeout} [options.setTimeoutFn]
 * @param {typeof clearTimeout} [options.clearTimeoutFn]
 */
export function createDebouncedProjectionRefresh(
	refreshFn,
	{
		delayMs = DEFAULT_PROJECTION_DEBOUNCE_MS,
		setTimeoutFn = setTimeout,
		clearTimeoutFn = clearTimeout,
	} = {},
) {
	let timerId = null;

	function cancel() {
		if (timerId !== null) {
			clearTimeoutFn(timerId);
			timerId = null;
		}
	}

	return {
		schedule() {
			cancel();
			timerId = setTimeoutFn(() => {
				timerId = null;
				refreshFn();
			}, delayMs);
		},
		flush() {
			if (timerId === null) return;
			cancel();
			refreshFn();
		},
		cancel,
		pending: () => timerId !== null,
	};
}

/**
 * Per-kind dispatch table: kind → guard predicate before calling the handler.
 * Guards mirror the original renderer.js if-else chain (behavior-preserving).
 */
const KIND_DISPATCH = [
	{
		kind: "tile.moved",
		guard: ({ tile }) => Boolean(tile),
		handler: "onTileMoved",
	},
	{
		kind: "tile.resized",
		guard: ({ tile }) => Boolean(tile),
		handler: "onTileResized",
	},
	{
		kind: "tile.removed",
		guard: () => true,
		handler: "onTileRemoved",
	},
	{
		kind: "tile.created",
		guard: () => true,
		handler: "onTileCreated",
	},
	{
		kind: "connection.created",
		guard: ({ data }) => Boolean(data.id),
		handler: "onConnectionCreated",
	},
	{
		kind: "connection.deleted",
		guard: ({ data }) => Boolean(data.id),
		handler: "onConnectionDeleted",
	},
	{
		kind: "state_card.updated",
		guard: ({ payload }) => Boolean(payload.tileId),
		handler: "onStateCardUpdated",
	},
];

/**
 * Route a Kernel event payload to injected handlers.
 *
 * @param {object} payload - Kernel event payload
 * @param {object} handlers
 * @param {(payload: object) => object|null} handlers.recordEvent
 * @param {(tileId: string) => object|null} handlers.resolveTile
 * @param {(ctx: object) => void} [handlers.onTileMoved]
 * @param {(ctx: object) => void} [handlers.onTileResized]
 * @param {(ctx: object) => void} [handlers.onTileRemoved]
 * @param {(ctx: object) => void} [handlers.onTileCreated]
 * @param {(ctx: object) => void} [handlers.onConnectionCreated]
 * @param {(ctx: object) => void} [handlers.onConnectionDeleted]
 * @param {(ctx: object) => void} [handlers.onStateCardUpdated]
 * @param {(ctx: object) => void} [handlers.onReceiptPosted]
 * @param {(ctx: object) => void} [handlers.onTaskEvent]
 * @param {(ctx: object) => void} [handlers.onWorkerEvent]
 * @param {() => void} [handlers.refreshProjection] - debounced full refresh scheduler
 * @param {(watchtowerEvent: object|null) => boolean} [handlers.shouldRefreshWatchtower]
 * @param {() => void} [handlers.refreshWatchtower]
 */
export function routeKernelEvent(payload, handlers) {
	const data = payload.data ?? {};
	const watchtowerEvent = handlers.recordEvent(payload);
	const tile = payload.tileId
		? handlers.resolveTile(payload.tileId)
		: null;

	const ctx = { payload, data, tile, tileId: payload.tileId };

	for (const entry of KIND_DISPATCH) {
		if (payload.kind !== entry.kind) continue;
		if (!entry.guard(ctx)) break;
		handlers[entry.handler]?.(ctx);
		break;
	}

	const kind = String(payload.kind ?? "");
	const targetedHandler = getTargetedHandlerName(kind);
	if (targetedHandler) {
		handlers[targetedHandler]?.(ctx);
	} else if (shouldTriggerSnapshotRefetch(kind)) {
		handlers.refreshProjection?.();
	}

	if (handlers.shouldRefreshWatchtower?.(watchtowerEvent)) {
		handlers.refreshWatchtower?.();
	}
}
