import type { AdapterResult, DeliveryRequest } from "./types";

/**
 * Delivers a structured message to an agent tile.
 * In 5.5a this routes through the relay's relayConnectionMessage path,
 * which handles both the herdr and legacy PTY delivery forks internally.
 * The pipeline calls this after building the delivery text.
 */
export function agentTileDeliver(
  req: DeliveryRequest,
  relayFn: (params: {
    connectionId: string;
    fromTileId: string;
    text: string;
  }) => { ok: boolean; message: string; eventId?: string },
): AdapterResult {
  const { ctx, text, config } = req;
  if (!ctx.connectionId) {
    return { ok: false, code: "missing_connection_id", message: "connectionId required for agent-tile adapter" };
  }
  if (!ctx.tileId) {
    return { ok: false, code: "missing_source_tile", message: "source tileId required for agent-tile adapter" };
  }
  if (!text) {
    return { ok: false, code: "empty_text", message: "delivery text must not be empty" };
  }

  try {
    const result = relayFn({
      connectionId: ctx.connectionId,
      fromTileId: ctx.tileId,
      text,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: "relay_failed",
        message: result.message,
        detail: { connectionId: ctx.connectionId, mode: config.mode },
      };
    }
    return { ok: true, detail: { eventId: result.eventId } };
  } catch (err) {
    return {
      ok: false,
      code: "relay_error",
      message: err instanceof Error ? err.message : "agent-tile relay error",
    };
  }
}
