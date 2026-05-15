import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import {
  createSchema,
  getSchema,
  listSchemas,
  deleteSchema,
  validatePayload,
  _resetForTesting,
} from "./schemas-repo";
import { installTestRuntimeDb } from "./test-sqlite-adapter";

beforeEach(() => {
  installTestRuntimeDb();
  _resetForTesting();
});

afterAll(() => {
  _resetForTesting();
});

describe("createSchema / getSchema", () => {
  test("creates and retrieves a schema by id", () => {
    const body = JSON.stringify({ type: "object", required: ["msg"], properties: { msg: { type: "string" } } });
    const row = createSchema({ schemaId: "test-schema-v1", body });

    expect(row.schema_id).toBe("test-schema-v1");
    expect(row.schema_version).toBe("1");
    expect(row.body).toBe(body);

    const fetched = getSchema("test-schema-v1");
    expect(fetched).not.toBeNull();
    expect(fetched!.schema_id).toBe("test-schema-v1");
  });

  test("upserts when schema_id already exists", () => {
    const body1 = JSON.stringify({ type: "string" });
    const body2 = JSON.stringify({ type: "number" });

    createSchema({ schemaId: "upsert-test", body: body1 });
    createSchema({ schemaId: "upsert-test", body: body2, schemaVersion: "2" });

    const fetched = getSchema("upsert-test");
    expect(fetched!.body).toBe(body2);
    expect(fetched!.schema_version).toBe("2");
  });

  test("getSchema returns null for unknown id", () => {
    expect(getSchema("does-not-exist")).toBeNull();
  });
});

describe("listSchemas", () => {
  test("returns all schemas ordered by created_at", () => {
    createSchema({ schemaId: "a", body: "{}" });
    createSchema({ schemaId: "b", body: "{}" });
    const all = listSchemas();
    expect(all.length).toBe(2);
    expect(all.map((s) => s.schema_id)).toContain("a");
    expect(all.map((s) => s.schema_id)).toContain("b");
  });
});

describe("deleteSchema", () => {
  test("deletes an existing schema and returns true", () => {
    createSchema({ schemaId: "to-delete", body: "{}" });
    expect(deleteSchema("to-delete")).toBe(true);
    expect(getSchema("to-delete")).toBeNull();
  });

  test("returns false for unknown schema_id", () => {
    expect(deleteSchema("never-existed")).toBe(false);
  });
});

describe("validatePayload", () => {
  test("returns null when schema_id not in registry (permissive)", () => {
    const result = validatePayload("unknown-schema", '{"msg":"hello"}');
    expect(result).toBeNull();
  });

  test("returns null when payload is valid against schema", () => {
    const body = JSON.stringify({
      type: "object",
      required: ["msg"],
      properties: { msg: { type: "string" } },
    });
    createSchema({ schemaId: "msg-schema", body });

    const result = validatePayload("msg-schema", '{"msg":"hello"}');
    expect(result).toBeNull();
  });

  test("returns rejection when required property is missing", () => {
    const body = JSON.stringify({
      type: "object",
      required: ["msg"],
      properties: { msg: { type: "string" } },
    });
    createSchema({ schemaId: "msg-required", body });

    const result = validatePayload("msg-required", "{}");
    expect(result).not.toBeNull();
    expect(result!.error).toBe("schema_validation_failed");
    expect(result!.schema_id).toBe("msg-required");
    expect(result!.violations.length).toBeGreaterThan(0);
    expect(result!.violations[0].message).toContain("msg");
  });

  test("returns rejection when payload is not valid JSON", () => {
    createSchema({ schemaId: "any-schema", body: '{"type":"object"}' });

    const result = validatePayload("any-schema", "not-json");
    expect(result).not.toBeNull();
    expect(result!.error).toBe("schema_validation_failed");
    expect(result!.violations[0].message).toContain("not valid JSON");
  });

  test("returns rejection when type is wrong", () => {
    createSchema({ schemaId: "string-schema", body: '{"type":"string"}' });

    const result = validatePayload("string-schema", "42");
    expect(result).not.toBeNull();
    expect(result!.violations[0].message).toContain("expected type 'string'");
  });

  test("validates minLength / maxLength", () => {
    const body = JSON.stringify({ type: "string", minLength: 5 });
    createSchema({ schemaId: "len-schema", body });

    const tooShort = validatePayload("len-schema", '"hi"');
    expect(tooShort).not.toBeNull();
    expect(tooShort!.violations[0].message).toContain("minLength");

    const okLen = validatePayload("len-schema", '"hello"');
    expect(okLen).toBeNull();
  });
});
