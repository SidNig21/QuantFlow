import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import migration001 from "./migrations/001-initial.sql?raw";
import migration002 from "./migrations/002-orchestration-spine.sql?raw";
import migration003 from "./migrations/003-task-message-schema.sql?raw";

describe("runtime-state migrations", () => {
  test("migrations 002 and 003 preserve 001 rows and extend orchestration schema", () => {
    const db = new Database(":memory:");

    db.exec(migration001);
    db.prepare(
      `INSERT INTO tasks
         (id, cable_id, from_tile_id, to_tile_id, status, payload, result, created_at, updated_at)
       VALUES
         ('task-001', 'cable-001', 'tile-a', 'tile-b', 'pending', 'payload', NULL, 100, 100)`,
    ).run();
    db.prepare(
      `INSERT INTO events (id, kind, task_id, tile_id, data, created_at)
       VALUES ('event-001', 'cable.send', 'task-001', 'tile-a', '{"ok":true}', 101)`,
    ).run();

    db.exec(migration002);
    db.exec(migration003);

    expect(
      (db.prepare("SELECT payload FROM tasks WHERE id = 'task-001'").get() as { payload: string })
        .payload,
    ).toBe("payload");
    expect(
      (db.prepare("SELECT kind FROM events WHERE id = 'event-001'").get() as { kind: string })
        .kind,
    ).toBe("cable.send");

    const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const eventColumns = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain("runs");
    expect(tables).toContain("artifacts");
    expect(tables).toContain("tile_capabilities");
    expect(tables).toContain("tiles_runtime");
    expect(taskColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "run_id",
        "parent_task_id",
        "correlation_id",
        "thread_id",
        "trace_id",
        "origin",
        "payload_hash",
        "sent_at",
        "delivered_at",
        "completed_at",
        "schema_id",
        "schema_version",
      ]),
    );
    expect(taskColumns.map((c) => c.name)).toContain("from_tile_id");
    expect(taskColumns.map((c) => c.name)).not.toContain("source_tile_id");
    expect(eventColumns.map((c) => c.name)).toEqual(
      expect.arrayContaining(["run_id", "trace_id", "correlation_id", "cable_id", "level"]),
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        "tasks_run_id",
        "tasks_correlation_id",
        "tasks_trace_id",
        "events_run_id",
        "events_correlation_id",
        "events_trace_id",
        "tile_capabilities_tile_id",
        "tile_capabilities_capability",
        "tasks_schema_id",
      ]),
    );
    expect(
      (db.prepare("SELECT 1 AS found FROM schema_migrations WHERE version = 2").get() as {
        found: number;
      }).found,
    ).toBe(1);
    expect(
      (db.prepare("SELECT 1 AS found FROM schema_migrations WHERE version = 3").get() as {
        found: number;
      }).found,
    ).toBe(1);

    db.close();
  });
});
