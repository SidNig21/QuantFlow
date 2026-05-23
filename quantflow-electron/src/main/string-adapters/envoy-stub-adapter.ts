import { appendEvent } from "../runtime-state/events-repo";
import type { AdapterResult, DeliveryRequest } from "./types";

/**
 * Stub for the Envoy/shared-space target adapter.
 * Real persistence (shared_spaces + shared_space_entries tables) lands in Goal 5.5b T006.
 * This stub logs a runtime event so the pipeline does not silently drop deliveries.
 */
export function envoyStubDeliver(req: DeliveryRequest): AdapterResult {
  const { ctx, text, config } = req;

  if (!text) {
    return { ok: false, code: "empty_text", message: "delivery text must not be empty" };
  }

  try {
    const event = appendEvent({
      kind: "string.deliver.envoy-stub",
      tileId: ctx.tileId ?? null,
      cableId: ctx.connectionId,
      runId: ctx.runId ?? null,
      traceId: ctx.traceId ?? null,
      correlationId: ctx.correlationId ?? null,
      level: "warn",
      data: {
        stub: true,
        text,
        mode: config.mode,
        source_adapter: config.source_adapter ?? null,
        target_adapter: config.target_adapter ?? null,
        note: "envoy-shared-space persistence deferred to Goal 5.5b",
      },
    });
    return { ok: true, detail: { stub: true, eventId: event.id } };
  } catch (err) {
    return {
      ok: false,
      code: "stub_event_write_failed",
      message: err instanceof Error ? err.message : "envoy stub adapter event write failed",
    };
  }
}
