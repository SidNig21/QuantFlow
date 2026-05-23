import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// ─── PTY mock (terminal-adapter uses ./pty) ───────────────────────────────────
const activeSessions = new Set<string>();
const writtenSessions: Array<{ sessionId: string; data: string }> = [];

mock.module("./pty", () => ({
  listSessions: () => [...activeSessions],
  writeToSession: (sessionId: string, data: string) => {
    writtenSessions.push({ sessionId, data });
  },
}));

mock.module("node:fs/promises", () => ({
  appendFile: async () => {},
  mkdir: async () => {},
}));

mock.module("./orchestration-service", () => ({
  createCorrelatedTask: () => ({ id: "task-1", run_id: "run-1", correlation_id: "corr-1", trace_id: "trace-1" }),
}));

import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { _resetForTesting as resetEvents, listEvents } from "./runtime-state/events-repo";
import { createConnection, _resetForTesting as resetConnections } from "./runtime-state/connections-repo";
import { matchLine, transformLine, runSmartStringPipeline } from "./smart-string-pipeline";
import type { PipelineDeps, PipelineSourceContext } from "./smart-string-pipeline";
import type { SmartStringConfig } from "./runtime-state/types";

afterAll(() => mock.restore());

beforeEach(() => {
  installTestRuntimeDb();
  resetEvents();
  resetConnections();
  activeSessions.clear();
  writtenSessions.length = 0;
});

// ─── matchLine ────────────────────────────────────────────────────────────────

describe("matchLine", () => {
  test("contains: matches when pattern is present", () => {
    expect(matchLine("hello world", { type: "contains", pattern: "world" })).toBe(true);
  });

  test("contains: misses when pattern is absent", () => {
    expect(matchLine("hello world", { type: "contains", pattern: "xyz" })).toBe(false);
  });

  test("regex: matches valid pattern", () => {
    expect(matchLine("error: file not found", { type: "regex", pattern: "^error:" })).toBe(true);
  });

  test("regex: misses when pattern does not match", () => {
    expect(matchLine("warn: low memory", { type: "regex", pattern: "^error:" })).toBe(false);
  });

  test("regex: invalid pattern returns false without throwing", () => {
    expect(matchLine("test", { type: "regex", pattern: "[invalid" })).toBe(false);
  });
});

// ─── transformLine ────────────────────────────────────────────────────────────

describe("transformLine", () => {
  test("passthrough returns input unchanged", () => {
    expect(transformLine("hello", { type: "passthrough" })).toBe("hello");
  });

  test("structured-message uses template variable {text}", () => {
    expect(transformLine("data", { type: "structured-message", template: "Result: {text}" })).toBe("Result: data");
  });

  test("structured-message defaults to {text} when template is missing", () => {
    expect(transformLine("raw", { type: "structured-message" })).toBe("raw");
  });
});

// ─── runSmartStringPipeline ───────────────────────────────────────────────────

const sourceTileId = "tile-source";
const targetTileId = "tile-target";
const sourceCtx: PipelineSourceContext = { tileId: sourceTileId, sessionId: "sess-src" };

const noDeps: PipelineDeps = {
  getSessionForTile: () => null,
  relayFn: () => ({ ok: true, formatted: "", eventId: "evt-relay", message: "ok" }),
};

function makeConfig(overrides: Partial<SmartStringConfig> = {}): SmartStringConfig {
  return {
    mode: "watch",
    enabled: true,
    source_adapter: "terminal-pty",
    target_adapter: "runtime-event",
    match_rule: { type: "contains", pattern: "TRIGGER" },
    transform: { type: "passthrough" },
    ...overrides,
  };
}

function makeConnection(config: SmartStringConfig) {
  return createConnection({
    tileAId: sourceTileId,
    tileBId: targetTileId,
    fromTileId: sourceTileId,
    toTileId: targetTileId,
    type: "message",
    kind: "message",
    config: { smartString: config as unknown as Record<string, unknown> },
  });
}

describe("runSmartStringPipeline", () => {
  test("no connections → no events", () => {
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    expect(listEvents().length).toBe(0);
  });

  test("disabled config → no events", () => {
    makeConnection(makeConfig({ enabled: false }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    expect(listEvents().length).toBe(0);
  });

  test("tile is not source → no events", () => {
    // Create connection where sourceTileId is tile_b but from_tile_id is set to targetTileId
    createConnection({
      tileAId: targetTileId,
      tileBId: sourceTileId,
      fromTileId: targetTileId,
      toTileId: sourceTileId,
      type: "message",
      kind: "message",
      config: { smartString: makeConfig() as unknown as Record<string, unknown> },
    });
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    expect(listEvents().length).toBe(0);
  });

  test("match miss → match event at debug level, no deliver event", () => {
    makeConnection(makeConfig());
    runSmartStringPipeline(sourceCtx, "no match here", noDeps);
    const events = listEvents();
    const matchEvt = events.find((e) => e.kind === "string.pipeline.match");
    expect(matchEvt).toBeDefined();
    expect(matchEvt?.level).toBe("debug");
    expect((matchEvt?.data as { matched: boolean }).matched).toBe(false);
    expect(events.find((e) => e.kind === "string.pipeline.deliver")).toBeUndefined();
  });

  test("match hit → match + transform + deliver events all logged", () => {
    makeConnection(makeConfig());
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    const events = listEvents();
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("string.pipeline.match");
    expect(kinds).toContain("string.pipeline.transform");
    expect(kinds).toContain("string.pipeline.deliver");
  });

  test("match event at info level when matched", () => {
    makeConnection(makeConfig());
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    const matchEvt = listEvents().find((e) => e.kind === "string.pipeline.match");
    expect(matchEvt?.level).toBe("info");
  });

  test("deliver event is ok:true for runtime-event target", () => {
    makeConnection(makeConfig({ target_adapter: "runtime-event" }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    const deliverEvt = listEvents().find((e) => e.kind === "string.pipeline.deliver");
    expect((deliverEvt?.data as { ok: boolean }).ok).toBe(true);
  });

  test("deliver event is ok:true for envoy-stub target", () => {
    makeConnection(makeConfig({ target_adapter: "envoy-shared-space" }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", noDeps);
    const deliverEvt = listEvents().find((e) => e.kind === "string.pipeline.deliver");
    expect((deliverEvt?.data as { ok: boolean }).ok).toBe(true);
  });

  test("terminal-pty delivery with active session writes to PTY", () => {
    activeSessions.add("sess-target");
    const deps: PipelineDeps = {
      getSessionForTile: (tileId) => (tileId === targetTileId ? "sess-target" : null),
      relayFn: noDeps.relayFn,
    };
    makeConnection(makeConfig({ target_adapter: "terminal-pty" }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", deps);
    expect(writtenSessions.length).toBe(1);
    expect(writtenSessions[0]?.sessionId).toBe("sess-target");
    const deliverEvt = listEvents().find((e) => e.kind === "string.pipeline.deliver");
    expect((deliverEvt?.data as { ok: boolean }).ok).toBe(true);
  });

  test("terminal-pty delivery with no active session logs ok:false deliver event", () => {
    const deps: PipelineDeps = {
      getSessionForTile: () => null,
      relayFn: noDeps.relayFn,
    };
    makeConnection(makeConfig({ target_adapter: "terminal-pty" }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", deps);
    const deliverEvt = listEvents().find((e) => e.kind === "string.pipeline.deliver");
    expect((deliverEvt?.data as { ok: boolean }).ok).toBe(false);
  });

  test("no match_rule → line always passes match stage and gets delivered", () => {
    makeConnection(makeConfig({ match_rule: undefined }));
    runSmartStringPipeline(sourceCtx, "any line at all", noDeps);
    const events = listEvents();
    expect(events.find((e) => e.kind === "string.pipeline.deliver")).toBeDefined();
    // No match event when match_rule is absent
    expect(events.find((e) => e.kind === "string.pipeline.match")).toBeUndefined();
  });

  test("agent-tile delivery calls relayFn", () => {
    let relayCalled = false;
    const deps: PipelineDeps = {
      getSessionForTile: noDeps.getSessionForTile,
      relayFn: (req) => {
        relayCalled = true;
        return { ok: true, formatted: req.text, eventId: "evt-1", message: "ok" };
      },
    };
    makeConnection(makeConfig({ target_adapter: "agent-tile" }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", deps);
    expect(relayCalled).toBe(true);
  });

  test("transform is applied before delivery", () => {
    const captured: string[] = [];
    const deps: PipelineDeps = {
      getSessionForTile: noDeps.getSessionForTile,
      relayFn: (req) => {
        captured.push(req.text);
        return { ok: true, formatted: req.text, eventId: "evt-1", message: "ok" };
      },
    };
    makeConnection(makeConfig({
      target_adapter: "agent-tile",
      transform: { type: "structured-message", template: ">> {text}" },
    }));
    runSmartStringPipeline(sourceCtx, "TRIGGER hello", deps);
    expect(captured[0]).toBe(">> TRIGGER hello");
  });
});
