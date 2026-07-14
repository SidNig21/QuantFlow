import { getDb } from "./database";
import type { SchemaRow, SchemaValidationRejection, SchemaViolation } from "./types";

export function createSchema(params: {
  schemaId: string;
  schemaVersion?: string;
  body: string;
}): SchemaRow {
  const now = Date.now();
  const row: SchemaRow = {
    schema_id: params.schemaId,
    schema_version: params.schemaVersion ?? "1",
    body: params.body,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO schemas (schema_id, schema_version, body, created_at, updated_at)
       VALUES (@schema_id, @schema_version, @body, @created_at, @updated_at)
       ON CONFLICT (schema_id) DO UPDATE SET
         schema_version = excluded.schema_version,
         body           = excluded.body,
         updated_at     = excluded.updated_at`,
    )
    .run(row);

  return row;
}

export function getSchema(schemaId: string): SchemaRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM schemas WHERE schema_id = ?")
      .get(schemaId) as SchemaRow | undefined) ?? null
  );
}

export function listSchemas(): SchemaRow[] {
  return getDb()
    .prepare("SELECT * FROM schemas ORDER BY created_at ASC")
    .all() as SchemaRow[];
}

export function deleteSchema(schemaId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM schemas WHERE schema_id = ?")
    .run(schemaId);
  return result.changes > 0;
}

/**
 * Validate a payload string against the named schema.
 * Returns null when valid or when the schema is not in the registry (permissive).
 * Returns a rejection object when the schema exists and the payload fails.
 */
export function validatePayload(
  schemaId: string,
  payload: string,
): SchemaValidationRejection | null {
  const schemaRow = getSchema(schemaId);
  if (!schemaRow) return null; // schema not registered → pass through

  let schemaDoc: unknown;
  try {
    schemaDoc = JSON.parse(schemaRow.body);
  } catch {
    return null; // corrupt schema body → pass through
  }

  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return {
      error: "schema_validation_failed",
      schema_id: schemaId,
      violations: [{ path: "", message: "payload is not valid JSON" }],
    };
  }

  const violations = runJsonSchemaValidation(schemaDoc, value);
  if (violations.length === 0) return null;

  return { error: "schema_validation_failed", schema_id: schemaId, violations };
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM schemas").run();
}

// ─── Minimal structural JSON Schema validator ─────────────────────────────────
// Handles: type, required, properties, minimum, maximum, minLength, maxLength.
// Does not require an external dependency (Goal 2 scope).

function runJsonSchemaValidation(
  schema: unknown,
  value: unknown,
  path = "",
): SchemaViolation[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const violations: SchemaViolation[] = [];

  if (typeof s.type === "string") {
    const jsType = jsonSchemaTypeOf(value);
    if (s.type !== jsType) {
      violations.push({
        path: path || "/",
        message: `expected type '${s.type}', got '${jsType}'`,
      });
      return violations; // further checks invalid when type wrong
    }
  }

  if (s.type === "object" && value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(s.required)) {
      for (const key of s.required as string[]) {
        if (!(key in obj)) {
          violations.push({ path: path ? `${path}/${key}` : `/${key}`, message: `required property '${key}' missing` });
        }
      }
    }
    if (s.properties && typeof s.properties === "object") {
      for (const [key, subSchema] of Object.entries(s.properties as Record<string, unknown>)) {
        if (key in obj) {
          violations.push(...runJsonSchemaValidation(subSchema, obj[key], path ? `${path}/${key}` : `/${key}`));
        }
      }
    }
  }

  if (s.type === "string" && typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) {
      violations.push({ path: path || "/", message: `string length ${value.length} is less than minLength ${s.minLength}` });
    }
    if (typeof s.maxLength === "number" && value.length > s.maxLength) {
      violations.push({ path: path || "/", message: `string length ${value.length} exceeds maxLength ${s.maxLength}` });
    }
  }

  if (s.type === "number" && typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) {
      violations.push({ path: path || "/", message: `value ${value} is less than minimum ${s.minimum}` });
    }
    if (typeof s.maximum === "number" && value > s.maximum) {
      violations.push({ path: path || "/", message: `value ${value} exceeds maximum ${s.maximum}` });
    }
  }

  return violations;
}

function jsonSchemaTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
