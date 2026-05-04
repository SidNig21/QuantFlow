import { describe, test, expect } from "bun:test";
import {
	createConnectionFailureEvent,
	createConnectionLabelEvent,
	createConnectionMutationEvent,
	findAutoPlacement,
	validateRpcConnectionCreate,
} from "./canvas-rpc.js";

interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
}

describe("findAutoPlacement", () => {
  test("places first tile at origin with no existing tiles", () => {
    const pos = findAutoPlacement([], 400, 500);
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  test("avoids overlapping an existing tile", () => {
    const existing: Tile[] = [
      { x: 0, y: 0, width: 400, height: 500 },
    ];
    const pos = findAutoPlacement(existing, 400, 500);
    // Should not overlap the existing tile
    const overlaps =
      pos.x < 400 && pos.x + 400 > 0 &&
      pos.y < 500 && pos.y + 500 > 0;
    expect(overlaps).toBe(false);
  });

  test("places tile adjacent to existing tile", () => {
    const existing: Tile[] = [
      { x: 0, y: 0, width: 400, height: 500 },
    ];
    const pos = findAutoPlacement(existing, 200, 200);
    // Should find a spot — first available is at x=400, y=0
    // (or x=0, y=0 if it fits, but it overlaps)
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  test("result snaps to 20px grid", () => {
    const existing: Tile[] = [
      { x: 0, y: 0, width: 100, height: 100 },
    ];
    const pos = findAutoPlacement(existing, 100, 100);
    expect(pos.x % 20).toBe(0);
    expect(pos.y % 20).toBe(0);
  });

  test("handles many tiles without overlapping any", () => {
    const existing: Tile[] = [];
    // Place tiles in a row
    for (let i = 0; i < 5; i++) {
      existing.push({
        x: i * 200, y: 0, width: 200, height: 200,
      });
    }
    const pos = findAutoPlacement(existing, 200, 200);
    // Should not overlap any existing tile
    for (const tile of existing) {
      const overlaps =
        pos.x < tile.x + tile.width &&
        pos.x + 200 > tile.x &&
        pos.y < tile.y + tile.height &&
        pos.y + 200 > tile.y;
      expect(overlaps).toBe(false);
    }
  });

  test("falls back to offset from last tile when canvas is full", () => {
    // Fill the canvas area with one giant tile
    const existing: Tile[] = [
      { x: 0, y: 0, width: 4000, height: 3000 },
    ];
    const pos = findAutoPlacement(existing, 400, 500);
    expect(pos).toEqual({ x: 40, y: 40 });
  });

  test("fallback with no tiles returns {40, 40}", () => {
    // Edge case: canvas "full" but no tiles at all shouldn't happen,
    // but if tiles is empty and no spot found, returns {40, 40}
    // Actually with empty tiles, first spot at (0,0) always works
    // So test the last-tile fallback explicitly
    const existing: Tile[] = [
      { x: 0, y: 0, width: 4000, height: 3000 },
    ];
    const pos = findAutoPlacement(existing, 100, 100);
    // Giant tile covers canvas, so fallback: last.x+40, last.y+40
    expect(pos).toEqual({ x: 40, y: 40 });
  });
});

describe("createConnectionMutationEvent", () => {
  test("formats RPC-created connection events for Watchtower", () => {
    const event = createConnectionMutationEvent(
      "created",
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
      { id: "tile-a", userTitle: "Worker" },
      { id: "tile-b", userTitle: "Reviewer" },
    );

    expect(event).toEqual({
      type: "connection.created",
      severity: "info",
      summary: "Worker connected to Reviewer",
      meta: {
        connectionId: "conn-1",
        tileAId: "tile-a",
        tileBId: "tile-b",
        source: "canvas-rpc",
      },
    });
  });

  test("formats RPC-removed connection events with fallback labels", () => {
    const event = createConnectionMutationEvent(
      "removed",
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
      { id: "tile-a" },
      null,
    );

    expect(event).toMatchObject({
      type: "connection.removed",
      summary: "tile-a disconnected from unknown",
      meta: {
        connectionId: "conn-1",
        source: "canvas-rpc",
      },
    });
  });
});

describe("createConnectionFailureEvent", () => {
  test("formats rejected RPC connection attempts for Watchtower", () => {
    const event = createConnectionFailureEvent(
      "Connection already exists.",
      { tileAId: "tile-a", tileBId: "tile-b" },
      { id: "tile-a", userTitle: "Worker" },
      { id: "tile-b", userTitle: "Reviewer" },
    );

    expect(event).toEqual({
      type: "connection.failed",
      severity: "warn",
      summary: "Connection failed: Connection already exists.",
      detail: "Worker -> Reviewer",
      meta: {
        tileAId: "tile-a",
        tileBId: "tile-b",
        source: "canvas-rpc",
      },
    });
  });

  test("formats missing connection failures without fake tile endpoints", () => {
    expect(createConnectionFailureEvent(
      "Connection not found.",
      { connectionId: "conn-missing" },
    )).toEqual({
      type: "connection.failed",
      severity: "warn",
      summary: "Connection failed: Connection not found.",
      detail: "unknown -> unknown",
      meta: {
        connectionId: "conn-missing",
        source: "canvas-rpc",
      },
    });
  });
});

describe("createConnectionLabelEvent", () => {
  test("formats RPC label update events for Watchtower", () => {
    expect(createConnectionLabelEvent(
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b", label: "handoff" },
      { id: "tile-a", userTitle: "Worker" },
      { id: "tile-b", userTitle: "Reviewer" },
    )).toEqual({
      type: "connection.updated",
      severity: "info",
      summary: "Worker -> Reviewer cable renamed: handoff",
      meta: {
        connectionId: "conn-1",
        tileAId: "tile-a",
        tileBId: "tile-b",
        source: "canvas-rpc",
      },
    });
  });

  test("formats RPC label clear events", () => {
    expect(createConnectionLabelEvent(
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b", label: "" },
      { id: "tile-a", userTitle: "Worker" },
      { id: "tile-b", userTitle: "Reviewer" },
    )).toMatchObject({
      type: "connection.updated",
      summary: "Worker -> Reviewer cable label cleared",
    });
  });
});

describe("validateRpcConnectionCreate", () => {
  const termA = { id: "tile-a", type: "term" };
  const termB = { id: "tile-b", type: "term" };

  test("accepts terminal-to-terminal connections", () => {
    expect(validateRpcConnectionCreate(termA, termB, []))
      .toMatchObject({
        ok: true,
        tileAId: "tile-a",
        tileBId: "tile-b",
      });
  });

  test("rejects duplicate connections in either direction", () => {
    expect(validateRpcConnectionCreate(termA, termB, [
      { tileAId: "tile-b", tileBId: "tile-a" },
    ])).toMatchObject({
      ok: false,
      code: 4,
      reason: "duplicate",
      message: "Connection already exists.",
    });
  });

  test("rejects non-terminal endpoints and self-connections", () => {
    expect(validateRpcConnectionCreate(
      { id: "tile-note", type: "note" },
      termB,
      [],
    )).toMatchObject({
      ok: false,
      reason: "invalid_source",
    });
    expect(validateRpcConnectionCreate(termA, termA, []))
      .toMatchObject({
        ok: false,
        reason: "same_tile",
      });
  });
});
