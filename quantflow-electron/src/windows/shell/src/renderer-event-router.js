/**
 * Kernel event routing for the shell renderer (extracted from renderer.js).
 * Owns per-kind dispatch, snapshot-refetch trigger policy, and watchtower feed
 * decisions. DOM work stays in renderer.js via injected handlers.
 *
 * Refetch policy mirrors qa/lib/refetch-policy.ts (do not import across packages).
 */

/** Explicit kinds that trigger refreshWorkflowProjection (not prefix-matched). */
export const REFETCH_PROJECTION_KINDS = [
	"artifact.created",
	"checkpoint.awaiting-selection",
	"human_decision",
	"evaluation.created",
	"conductor.plan_posted",
	"worker.spawned",
	"worker.status_updated",
	"worker.stopped",
];

/** Prefixes where any matching kind triggers refreshWorkflowProjection. */
export const REFETCH_KIND_PREFIXES = [
	"tile.",
	"task.",
	"connection.",
	"workflow.",
];

/** Exact kind match (in addition to prefixes and projection kinds). */
export const REFETCH_EXACT_KINDS = ["receipt.posted"];

const REFETCH_PROJECTION_KIND_SET = new Set(REFETCH_PROJECTION_KINDS);

/**
 * Returns true when the renderer would call refreshWorkflowProjection for this event kind.
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
 * @param {() => void} [handlers.refreshProjection]
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
	if (shouldTriggerSnapshotRefetch(kind)) {
		handlers.refreshProjection?.();
	}

	if (handlers.shouldRefreshWatchtower?.(watchtowerEvent)) {
		handlers.refreshWatchtower?.();
	}
}
