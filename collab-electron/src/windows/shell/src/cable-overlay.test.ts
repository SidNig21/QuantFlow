import { describe, expect, test } from "bun:test";
import {
	clampFloatingPosition,
	formatCableContextRelay,
	formatCableLabel,
	getCableDefaultDirection,
	formatCableLogDetail,
	formatCableLogEntry,
	formatCableEndpointSummary,
	formatCableRelayFailure,
	getCableSendBlockMessage,
	getDirectedCableTiles,
	getCableEndpointStatus,
	getCableLabelLayout,
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

describe("formatCableLabel", () => {
	test("normalizes and truncates cable labels", () => {
		expect(formatCableLabel("  review   loop  ")).toBe("review loop");
		expect(formatCableLabel("abcdefghijklmnopqrstuvwxyz", 8)).toBe("abcdefg…");
	});
});

describe("getCableLabelLayout", () => {
	test("centers readable labels near the cable midpoint", () => {
		const layout = getCableLabelLayout(
			"review",
			{ x: 200, y: 80 },
			800,
			600,
		);

		expect(layout.text).toBe("review");
		expect(layout.textX).toBeCloseTo(200, 1);
		expect(layout.y).toBe(56);
		expect(layout.height).toBe(18);
	});

	test("keeps labels inside the canvas viewport", () => {
		const layout = getCableLabelLayout(
			"a very long cable label near the edge",
			{ x: 2, y: 4 },
			240,
			160,
		);

		expect(layout.text).toBe("a very long cable label nea…");
		expect(layout.x).toBe(6);
		expect(layout.y).toBe(6);
		expect(layout.x + layout.width).toBeLessThanOrEqual(234);
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
			targetTileId: "tile-b",
			routeMethod: "manual",
			formatted: "[Worker]: done",
		})).toEqual({
			ok: true,
			label: "Worker",
			text: "[Worker]: done",
			detail: "manual / Worker -> tile-b",
		});
	});

	test("formats failed relay entries for display", () => {
		expect(formatCableLogEntry({
			ok: false,
			errorCode: "missing_pty",
			fromLabel: "Worker",
			targetLabel: "Reviewer",
			routeMethod: "agent",
			message: "Target exited",
		})).toEqual({
			ok: false,
			label: "missing_pty",
			text: "Target exited",
			detail: "agent / Worker -> @Reviewer / missing_pty",
		});
	});
});

describe("formatCableLogDetail", () => {
	test("falls back when route fields are missing", () => {
		expect(formatCableLogDetail({
			ok: false,
			errorCode: "no_route",
		})).toBe("manual / unknown -> unresolved / no_route");
	});
});

describe("getCableEndpointStatus", () => {
	test("marks attached terminal endpoints as sendable", () => {
		expect(getCableEndpointStatus({
			id: "tile-a",
			ptySessionId: "session-a",
		})).toEqual({
			label: "ready",
			tone: "ok",
			sendable: true,
		});
	});

	test("surfaces missing and errored PTYs", () => {
		expect(getCableEndpointStatus({ id: "tile-a" })).toEqual({
			label: "no PTY",
			tone: "error",
			sendable: false,
			message: "No active PTY session is attached.",
		});

		expect(getCableEndpointStatus({
			id: "tile-b",
			ptySessionId: "session-b",
			ptyStatus: "error",
			ptyError: "spawn ENOENT",
		})).toEqual({
			label: "error",
			tone: "error",
			sendable: false,
			message: "spawn ENOENT",
		});
	});
});

describe("formatCableEndpointSummary", () => {
	test("includes route handles and status for inspector rows", () => {
		expect(formatCableEndpointSummary({
			id: "tile-a",
			routeHandle: "worker-a",
			ptySessionId: "session-a",
			ptyStatus: "running",
		}, "From")).toEqual({
			label: "From @worker-a",
			status: "running",
			tone: "ok",
			message: "",
			sendable: true,
		});
	});
});

describe("formatCableRelayFailure", () => {
	test("adds target health to failed relay messages", () => {
		expect(formatCableRelayFailure(
			{ ok: false, message: "Target session is not active." },
			{ id: "tile-b" },
		)).toBe(
			"Target session is not active. Target status: No active PTY session is attached.",
		);
	});

	test("keeps the structured relay message when target is healthy", () => {
		expect(formatCableRelayFailure(
			{ ok: false, message: "No route." },
			{ id: "tile-b", ptySessionId: "session-b" },
		)).toBe("No route.");
	});
});

describe("getCableSendBlockMessage", () => {
	test("returns null for sendable terminal endpoints", () => {
		expect(getCableSendBlockMessage({
			id: "tile-b",
			userTitle: "Reviewer",
			ptySessionId: "session-b",
		}, (tile) => tile.userTitle)).toBeNull();
	});

	test("explains why the inspector should block sends to unhealthy endpoints", () => {
		expect(getCableSendBlockMessage({
			id: "tile-b",
			userTitle: "Reviewer",
			ptyStatus: "exited",
		}, (tile) => tile.userTitle)).toBe(
			"Reviewer cannot receive yet. Terminal session has exited.",
		);

		expect(getCableSendBlockMessage(null)).toBe(
			"Target cannot receive yet. No active PTY session.",
		);
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

describe("getCableDefaultDirection", () => {
	const viewport = { panX: 0, panY: 0, zoom: 1 };
	const tileA = { id: "tile-a", x: 0, y: 0, width: 100, height: 100 };
	const tileB = { id: "tile-b", x: 300, y: 0, width: 100, height: 100 };

	test("uses the focused endpoint as the source", () => {
		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			focusedTileId: "tile-b",
			pointerX: 80,
			pointerY: 50,
		})).toBe("BtoA");

		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			focusedTileId: "tile-a",
			pointerX: 350,
			pointerY: 50,
		})).toBe("AtoB");
	});

	test("falls back to the endpoint nearest the click", () => {
		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			pointerX: 340,
			pointerY: 50,
		})).toBe("BtoA");

		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			pointerX: 60,
			pointerY: 50,
		})).toBe("AtoB");
	});

	test("defaults to A to B without usable focus or pointer data", () => {
		expect(getCableDefaultDirection({ tileA, tileB }))
			.toBe("AtoB");
		expect(getCableDefaultDirection()).toBe("AtoB");
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
