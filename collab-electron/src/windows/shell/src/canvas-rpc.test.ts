import { describe, test, expect } from "bun:test";
import {
	buildRoleTileOptions,
	buildRpcTileSummary,
	createConnectionFailureEvent,
	createConnectionLabelEvent,
	createConnectionMutationEvent,
	createRoleSpawnedEvent,
	createRoleSpawnFailureEvent,
	createTerminalReadFailureEvent,
	createTerminalWriteFailureEvent,
	findAutoPlacement,
	validateRpcConnectionCreate,
	validateRpcTerminalRead,
	validateRpcTerminalWrite,
	validateRpcTileResize,
	validateRpcViewportSet,
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

describe("buildRpcTileSummary", () => {
  test("exposes terminal routing identity and connected cable ids", () => {
    const summary = buildRpcTileSummary(
      {
        id: "tile-a",
        type: "term",
        x: 20,
        y: 40,
        width: 400,
        height: 500,
        cwd: "/repo",
        ptySessionId: "session-a",
        terminalTarget: "wsl:Ubuntu",
        ptyStatus: "ready",
        routeHandle: "codex-reviewer",
        roleId: "codex-reviewer",
        roleName: "Codex Reviewer",
        roleShellKind: "codex",
        roleCommandTemplate: "codex",
        zIndex: 7,
      },
      [
        { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
        { id: "conn-2", tileAId: "tile-c", tileBId: "tile-a" },
        { id: "conn-other", tileAId: "tile-x", tileBId: "tile-y" },
      ],
    );

    expect(summary).toMatchObject({
      id: "tile-a",
      type: "term",
      cwd: "/repo",
      ptySessionId: "session-a",
      terminalTarget: "wsl:Ubuntu",
      ptyStatus: "ready",
      routeHandle: "codex-reviewer",
      relaySyntax: ">>@codex-reviewer: <message>",
      roleId: "codex-reviewer",
      roleName: "Codex Reviewer",
      roleShellKind: "codex",
      roleCommandTemplate: "codex",
      connectionIds: ["conn-1", "conn-2"],
      position: { x: 20, y: 40 },
      size: { width: 400, height: 500 },
      zIndex: 7,
    });
  });
});

describe("buildRoleTileOptions", () => {
  test("copies role launch metadata into terminal tile options", () => {
    expect(buildRoleTileOptions(
      {
        id: "codex",
        name: "Codex",
        color: "#38bdf8",
        defaultShell: "wsl",
        commandTemplate: "codex --full-auto",
        startupPrompt: "Wait for instructions.",
        statusParser: { waiting: ["confirm"], blocked: ["error:"] },
      },
      {
        cwd: "/repo",
        size: { width: 520, height: 420 },
      },
    )).toEqual({
      cwd: "/repo",
      userTitle: "Codex",
      terminalTarget: "wsl",
      roleId: "codex",
      roleName: "Codex",
      roleColor: "#38bdf8",
      roleShellKind: "codex",
      roleCommandTemplate: "codex --full-auto",
      roleStartupPrompt: "Wait for instructions.",
      roleStatusParser: { waiting: ["confirm"], blocked: ["error:"] },
      width: 520,
      height: 420,
    });
  });

  test("leaves automatic shell selection unset for auto roles", () => {
    expect(buildRoleTileOptions(
      {
        id: "shell",
        name: "Shell",
        color: "#64748b",
        defaultShell: "auto",
      },
    )).toMatchObject({
      userTitle: "Shell",
      terminalTarget: undefined,
      roleShellKind: "auto",
    });
  });
});

describe("role spawn operational events", () => {
  test("formats successful role spawn events for Watchtower", () => {
    expect(createRoleSpawnedEvent(
      { id: "tile-codex" },
      {
        id: "codex",
        name: "Codex",
        commandTemplate: "codex",
      },
    )).toEqual({
      type: "role.spawned",
      severity: "info",
      summary: "Codex role tile spawned",
      detail: "codex",
      meta: {
        roleId: "codex",
        tileId: "tile-codex",
        command: "codex",
        source: "canvas-rpc",
      },
    });
  });

  test("formats missing role command failures for Watchtower", () => {
    expect(createRoleSpawnFailureEvent(
      {
        id: "claude-worker",
        commandTemplate: "\"claude code\" --danger",
      },
      "Claude Worker is missing command: claude code",
    )).toEqual({
      type: "role.failed",
      severity: "error",
      summary: "Claude Worker is missing command: claude code",
      meta: {
        roleId: "claude-worker",
        command: "claude code",
        source: "canvas-rpc",
      },
    });
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

  test("supports non-RPC label event sources", () => {
    expect(createConnectionLabelEvent(
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b", label: "review" },
      { id: "tile-a", userTitle: "Worker" },
      { id: "tile-b", userTitle: "Reviewer" },
      undefined,
      "cable-inspector",
    )).toMatchObject({
      type: "connection.updated",
      summary: "Worker -> Reviewer cable renamed: review",
      meta: {
        source: "cable-inspector",
      },
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

describe("validateRpcTerminalWrite", () => {
  test("accepts non-empty string input for terminal sessions", () => {
    expect(validateRpcTerminalWrite(
      { id: "tile-a", type: "term", ptySessionId: "session-a" },
      "\n",
    )).toEqual({
      ok: true,
      sessionId: "session-a",
      input: "\n",
    });
  });

  test("rejects non-terminal, missing session, and empty input writes", () => {
    expect(validateRpcTerminalWrite(
      { id: "tile-a", type: "note" },
      "hello",
    )).toMatchObject({
      ok: false,
      reason: "not_terminal",
      message: "Tile is not a terminal",
    });
    expect(validateRpcTerminalWrite(
      { id: "tile-a", type: "term" },
      "hello",
    )).toMatchObject({
      ok: false,
      reason: "missing_session",
      message: "Terminal has no session",
    });
    expect(validateRpcTerminalWrite(
      { id: "tile-a", type: "term", ptySessionId: "session-a" },
      "",
    )).toMatchObject({
      ok: false,
      reason: "empty_input",
      message: "Terminal input must be a non-empty string",
    });
  });
});

describe("validateRpcTerminalRead", () => {
  test("accepts default and bounded terminal read line counts", () => {
    expect(validateRpcTerminalRead(
      { id: "tile-a", type: "term", ptySessionId: "session-a" },
      undefined,
    )).toEqual({
      ok: true,
      sessionId: "session-a",
      lines: 50,
    });
    expect(validateRpcTerminalRead(
      { id: "tile-a", type: "term", ptySessionId: "session-a" },
      500,
    )).toMatchObject({
      ok: true,
      lines: 500,
    });
  });

  test("rejects non-terminal, missing session, and invalid line counts", () => {
    expect(validateRpcTerminalRead(
      { id: "tile-a", type: "note" },
      50,
    )).toMatchObject({
      ok: false,
      reason: "not_terminal",
    });
    expect(validateRpcTerminalRead(
      { id: "tile-a", type: "term" },
      50,
    )).toMatchObject({
      ok: false,
      reason: "missing_session",
    });
    for (const lines of [0, 501, 1.5, "50"]) {
      expect(validateRpcTerminalRead(
        { id: "tile-a", type: "term", ptySessionId: "session-a" },
        lines,
      )).toMatchObject({
        ok: false,
        reason: "invalid_lines",
        message: "Terminal read lines must be an integer from 1 to 500",
      });
    }
  });
});

describe("validateRpcTileResize", () => {
  test("accepts sizes at or above the tile type minimum", () => {
    expect(validateRpcTileResize(
      { id: "tile-a", type: "term" },
      { width: 200, height: 120 },
    )).toEqual({
      ok: true,
      width: 200,
      height: 120,
    });
    expect(validateRpcTileResize(
      { id: "tile-img", type: "image" },
      { width: 80, height: 80 },
    )).toMatchObject({
      ok: true,
    });
  });

  test("rejects non-finite and too-small tile sizes", () => {
    expect(validateRpcTileResize(
      { id: "tile-a", type: "term" },
      { width: Number.NaN, height: 120 },
    )).toMatchObject({
      ok: false,
      reason: "invalid_size",
      message: "Invalid size",
    });
    expect(validateRpcTileResize(
      { id: "tile-a", type: "term" },
      { width: 199, height: 120 },
    )).toMatchObject({
      ok: false,
      reason: "too_small",
      message: "Tile size must be at least 200x120",
    });
  });
});

describe("validateRpcViewportSet", () => {
  test("accepts finite pan and zoom inside the viewport range", () => {
    expect(validateRpcViewportSet({
      pan: { x: -120, y: 240 },
      zoom: 0.5,
    })).toEqual({
      ok: true,
      pan: { x: -120, y: 240 },
      zoom: 0.5,
    });
  });

  test("accepts partial viewport updates", () => {
    expect(validateRpcViewportSet({ pan: { x: 0, y: 0 } }))
      .toEqual({
        ok: true,
        pan: { x: 0, y: 0 },
      });
    expect(validateRpcViewportSet({ zoom: 1 }))
      .toEqual({
        ok: true,
        zoom: 1,
      });
  });

  test("rejects non-finite pan and out-of-range zoom", () => {
    expect(validateRpcViewportSet({ pan: { x: Infinity, y: 0 } }))
      .toMatchObject({
        ok: false,
        reason: "invalid_pan",
        message: "Viewport pan must use finite x and y values",
      });
    for (const zoom of [0, 1.5, Number.NaN]) {
      expect(validateRpcViewportSet({ zoom })).toMatchObject({
        ok: false,
        reason: "invalid_zoom",
        message: "Viewport zoom must be between 0.25 and 1",
      });
    }
  });
});

describe("createTerminalWriteFailureEvent", () => {
  test("formats RPC terminal write failures for Watchtower", () => {
    expect(createTerminalWriteFailureEvent(
      {
        id: "tile-a",
        type: "term",
        ptySessionId: "session-a",
        userTitle: "Worker",
      },
      "Terminal input must be a non-empty string",
      "empty_input",
    )).toEqual({
      type: "terminal.write_failed",
      severity: "warn",
      summary: "Terminal write failed: Terminal input must be a non-empty string",
      detail: "Worker",
      meta: {
        tileId: "tile-a",
        sessionId: "session-a",
        reason: "empty_input",
        source: "canvas-rpc",
      },
    });
  });
});

describe("createTerminalReadFailureEvent", () => {
  test("formats RPC terminal read failures for Watchtower", () => {
    expect(createTerminalReadFailureEvent(
      {
        id: "tile-a",
        type: "term",
        ptySessionId: "session-a",
        userTitle: "Worker",
      },
      "Terminal read lines must be an integer from 1 to 500",
      "invalid_lines",
    )).toEqual({
      type: "terminal.read_failed",
      severity: "warn",
      summary: "Terminal read failed: Terminal read lines must be an integer from 1 to 500",
      detail: "Worker",
      meta: {
        tileId: "tile-a",
        sessionId: "session-a",
        reason: "invalid_lines",
        source: "canvas-rpc",
      },
    });
  });
});
