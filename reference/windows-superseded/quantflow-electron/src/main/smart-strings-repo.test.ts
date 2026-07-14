import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import {
  getSmartStringConfig,
  setSmartStringConfig,
  clearSmartStringConfig,
  listSmartStrings,
  validateSmartStringConfig,
} from "./smart-strings-repo";
import { createConnection, _resetForTesting } from "./runtime-state/connections-repo";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import type { SmartStringConfig } from "./runtime-state/types";

beforeEach(() => {
  installTestRuntimeDb();
  _resetForTesting();
});

afterAll(() => {
  _resetForTesting();
});

const watchConfig: SmartStringConfig = {
  mode: "watch",
  enabled: true,
  source_adapter: "terminal-pty",
  target_adapter: "terminal-pty",
  match_rule: { type: "contains", pattern: "hello-smart-string" },
  transform: { type: "passthrough" },
  delivery_policy: "fire-and-forget",
};

// ─── validateSmartStringConfig ────────────────────────────────────────────────

describe("validateSmartStringConfig", () => {
  test("accepts a valid watch config", () => {
    expect(validateSmartStringConfig(watchConfig)).toEqual({ ok: true });
  });

  test("accepts minimal config with just mode + enabled", () => {
    expect(validateSmartStringConfig({ mode: "message", enabled: true })).toEqual({ ok: true });
  });

  test("rejects non-object", () => {
    const result = validateSmartStringConfig("bad");
    expect(result.ok).toBe(false);
  });

  test("rejects missing mode", () => {
    const result = validateSmartStringConfig({ enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("mode"))).toBe(true);
  });

  test("rejects deferred modes: handoff, trigger, gate, pipe", () => {
    for (const mode of ["handoff", "trigger", "gate", "pipe"]) {
      const result = validateSmartStringConfig({ mode, enabled: true });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes("deferred"))).toBe(true);
    }
  });

  test("rejects unknown mode", () => {
    const result = validateSmartStringConfig({ mode: "broadcast", enabled: true });
    expect(result.ok).toBe(false);
  });

  test("rejects missing enabled", () => {
    const result = validateSmartStringConfig({ mode: "watch" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("enabled"))).toBe(true);
  });

  test("rejects invalid match_rule type", () => {
    const result = validateSmartStringConfig({
      mode: "watch",
      enabled: true,
      match_rule: { type: "glob", pattern: "*.ts" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("match_rule.type"))).toBe(true);
  });

  test("rejects invalid regex pattern", () => {
    const result = validateSmartStringConfig({
      mode: "watch",
      enabled: true,
      match_rule: { type: "regex", pattern: "([unclosed" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("valid regex"))).toBe(true);
  });

  test("rejects empty match_rule pattern", () => {
    const result = validateSmartStringConfig({
      mode: "watch",
      enabled: true,
      match_rule: { type: "contains", pattern: "" },
    });
    expect(result.ok).toBe(false);
  });

  test("rejects invalid transform type", () => {
    const result = validateSmartStringConfig({
      mode: "watch",
      enabled: true,
      transform: { type: "summarize" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("transform.type"))).toBe(true);
  });

  test("rejects invalid delivery_policy", () => {
    const result = validateSmartStringConfig({
      mode: "watch",
      enabled: true,
      delivery_policy: "best-effort",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("delivery_policy"))).toBe(true);
  });

  test("accepts all valid modes", () => {
    for (const mode of ["message", "watch", "reply", "artifact", "receipt"]) {
      expect(validateSmartStringConfig({ mode, enabled: true })).toEqual({ ok: true });
    }
  });
});

// ─── getSmartStringConfig ─────────────────────────────────────────────────────

describe("getSmartStringConfig", () => {
  test("returns null for connection with no smart string config", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    expect(getSmartStringConfig(conn.id)).toBeNull();
  });

  test("returns null for unknown connection id", () => {
    expect(getSmartStringConfig("nonexistent")).toBeNull();
  });

  test("returns config after setSmartStringConfig", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    setSmartStringConfig(conn.id, watchConfig);
    const cfg = getSmartStringConfig(conn.id);
    expect(cfg).not.toBeNull();
    expect(cfg!.mode).toBe("watch");
    expect(cfg!.enabled).toBe(true);
    expect(cfg!.match_rule?.pattern).toBe("hello-smart-string");
  });
});

// ─── setSmartStringConfig ─────────────────────────────────────────────────────

describe("setSmartStringConfig", () => {
  test("persists config on an existing connection", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    const result = setSmartStringConfig(conn.id, watchConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = JSON.parse(result.connection.config) as { smartString?: SmartStringConfig };
      expect(config.smartString?.mode).toBe("watch");
    }
  });

  test("preserves existing config keys when setting smartString", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b", config: { myKey: "myValue" } });
    const result = setSmartStringConfig(conn.id, watchConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = JSON.parse(result.connection.config) as Record<string, unknown>;
      expect(config["myKey"]).toBe("myValue");
      expect((config["smartString"] as SmartStringConfig | undefined)?.mode).toBe("watch");
    }
  });

  test("returns error for nonexistent connection", () => {
    const result = setSmartStringConfig("nonexistent", watchConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("not found");
  });

  test("returns validation errors for invalid config", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    const result = setSmartStringConfig(conn.id, { mode: "handoff", enabled: true } as SmartStringConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("deferred"))).toBe(true);
  });

  test("overwrites previous smartString config", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    setSmartStringConfig(conn.id, watchConfig);
    const updated: SmartStringConfig = { mode: "message", enabled: false };
    setSmartStringConfig(conn.id, updated);
    const cfg = getSmartStringConfig(conn.id);
    expect(cfg?.mode).toBe("message");
    expect(cfg?.enabled).toBe(false);
    expect(cfg?.match_rule).toBeUndefined();
  });
});

// ─── clearSmartStringConfig ───────────────────────────────────────────────────

describe("clearSmartStringConfig", () => {
  test("removes smartString key from config", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b" });
    setSmartStringConfig(conn.id, watchConfig);
    clearSmartStringConfig(conn.id);
    expect(getSmartStringConfig(conn.id)).toBeNull();
  });

  test("preserves other config keys when clearing", () => {
    const conn = createConnection({ tileAId: "a", tileBId: "b", config: { kept: true } });
    setSmartStringConfig(conn.id, watchConfig);
    const result = clearSmartStringConfig(conn.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = JSON.parse(result.connection.config) as Record<string, unknown>;
      expect(config["kept"]).toBe(true);
      expect(config["smartString"]).toBeUndefined();
    }
  });

  test("returns error for nonexistent connection", () => {
    const result = clearSmartStringConfig("nonexistent");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("not found");
  });
});

// ─── listSmartStrings ─────────────────────────────────────────────────────────

describe("listSmartStrings", () => {
  test("returns empty list when no smart strings configured", () => {
    createConnection({ tileAId: "a", tileBId: "b" });
    expect(listSmartStrings()).toHaveLength(0);
  });

  test("returns configured smart strings", () => {
    const c1 = createConnection({ tileAId: "a", tileBId: "b" });
    const c2 = createConnection({ tileAId: "c", tileBId: "d" });
    setSmartStringConfig(c1.id, watchConfig);
    setSmartStringConfig(c2.id, { mode: "message", enabled: true });
    expect(listSmartStrings()).toHaveLength(2);
  });

  test("filters by mode", () => {
    const c1 = createConnection({ tileAId: "a", tileBId: "b" });
    const c2 = createConnection({ tileAId: "c", tileBId: "d" });
    setSmartStringConfig(c1.id, watchConfig);
    setSmartStringConfig(c2.id, { mode: "message", enabled: true });
    const watches = listSmartStrings({ mode: "watch" });
    expect(watches).toHaveLength(1);
    expect(watches[0]!.connectionId).toBe(c1.id);
  });

  test("filters by enabledOnly", () => {
    const c1 = createConnection({ tileAId: "a", tileBId: "b" });
    const c2 = createConnection({ tileAId: "c", tileBId: "d" });
    setSmartStringConfig(c1.id, watchConfig);
    setSmartStringConfig(c2.id, { mode: "message", enabled: false });
    const enabled = listSmartStrings({ enabledOnly: true });
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.connectionId).toBe(c1.id);
  });

  test("filters by tileId (either endpoint)", () => {
    const c1 = createConnection({ tileAId: "shared-tile", tileBId: "other" });
    const c2 = createConnection({ tileAId: "another", tileBId: "shared-tile" });
    const c3 = createConnection({ tileAId: "unrelated-a", tileBId: "unrelated-b" });
    setSmartStringConfig(c1.id, watchConfig);
    setSmartStringConfig(c2.id, { mode: "message", enabled: true });
    setSmartStringConfig(c3.id, { mode: "receipt", enabled: true });
    const results = listSmartStrings({ tileId: "shared-tile" });
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.connectionId);
    expect(ids).toContain(c1.id);
    expect(ids).toContain(c2.id);
  });

  test("includes connectionId, tileAId, tileBId, label, config", () => {
    const c1 = createConnection({ tileAId: "a", tileBId: "b", label: "my-cable" });
    setSmartStringConfig(c1.id, watchConfig);
    const entries = listSmartStrings();
    expect(entries[0]!.connectionId).toBe(c1.id);
    expect(entries[0]!.tileAId).toBe("a");
    expect(entries[0]!.tileBId).toBe("b");
    expect(entries[0]!.label).toBe("my-cable");
    expect(entries[0]!.config.mode).toBe("watch");
  });
});
