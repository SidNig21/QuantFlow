import { describe, expect, test } from "bun:test";
import { resolveCableDrop } from "./cable-drop.js";

const term = (id: string) => ({ id, type: "term" });
const note = (id: string) => ({ id, type: "note" });

describe("resolveCableDrop", () => {
	test("accepts a terminal-to-terminal drop without an existing connection", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: term("tile-b"),
			connections: [],
		})).toEqual({
			ok: true,
			reason: "ready",
			tileAId: "tile-a",
			tileBId: "tile-b",
			from: { tileId: "tile-a", side: "E" },
			to: { tileId: "tile-b", side: "W" },
		});
	});

	test("preserves explicit source and target port sides", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: term("tile-b"),
			connections: [],
			sourceSide: "S",
			targetSide: "N",
		})).toMatchObject({
			from: { tileId: "tile-a", side: "S" },
			to: { tileId: "tile-b", side: "N" },
		});
	});

	test("falls back from invalid port sides", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: term("tile-b"),
			connections: [],
			sourceSide: "Q",
			targetSide: "Z",
		})).toMatchObject({
			from: { tileId: "tile-a", side: "E" },
			to: { tileId: "tile-b", side: "W" },
		});
	});

	test("allows multiple terminal connections so cable bundles can be created", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: term("tile-b"),
			connections: [{ tileAId: "tile-b", tileBId: "tile-a" }],
		})).toMatchObject({
			ok: true,
			reason: "ready",
			tileAId: "tile-a",
			tileBId: "tile-b",
		});
	});

	test("rejects dropping on the same terminal", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: term("tile-a"),
			connections: [],
		})).toEqual({
			ok: false,
			reason: "same_tile",
			message: "Drop on a different terminal.",
		});
	});

	test("rejects empty and non-terminal targets", () => {
		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: null,
			connections: [],
		})).toEqual({
			ok: false,
			reason: "missing_target",
			message: "Drop on a terminal to connect.",
		});

		expect(resolveCableDrop({
			sourceTile: term("tile-a"),
			targetTile: note("note-a"),
			connections: [],
		})).toEqual({
			ok: false,
			reason: "missing_target",
			message: "Drop on a terminal to connect.",
		});
	});

	test("rejects non-terminal sources", () => {
		expect(resolveCableDrop({
			sourceTile: note("note-a"),
			targetTile: term("tile-a"),
			connections: [],
		})).toEqual({
			ok: false,
			reason: "invalid_source",
			message: "Drag from a terminal.",
		});
	});
});
