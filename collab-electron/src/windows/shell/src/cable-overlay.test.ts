import { describe, expect, test } from "bun:test";
import {
	clampFloatingPosition,
	formatCableContextRelay,
	formatCableLogEntry,
	getDirectedCableTiles,
	getConnectionPresentation,
	getRetryCableRelayRequest,
	shouldSubmitCableMessage,
} from "./cable-overlay.js";

describe("clampFloatingPosition", () => {
	test("keeps an in-bounds position unchanged", () => {
		expect(clampFloatingPosition(100, 80, 250, 120, 800, 600)).toEqual({
			x: 100,
			y: 80,
		});
	});

	test("clamps against the right and bottom edges", () => {
		expect(clampFloatingPosition(760, 580, 250, 120, 800, 600)).toEqual({
			x: 538,
			y: 468,
		});
	});

	test("clamps against the left and top edges", () => {
		expect(clampFloatingPosition(-40, -30, 250, 120, 800, 600)).toEqual({
			x: 12,
			y: 12,
		});
	});
});

describe("getConnectionPresentation", () => {
	const viewport = { panX: 0, panY: 0, zoom: 1 };
	const tiles = [
		{ id: "tile-a", x: 0, y: 0, width: 100, height: 100 },
		{ id: "tile-b", x: 300, y: 0, width: 100, height: 100 },
	];
	const connections = [
		{ id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
	];

	test("returns endpoint tiles and cable midpoint for a connection", () => {
		const result = getConnectionPresentation(
			"conn-ab",
			connections,
			tiles,
			viewport,
		);

		expect(result?.tileA.id).toBe("tile-a");
		expect(result?.tileB.id).toBe("tile-b");
		expect(result?.mid).toEqual({ x: 200, y: 50 });
		expect(result?.d).toBe("M 100 50 C 180 50, 220 50, 300 50");
	});

	test("returns null when the connection is missing", () => {
		expect(getConnectionPresentation("missing", connections, tiles, viewport))
			.toBeNull();
	});

	test("returns null when an endpoint tile is missing", () => {
		expect(getConnectionPresentation(
			"conn-ab",
			connections,
			tiles.slice(0, 1),
			viewport,
		)).toBeNull();
	});
});

describe("shouldSubmitCableMessage", () => {
	test("submits only deliberate modified Enter", () => {
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: true,
			metaKey: false,
		})).toBe(true);
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: false,
			metaKey: true,
		})).toBe(true);
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: false,
			metaKey: false,
		})).toBe(false);
		expect(shouldSubmitCableMessage({
			key: "a",
			ctrlKey: true,
			metaKey: false,
		})).toBe(false);
	});
});

describe("formatCableLogEntry", () => {
	test("formats sent relay entries for display", () => {
		expect(formatCableLogEntry({
			ok: true,
			fromLabel: "Worker",
			formatted: "[Worker]: done",
		})).toEqual({
			ok: true,
			label: "Worker",
			text: "[Worker]: done",
		});
	});

	test("formats failed relay entries for display", () => {
		expect(formatCableLogEntry({
			ok: false,
			errorCode: "missing_pty",
			message: "Target exited",
		})).toEqual({
			ok: false,
			label: "missing_pty",
			text: "Target exited",
		});
	});
});

describe("getDirectedCableTiles", () => {
	const tileA = { id: "tile-a" };
	const tileB = { id: "tile-b" };

	test("returns A to B by default", () => {
		expect(getDirectedCableTiles("AtoB", tileA, tileB)).toEqual({
			fromTile: tileA,
			toTile: tileB,
		});
	});

	test("returns B to A when direction is reversed", () => {
		expect(getDirectedCableTiles("BtoA", tileA, tileB)).toEqual({
			fromTile: tileB,
			toTile: tileA,
		});
	});
});

describe("getRetryCableRelayRequest", () => {
	const conn = { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" };
	const tileA = { id: "tile-a", userTitle: "Worker", ptySessionId: "session-a" };
	const tileB = { id: "tile-b", userTitle: "Reviewer", ptySessionId: "session-b" };
	const labelFor = (tile) => tile.userTitle || tile.id;

	test("builds a cable-bounded retry request from a failed entry", () => {
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "please retry",
		}, conn, tileA, tileB, labelFor)).toEqual({
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			fromLabel: "Worker",
			targetTileId: "tile-b",
			targetSessionId: "session-b",
			text: "please retry",
		});
	});

	test("rejects entries that cannot be retried on this cable", () => {
		expect(getRetryCableRelayRequest({
			ok: true,
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "sent",
		}, conn, tileA, tileB, labelFor)).toBeNull();
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: null,
			text: "missing target",
		}, conn, tileA, tileB, labelFor)).toBeNull();
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: "tile-c",
			text: "off cable",
		}, conn, tileA, tileB, labelFor)).toBeNull();
	});
});

describe("formatCableContextRelay", () => {
	test("wraps preview text for cable relay", () => {
		expect(formatCableContextRelay({ text: "## Context" })).toBe(
			"--- Shared Context ---\n## Context\n--- End Context ---",
		);
	});

	test("returns empty string for empty preview text", () => {
		expect(formatCableContextRelay({ text: "   " })).toBe("");
	});
});
