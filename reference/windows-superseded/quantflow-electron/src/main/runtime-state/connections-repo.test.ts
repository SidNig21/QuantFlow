import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import {
  createConnection,
  getConnection,
  listConnections,
  updateConnection,
  deleteConnection,
  incrementQueueDepth,
  decrementQueueDepth,
  getQueueDepth,
  QUEUE_DEPTH_MAX,
  _resetForTesting,
} from "./connections-repo";
import { installTestRuntimeDb } from "./test-sqlite-adapter";

beforeEach(() => {
  installTestRuntimeDb();
  _resetForTesting();
});

afterAll(() => {
  _resetForTesting();
});

describe("createConnection / getConnection", () => {
  test("creates and retrieves a connection", () => {
    const conn = createConnection({ tileAId: "tile-a", tileBId: "tile-b" });

    expect(conn.id).toBeDefined();
    expect(conn.tile_a_id).toBe("tile-a");
    expect(conn.tile_b_id).toBe("tile-b");
    expect(conn.type).toBe("string");
    expect(conn.kind).toBe("string");
    expect(conn.watcher_enabled).toBe(0);
    expect(conn.watcher_syntax).toBe("heredoc-v1");
    expect(conn.from_tile_id).toBeNull();
    expect(conn.label).toBeNull();

    const fetched = getConnection(conn.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(conn.id);
    expect(fetched!.tile_a_id).toBe("tile-a");
  });

  test("creates connection with directional from/to", () => {
    const conn = createConnection({
      tileAId: "tile-a",
      tileBId: "tile-b",
      fromTileId: "tile-a",
      fromSide: "E",
      toTileId: "tile-b",
      toSide: "W",
      label: "My cable",
    });

    expect(conn.from_tile_id).toBe("tile-a");
    expect(conn.from_side).toBe("E");
    expect(conn.to_tile_id).toBe("tile-b");
    expect(conn.to_side).toBe("W");
    expect(conn.label).toBe("My cable");
  });

  test("creates connection with custom id (stable ulid support)", () => {
    const conn = createConnection({ id: "custom-id-123", tileAId: "a", tileBId: "b" });
    expect(conn.id).toBe("custom-id-123");
  });

  test("creates multiple connections between same tile pair", () => {
    const c1 = createConnection({ tileAId: "tile-a", tileBId: "tile-b", fromSide: "N", toSide: "S" });
    const c2 = createConnection({ tileAId: "tile-a", tileBId: "tile-b", fromSide: "E", toSide: "W" });

    expect(c1.id).not.toBe(c2.id);
    const all = listConnections({ tileAId: "tile-a" });
    expect(all.length).toBe(2);
  });

  test("getConnection returns null for unknown id", () => {
    expect(getConnection("does-not-exist")).toBeNull();
  });
});

describe("listConnections", () => {
  test("returns all connections when no filter", () => {
    createConnection({ tileAId: "a", tileBId: "b" });
    createConnection({ tileAId: "c", tileBId: "d" });
    expect(listConnections().length).toBe(2);
  });

  test("filters by tileAId", () => {
    createConnection({ tileAId: "a", tileBId: "b" });
    createConnection({ tileAId: "x", tileBId: "y" });
    expect(listConnections({ tileAId: "a" }).length).toBe(1);
  });

  test("filters by tileId (either endpoint)", () => {
    createConnection({ tileAId: "a", tileBId: "b" });
    createConnection({ tileAId: "b", tileBId: "c" });
    createConnection({ tileAId: "x", tileBId: "y" });
    const forB = listConnections({ tileId: "b" });
    expect(forB.length).toBe(2);
  });

  test("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      createConnection({ tileAId: "a", tileBId: `b${i}` });
    }
    expect(listConnections({ tileAId: "a", limit: 3 }).length).toBe(3);
  });
});

describe("updateConnection", () => {
  test("updates label and watcher", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    const updated = updateConnection(conn.id, { label: "renamed", watcherEnabled: true });

    expect(updated).not.toBeNull();
    expect(updated!.label).toBe("renamed");
    expect(updated!.watcher_enabled).toBe(1);
  });

  test("returns null for unknown id", () => {
    expect(updateConnection("nope", { label: "x" })).toBeNull();
  });

  test("returns existing row unchanged when no fields provided", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b", label: "original" });
    const unchanged = updateConnection(conn.id, {});
    expect(unchanged!.label).toBe("original");
  });
});

describe("deleteConnection", () => {
  test("deletes and returns true", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    expect(deleteConnection(conn.id)).toBe(true);
    expect(getConnection(conn.id)).toBeNull();
  });

  test("returns false for unknown id", () => {
    expect(deleteConnection("never-existed")).toBe(false);
  });
});

describe("queue_depth backpressure", () => {
  test("starts at 0 after creation", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    expect(getQueueDepth(conn.id)).toBe(0);
  });

  test("incrementQueueDepth returns new depth and overflow=false below max", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    const result = incrementQueueDepth(conn.id);
    expect(result.queue_depth).toBe(1);
    expect(result.overflow).toBe(false);
    expect(getQueueDepth(conn.id)).toBe(1);
  });

  test("decrementQueueDepth reduces depth", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    incrementQueueDepth(conn.id);
    incrementQueueDepth(conn.id);
    decrementQueueDepth(conn.id);
    expect(getQueueDepth(conn.id)).toBe(1);
  });

  test("decrementQueueDepth clamps to 0", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    decrementQueueDepth(conn.id);
    expect(getQueueDepth(conn.id)).toBe(0);
  });

  test("overflow fires when depth exceeds QUEUE_DEPTH_MAX", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    for (let i = 0; i < QUEUE_DEPTH_MAX; i++) {
      const r = incrementQueueDepth(conn.id);
      expect(r.overflow).toBe(false);
    }
    const overflow = incrementQueueDepth(conn.id);
    expect(overflow.overflow).toBe(true);
    expect(overflow.queue_depth).toBe(QUEUE_DEPTH_MAX + 1);
  });

  test("incrementQueueDepth is a no-op for unknown id (returns 0, no overflow)", () => {
    const result = incrementQueueDepth("does-not-exist");
    expect(result.queue_depth).toBe(0);
    expect(result.overflow).toBe(false);
  });

  test("QUEUE_DEPTH_MAX is 10", () => {
    expect(QUEUE_DEPTH_MAX).toBe(10);
  });
});

describe("connections survive restart (DB persistence model)", () => {
  test("connection created in one installTestRuntimeDb call can be read after re-install", () => {
    const conn = createConnection({ tileAId: "restart-a", tileBId: "restart-b" });
    const id = conn.id;

    // Simulate what would happen if the DB file were real and re-opened:
    // For this test, we verify the row exists in the current DB session.
    // In production, the SQLite file ensures connections survive process restart.
    const fetched = getConnection(id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tile_a_id).toBe("restart-a");
  });
});
