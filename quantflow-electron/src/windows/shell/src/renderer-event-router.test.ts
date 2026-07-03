import { describe, expect, test } from "bun:test";
import {
	REFETCH_EXACT_KINDS,
	REFETCH_KIND_PREFIXES,
	REFETCH_PROJECTION_KINDS,
	routeKernelEvent,
	shouldTriggerSnapshotRefetch,
} from "./renderer-event-router.js";

function createStubHandlers(overrides: Record<string, unknown> = {}) {
	const calls: string[] = [];
	const handlers: Record<string, unknown> = {
		recordEvent: () => ({ id: "wt-1" }),
		resolveTile: (tileId: string) =>
			tileId === "tile-1" ? { id: "tile-1" } : null,
		onTileMoved: () => calls.push("onTileMoved"),
		onTileResized: () => calls.push("onTileResized"),
		onTileRemoved: () => calls.push("onTileRemoved"),
		onTileCreated: () => calls.push("onTileCreated"),
		onConnectionCreated: () => calls.push("onConnectionCreated"),
		onConnectionDeleted: () => calls.push("onConnectionDeleted"),
		onStateCardUpdated: () => calls.push("onStateCardUpdated"),
		refreshProjection: () => calls.push("refreshProjection"),
		shouldRefreshWatchtower: () => false,
		refreshWatchtower: () => calls.push("refreshWatchtower"),
		...overrides,
	};
	return { handlers, calls };
}

describe("shouldTriggerSnapshotRefetch", () => {
	test("prefix kinds trigger refetch", () => {
		for (const prefix of REFETCH_KIND_PREFIXES) {
			expect(shouldTriggerSnapshotRefetch(`${prefix}example`)).toBe(true);
		}
	});

	test("exact kinds trigger refetch", () => {
		for (const kind of REFETCH_EXACT_KINDS) {
			expect(shouldTriggerSnapshotRefetch(kind)).toBe(true);
		}
	});

	test("projection kinds trigger refetch", () => {
		for (const kind of REFETCH_PROJECTION_KINDS) {
			expect(shouldTriggerSnapshotRefetch(kind)).toBe(true);
		}
	});

	test("unrelated kinds do not trigger refetch", () => {
		expect(shouldTriggerSnapshotRefetch("state_card.updated")).toBe(false);
		expect(shouldTriggerSnapshotRefetch("canvas.unknown")).toBe(false);
	});
});

describe("routeKernelEvent kind dispatch", () => {
	test("tile.moved calls onTileMoved when tile resolves", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{ kind: "tile.moved", tileId: "tile-1", data: { x: 1, y: 2 } },
			handlers,
		);
		expect(calls).toEqual(["onTileMoved", "refreshProjection"]);
	});

	test("tile.moved skips handler when tile is missing", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{ kind: "tile.moved", tileId: "missing", data: { x: 1, y: 2 } },
			handlers,
		);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("tile.resized calls onTileResized when tile resolves", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{ kind: "tile.resized", tileId: "tile-1", data: { width: 10, height: 20 } },
			handlers,
		);
		expect(calls).toEqual(["onTileResized", "refreshProjection"]);
	});

	test("tile.removed calls onTileRemoved", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "tile.removed", tileId: "tile-1" }, handlers);
		expect(calls).toEqual(["onTileRemoved", "refreshProjection"]);
	});

	test("tile.created calls onTileCreated", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "tile.created", tileId: "tile-1" }, handlers);
		expect(calls).toEqual(["onTileCreated", "refreshProjection"]);
	});

	test("connection.created calls onConnectionCreated when data.id is set", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{
				kind: "connection.created",
				data: { id: "conn-1", tileAId: "a", tileBId: "b" },
			},
			handlers,
		);
		expect(calls).toEqual(["onConnectionCreated", "refreshProjection"]);
	});

	test("connection.created skips handler without data.id", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "connection.created", data: {} }, handlers);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("connection.deleted calls onConnectionDeleted when data.id is set", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{ kind: "connection.deleted", data: { id: "conn-1" } },
			handlers,
		);
		expect(calls).toEqual(["onConnectionDeleted", "refreshProjection"]);
	});

	test("state_card.updated calls onStateCardUpdated but not refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent(
			{ kind: "state_card.updated", tileId: "tile-1" },
			handlers,
		);
		expect(calls).toEqual(["onStateCardUpdated"]);
	});

	test("state_card.updated skips handler without tileId", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "state_card.updated" }, handlers);
		expect(calls).toEqual([]);
	});
});

describe("routeKernelEvent refreshProjection policy", () => {
	test("prefix kind triggers refreshProjection without explicit handler", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "task.updated" }, handlers);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("exact kind triggers refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "receipt.posted" }, handlers);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("projection kind triggers refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "worker.spawned" }, handlers);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("unrelated kind does not trigger refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "canvas.unknown" }, handlers);
		expect(calls).toEqual([]);
	});
});

describe("routeKernelEvent handler order", () => {
	test("explicit handler runs before refreshProjection for tile.moved", () => {
		const order: string[] = [];
		const { handlers } = createStubHandlers({
			onTileMoved: () => order.push("onTileMoved"),
			refreshProjection: () => order.push("refreshProjection"),
		});
		routeKernelEvent(
			{ kind: "tile.moved", tileId: "tile-1", data: { x: 0, y: 0 } },
			handlers,
		);
		expect(order).toEqual(["onTileMoved", "refreshProjection"]);
	});
});

describe("routeKernelEvent watchtower feed", () => {
	test("refreshWatchtower fires when shouldRefreshWatchtower returns true", () => {
		const { handlers, calls } = createStubHandlers({
			shouldRefreshWatchtower: (event) => Boolean(event),
		});
		routeKernelEvent({ kind: "canvas.unknown" }, handlers);
		expect(calls).toEqual(["refreshWatchtower"]);
	});

	test("refreshWatchtower skipped when shouldRefreshWatchtower returns false", () => {
		const { handlers, calls } = createStubHandlers({
			recordEvent: () => null,
			shouldRefreshWatchtower: (event) => Boolean(event),
		});
		routeKernelEvent({ kind: "canvas.unknown" }, handlers);
		expect(calls).toEqual([]);
	});
});
