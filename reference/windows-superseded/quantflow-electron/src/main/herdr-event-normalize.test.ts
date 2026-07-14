import { describe, expect, test } from "bun:test";
import {
  coerceHerdrAgentStatus,
  isHerdrSubscriptionAck,
  normalizeHerdrEventLine,
  parseHerdrEventLine,
} from "./herdr-event-normalize";

describe("herdr-event-normalize", () => {
  test("coerces known agent statuses and falls back to unknown", () => {
    expect(coerceHerdrAgentStatus("working")).toBe("working");
    expect(coerceHerdrAgentStatus("nope")).toBe("unknown");
  });

  test("detects subscription ack frames", () => {
    expect(isHerdrSubscriptionAck({
      id: "sub_1",
      result: { type: "subscription_ack" },
    })).toBe(true);
    expect(isHerdrSubscriptionAck({
      event: { type: "pane.agent_status_changed", pane_id: "1-1" },
    })).toBe(false);
  });

  test("normalizes wrapped pane.agent_status_changed events", () => {
    const normalized = normalizeHerdrEventLine({
      event: {
        type: "pane.agent_status_changed",
        pane_id: "pane-1",
        agent_status: "working",
        previous_agent_status: "idle",
      },
    });

    expect(normalized).toEqual({
      kind: "pane.agent_status_changed",
      paneId: "pane-1",
      fromStatus: "idle",
      toStatus: "working",
      raw: {
        type: "pane.agent_status_changed",
        pane_id: "pane-1",
        agent_status: "working",
        previous_agent_status: "idle",
      },
    });
  });

  test("normalizes bare pushed event lines", () => {
    const normalized = normalizeHerdrEventLine({
      type: "pane.agent_status_changed",
      paneId: "pane-2",
      toStatus: "done",
      fromStatus: "working",
    });

    expect(normalized?.paneId).toBe("pane-2");
    expect(normalized?.toStatus).toBe("done");
    expect(normalized?.fromStatus).toBe("working");
  });

  test("ignores unrelated RPC responses", () => {
    expect(normalizeHerdrEventLine({
      id: "req_1",
      result: { type: "pong" },
    })).toBeNull();
  });

  test("parseHerdrEventLine returns null for invalid JSON", () => {
    expect(parseHerdrEventLine("not-json")).toBeNull();
    expect(parseHerdrEventLine('{"type":"pane.agent_status_changed"}')).toEqual({
      type: "pane.agent_status_changed",
    });
  });
});
