import { describe, expect, test } from "bun:test";
import {
	createDebouncedProjectionRefresh,
	DEFAULT_PROJECTION_DEBOUNCE_MS,
	REFETCH_EXACT_KINDS_BASELINE,
	REFETCH_KIND_PREFIXES,
	REFETCH_KIND_PREFIXES_BASELINE,
	REFETCH_PROJECTION_KINDS,
	REFETCH_PROJECTION_KINDS_BASELINE,
	getTargetedHandlerName,
	isTargetedProjectionKind,
	routeKernelEvent,
	shouldTriggerSnapshotRefetch,
	shouldTriggerSnapshotRefetchBaseline,
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
		onReceiptPosted: () => calls.push("onReceiptPosted"),
		onTaskEvent: () => calls.push("onTaskEvent"),
		onWorkerEvent: () => calls.push("onWorkerEvent"),
		refreshProjection: () => calls.push("refreshProjection"),
		shouldRefreshWatchtower: () => false,
		refreshWatchtower: () => calls.push("refreshWatchtower"),
		...overrides,
	};
	return { handlers, calls };
}

function createFakeTimerScheduler() {
	let now = 0;
	const timers = new Map<
		number,
		{ at: number; fn: () => void; id: ReturnType<typeof setTimeout> }
	>();
	let nextId = 1;

	function runDue() {
		for (const [id, timer] of [...timers.entries()].sort(
			(a, b) => a[1].at - b[1].at,
		)) {
			if (timer.at <= now) {
				timers.delete(id);
				timer.fn();
			}
		}
	}

	return {
		setTimeoutFn(fn: () => void, ms: number) {
			const id = nextId++ as ReturnType<typeof setTimeout>;
			timers.set(id, { at: now + ms, fn, id });
			return id;
		},
		clearTimeoutFn(id: ReturnType<typeof setTimeout>) {
			timers.delete(id);
		},
		advance(ms: number) {
			now += ms;
			runDue();
		},
	};
}

function withDebouncedRefresh(handlers: Record<string, unknown>) {
	const fake = createFakeTimerScheduler();
	const debounced = createDebouncedProjectionRefresh(
		() => {
			(handlers.refreshProjection as () => void)?.();
		},
		{
			delayMs: DEFAULT_PROJECTION_DEBOUNCE_MS,
			setTimeoutFn: fake.setTimeoutFn,
			clearTimeoutFn: fake.clearTimeoutFn,
		},
	);
	return {
		handlers: {
			...handlers,
			refreshProjection: () => debounced.schedule(),
		},
		fake,
	};
}

describe("shouldTriggerSnapshotRefetchBaseline (PF0 frozen)", () => {
	test("baseline prefix kinds trigger refetch", () => {
		for (const prefix of REFETCH_KIND_PREFIXES_BASELINE) {
			expect(shouldTriggerSnapshotRefetchBaseline(`${prefix}example`)).toBe(
				true,
			);
		}
	});

	test("baseline exact kinds trigger refetch", () => {
		for (const kind of REFETCH_EXACT_KINDS_BASELINE) {
			expect(shouldTriggerSnapshotRefetchBaseline(kind)).toBe(true);
		}
	});

	test("baseline projection kinds trigger refetch", () => {
		for (const kind of REFETCH_PROJECTION_KINDS_BASELINE) {
			expect(shouldTriggerSnapshotRefetchBaseline(kind)).toBe(true);
		}
	});
});

describe("shouldTriggerSnapshotRefetch (PF1)", () => {
	test("debounced prefix kinds trigger refetch", () => {
		for (const prefix of REFETCH_KIND_PREFIXES) {
			expect(shouldTriggerSnapshotRefetch(`${prefix}example`)).toBe(true);
		}
	});

	test("task prefix no longer triggers full refetch", () => {
		expect(shouldTriggerSnapshotRefetch("task.updated")).toBe(false);
	});

	test("receipt.posted no longer triggers full refetch", () => {
		expect(shouldTriggerSnapshotRefetch("receipt.posted")).toBe(false);
	});

	test("worker projection kinds no longer trigger full refetch", () => {
		for (const kind of [
			"worker.spawned",
			"worker.status_updated",
			"worker.stopped",
		]) {
			expect(shouldTriggerSnapshotRefetch(kind)).toBe(false);
		}
	});

	test("remaining projection kinds trigger refetch", () => {
		for (const kind of REFETCH_PROJECTION_KINDS) {
			expect(shouldTriggerSnapshotRefetch(kind)).toBe(true);
		}
	});

	test("unrelated kinds do not trigger refetch", () => {
		expect(shouldTriggerSnapshotRefetch("state_card.updated")).toBe(false);
		expect(shouldTriggerSnapshotRefetch("canvas.unknown")).toBe(false);
	});
});

describe("targeted projection kinds", () => {
	test("isTargetedProjectionKind covers receipt, task, worker", () => {
		expect(isTargetedProjectionKind("receipt.posted")).toBe(true);
		expect(isTargetedProjectionKind("task.claimed")).toBe(true);
		expect(isTargetedProjectionKind("worker.spawned")).toBe(true);
		expect(isTargetedProjectionKind("tile.moved")).toBe(false);
	});

	test("getTargetedHandlerName maps to injected handlers", () => {
		expect(getTargetedHandlerName("receipt.posted")).toBe("onReceiptPosted");
		expect(getTargetedHandlerName("task.started")).toBe("onTaskEvent");
		expect(getTargetedHandlerName("worker.stopped")).toBe("onWorkerEvent");
		expect(getTargetedHandlerName("tile.moved")).toBeNull();
	});
});

describe("createDebouncedProjectionRefresh", () => {
	test("coalesces burst within delay window", () => {
		const fake = createFakeTimerScheduler();
		let count = 0;
		const debounced = createDebouncedProjectionRefresh(
			() => {
				count += 1;
			},
			{
				delayMs: DEFAULT_PROJECTION_DEBOUNCE_MS,
				setTimeoutFn: fake.setTimeoutFn,
				clearTimeoutFn: fake.clearTimeoutFn,
			},
		);

		debounced.schedule();
		debounced.schedule();
		debounced.schedule();
		expect(count).toBe(0);

		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(count).toBe(1);
	});

	test("flush runs pending refresh immediately", () => {
		let count = 0;
		const debounced = createDebouncedProjectionRefresh(() => {
			count += 1;
		});
		debounced.schedule();
		expect(count).toBe(0);
		debounced.flush();
		expect(count).toBe(1);
	});
});

describe("routeKernelEvent kind dispatch", () => {
	test("tile.moved calls onTileMoved when tile resolves", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{ kind: "tile.moved", tileId: "tile-1", data: { x: 1, y: 2 } },
			routed,
		);
		expect(calls).toEqual(["onTileMoved"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["onTileMoved", "refreshProjection"]);
	});

	test("tile.moved skips handler when tile is missing", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{ kind: "tile.moved", tileId: "missing", data: { x: 1, y: 2 } },
			routed,
		);
		expect(calls).toEqual([]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("tile.resized calls onTileResized when tile resolves", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{ kind: "tile.resized", tileId: "tile-1", data: { width: 10, height: 20 } },
			routed,
		);
		expect(calls).toEqual(["onTileResized"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["onTileResized", "refreshProjection"]);
	});

	test("tile.removed calls onTileRemoved", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent({ kind: "tile.removed", tileId: "tile-1" }, routed);
		expect(calls).toEqual(["onTileRemoved"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["onTileRemoved", "refreshProjection"]);
	});

	test("tile.created calls onTileCreated", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent({ kind: "tile.created", tileId: "tile-1" }, routed);
		expect(calls).toEqual(["onTileCreated"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["onTileCreated", "refreshProjection"]);
	});

	test("connection.created calls onConnectionCreated when data.id is set", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{
				kind: "connection.created",
				data: { id: "conn-1", tileAId: "a", tileBId: "b" },
			},
			routed,
		);
		expect(calls).toEqual(["onConnectionCreated"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["onConnectionCreated", "refreshProjection"]);
	});

	test("connection.created skips handler without data.id", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent({ kind: "connection.created", data: {} }, routed);
		expect(calls).toEqual([]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("connection.deleted calls onConnectionDeleted when data.id is set", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{ kind: "connection.deleted", data: { id: "conn-1" } },
			routed,
		);
		expect(calls).toEqual(["onConnectionDeleted"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
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
	test("task prefix triggers onTaskEvent not refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "task.updated" }, handlers);
		expect(calls).toEqual(["onTaskEvent"]);
	});

	test("receipt.posted triggers onReceiptPosted not refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "receipt.posted" }, handlers);
		expect(calls).toEqual(["onReceiptPosted"]);
	});

	test("worker kind triggers onWorkerEvent not refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "worker.spawned" }, handlers);
		expect(calls).toEqual(["onWorkerEvent"]);
	});

	test("projection kind schedules debounced refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent({ kind: "artifact.created" }, routed);
		expect(calls).toEqual([]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
		expect(calls).toEqual(["refreshProjection"]);
	});

	test("unrelated kind does not trigger refreshProjection", () => {
		const { handlers, calls } = createStubHandlers();
		routeKernelEvent({ kind: "canvas.unknown" }, handlers);
		expect(calls).toEqual([]);
	});
});

describe("routeKernelEvent handler order", () => {
	test("explicit handler runs before debounced refreshProjection for tile.moved", () => {
		const order: string[] = [];
		const { handlers } = createStubHandlers({
			onTileMoved: () => order.push("onTileMoved"),
			refreshProjection: () => order.push("refreshProjection"),
		});
		const { handlers: routed, fake } = withDebouncedRefresh(handlers);

		routeKernelEvent(
			{ kind: "tile.moved", tileId: "tile-1", data: { x: 0, y: 0 } },
			routed,
		);
		expect(order).toEqual(["onTileMoved"]);
		fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);
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
