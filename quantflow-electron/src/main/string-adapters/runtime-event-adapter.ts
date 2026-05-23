import { appendEvent } from "../runtime-state/events-repo";
import type { AdapterResult, DeliveryRequest } from "./types";

/**
 * Delivers a string pipeline output as a structured runtime event.
 * Useful when the "target" is the event log itself (e.g. for receipts or evidence).
 */
export function runtimeEventDeliver(req: DeliveryRequest): AdapterResult {
  const { ctx, text, config } = req;

  if (!text) {
    return { ok: false, code: "empty_text", message: "delivery text must not be empty" };
  }

  try {
    const event = appendEvent({
      kind: "string.deliver.runtime-event",
      tileId: ctx.tileId ?? null,
      cableId: ctx.connectionId,
      runId: ctx.runId ?? null,
      traceId: ctx.traceId ?? null,
      correlationId: ctx.correlationId ?? null,
      level: "info",
      data: {
        text,
        mode: config.mode,
        source_adapter: config.source_adapter ?? null,
        target_adapter: config.target_adapter ?? null,
      },
    });
    return { ok: true, detail: { eventId: event.id } };
  } catch (err) {
    return {
      ok: false,
      code: "event_write_failed",
      message: err instanceof Error ? err.message : "runtime-event adapter write failed",
    };
  }
}
