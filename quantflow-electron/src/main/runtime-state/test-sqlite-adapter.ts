import { Database } from "bun:sqlite";
import { _setDbForTesting } from "./database";
import migration001 from "./migrations/001-initial.sql?raw";
import migration002 from "./migrations/002-orchestration-spine.sql?raw";
import migration003 from "./migrations/003-task-message-schema.sql?raw";
import migration004 from "./migrations/004-connections-contracts.sql?raw";
import migration005 from "./migrations/005-backpressure.sql?raw";

type BetterSqliteCompatibleDatabase = Parameters<typeof _setDbForTesting>[0];

function normalizeSql(sql: string): string {
  return sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, "$$$1");
}

function normalizeParams(params: unknown): unknown {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;

  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key.startsWith("$") ? key : `$${key}`, value]),
  );
}

function adaptStatement(statement: ReturnType<Database["prepare"]>) {
  const run = (params?: unknown) => statement.run(normalizeParams(params));
  const get = (params?: unknown) => statement.get(normalizeParams(params));
  const all = (params?: unknown) => statement.all(normalizeParams(params));

  return {
    run,
    get,
    all,
    pluck() {
      return {
        get(params?: unknown) {
          const row = get(params);
          if (!row || typeof row !== "object") return row;
          return Object.values(row)[0];
        },
        all(params?: unknown) {
          return all(params).map((row) => {
            if (!row || typeof row !== "object") return row;
            return Object.values(row)[0];
          });
        },
      };
    },
  };
}

export function createTestRuntimeDb(): Database {
  const db = new Database(":memory:");
  db.exec(migration001);
  db.exec(migration002);
  db.exec(migration003);
  db.exec(migration004);
  db.exec(migration005);
  return db;
}

export function installTestRuntimeDb(): Database {
  const db = createTestRuntimeDb();
  const adaptedDb = {
    exec: db.exec.bind(db),
    close: db.close.bind(db),
    pragma() {},
    prepare(sql: string) {
      return adaptStatement(db.prepare(normalizeSql(sql)));
    },
  };

  _setDbForTesting(adaptedDb as unknown as BetterSqliteCompatibleDatabase);
  return db;
}
