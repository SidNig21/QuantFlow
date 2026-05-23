import {
  getConnection,
  listConnections,
  updateConnection,
} from "./runtime-state/connections-repo";
import type {
  ConnectionRow,
  SmartStringConfig,
  SmartStringMode,
  ConnectionConfig,
} from "./runtime-state/types";

const SUPPORTED_MODES: SmartStringMode[] = [
  "message",
  "watch",
  "reply",
  "artifact",
  "receipt",
];

const DEFERRED_MODES = new Set(["handoff", "trigger", "gate", "pipe"]);

// ─── Validation ───────────────────────────────────────────────────────────────

export type SmartStringValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateSmartStringConfig(
  config: unknown,
): SmartStringValidationResult {
  const errors: string[] = [];
  if (!config || typeof config !== "object") {
    return { ok: false, errors: ["config must be an object"] };
  }
  const c = config as Record<string, unknown>;

  const mode = c["mode"];
  if (!mode || typeof mode !== "string") {
    errors.push("mode is required");
  } else if (DEFERRED_MODES.has(mode)) {
    errors.push(`mode '${mode}' is deferred and not supported in v1`);
  } else if (!(SUPPORTED_MODES as string[]).includes(mode)) {
    errors.push(
      `mode '${mode}' is not supported; valid modes: ${SUPPORTED_MODES.join(", ")}`,
    );
  }

  if (typeof c["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  const matchRule = c["match_rule"];
  if (matchRule !== undefined && matchRule !== null) {
    if (typeof matchRule !== "object") {
      errors.push("match_rule must be an object");
    } else {
      const mr = matchRule as Record<string, unknown>;
      if (mr["type"] !== "contains" && mr["type"] !== "regex") {
        errors.push("match_rule.type must be 'contains' or 'regex'");
      }
      if (typeof mr["pattern"] !== "string" || !mr["pattern"]) {
        errors.push("match_rule.pattern must be a non-empty string");
      }
      if (mr["type"] === "regex" && typeof mr["pattern"] === "string") {
        try {
          new RegExp(mr["pattern"]);
        } catch {
          errors.push(`match_rule.pattern is not a valid regex: ${mr["pattern"]}`);
        }
      }
    }
  }

  const transform = c["transform"];
  if (transform !== undefined && transform !== null) {
    if (typeof transform !== "object") {
      errors.push("transform must be an object");
    } else {
      const t = transform as Record<string, unknown>;
      if (t["type"] !== "passthrough" && t["type"] !== "structured-message") {
        errors.push("transform.type must be 'passthrough' or 'structured-message'");
      }
    }
  }

  const deliveryPolicy = c["delivery_policy"];
  if (deliveryPolicy !== undefined && deliveryPolicy !== null) {
    if (deliveryPolicy !== "fire-and-forget" && deliveryPolicy !== "await-ack") {
      errors.push("delivery_policy must be 'fire-and-forget' or 'await-ack'");
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

// ─── Config access ────────────────────────────────────────────────────────────

function parseConfig(row: ConnectionRow): ConnectionConfig {
  try {
    return JSON.parse(row.config) as ConnectionConfig;
  } catch {
    return {};
  }
}

export function getSmartStringConfig(
  connectionId: string,
): SmartStringConfig | null {
  const row = getConnection(connectionId);
  if (!row) return null;
  return parseConfig(row).smartString ?? null;
}

export function setSmartStringConfig(
  connectionId: string,
  smartString: SmartStringConfig,
): { ok: true; connection: ConnectionRow } | { ok: false; errors: string[] } {
  const validation = validateSmartStringConfig(smartString);
  if (!validation.ok) return validation;

  const row = getConnection(connectionId);
  if (!row) {
    return { ok: false, errors: [`Connection '${connectionId}' not found`] };
  }

  const existing = parseConfig(row);
  const updated = updateConnection(connectionId, {
    config: { ...existing, smartString },
  });

  if (!updated) {
    return { ok: false, errors: [`Failed to persist config for '${connectionId}'`] };
  }

  return { ok: true, connection: updated };
}

export function clearSmartStringConfig(
  connectionId: string,
): { ok: true; connection: ConnectionRow } | { ok: false; errors: string[] } {
  const row = getConnection(connectionId);
  if (!row) {
    return { ok: false, errors: [`Connection '${connectionId}' not found`] };
  }

  const existing = parseConfig(row);
  const { smartString: _removed, ...rest } = existing;
  const updated = updateConnection(connectionId, { config: rest });

  if (!updated) {
    return { ok: false, errors: [`Failed to clear config for '${connectionId}'`] };
  }

  return { ok: true, connection: updated };
}

export interface SmartStringEntry {
  connectionId: string;
  tileAId: string;
  tileBId: string;
  label: string | null;
  config: SmartStringConfig;
}

export function listSmartStrings(filter?: {
  tileId?: string;
  mode?: SmartStringMode;
  enabledOnly?: boolean;
}): SmartStringEntry[] {
  const connections = listConnections(
    filter?.tileId ? { tileId: filter.tileId } : {},
  );

  const results: SmartStringEntry[] = [];
  for (const conn of connections) {
    const parsed = parseConfig(conn);
    if (!parsed.smartString) continue;
    const cfg = parsed.smartString;

    if (filter?.mode !== undefined && cfg.mode !== filter.mode) continue;
    if (filter?.enabledOnly && !cfg.enabled) continue;

    results.push({
      connectionId: conn.id,
      tileAId: conn.tile_a_id,
      tileBId: conn.tile_b_id,
      label: conn.label,
      config: cfg,
    });
  }

  return results;
}
