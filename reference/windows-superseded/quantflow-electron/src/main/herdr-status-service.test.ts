import { describe, expect, test } from "bun:test";
import { handleHerdrStatusEvent } from "./herdr-status-service";
import type { NormalizedHerdrStatusEvent } from "./herdr-event-normalize";

function makeEvent(
  overrides: Partial<NormalizedHerdrStatusEvent> = {},
): NormalizedHerdrStatusEvent {
  return {
    kind: "pane.agent_status_changed",
    paneId: "pane-1",
    fromStatus: "idle",
    toStatus: "working",
    raw: { type: "pane.agent_status_changed", pane_id: "pane-1" },
    ...overrides,
  };
}

describe("handleHerdrStatusEvent", () => {
  test("emits renderer payload and records transition metadata", () => {
    const payloads: Array<Record<string, unknown>> = [];
    const transitions: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];

    const payload = handleHerdrStatusEvent(makeEvent(), {
      getTileId: () => "tile-1",
      getPreviousStatus: () => "idle",
      onStatusChanged: (next) => payloads.push(next),
      recordTransition: (row) => transitions.push(row),
      recordEvent: (row) => events.push(row),
    });

    expect(payload).toMatchObject({
      paneId: "pane-1",
      tileId: "tile-1",
      status: "working",
      fromStatus: "idle",
    });
    expect(transitions).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(payloads).toHaveLength(1);
  });

  test("skips no-op status transitions", () => {
    const payloads: Array<Record<string, unknown>> = [];

    const payload = handleHerdrStatusEvent(makeEvent({ toStatus: "idle" }), {
      getPreviousStatus: () => "idle",
      onStatusChanged: (next) => payloads.push(next),
      recordTransition: () => {
        throw new Error("should not record");
      },
      recordEvent: () => {
        throw new Error("should not record");
      },
    });

    expect(payload).toBeNull();
    expect(payloads).toHaveLength(0);
  });
});
