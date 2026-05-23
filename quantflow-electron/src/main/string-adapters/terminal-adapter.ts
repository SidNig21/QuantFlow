import { listSessions, writeToSession } from "../pty";
import type { AdapterResult, DeliveryRequest } from "./types";

/**
 * Delivers text to a target tile's PTY stdin.
 * Uses the same writeToSession path as the legacy relay.
 * herdr is not involved — node-pty remains the terminal backend.
 */
export function terminalPtyDeliver(req: DeliveryRequest): AdapterResult {
  const targetTileId = req.targetTileId;
  if (!targetTileId) {
    return {
      ok: false,
      code: "missing_target_tile",
      message: "terminal-pty adapter requires targetTileId",
    };
  }

  const text = String(req.text ?? "");
  if (!text) {
    return { ok: false, code: "empty_text", message: "delivery text must not be empty" };
  }

  // Caller must supply the sessionId via detail or resolve externally.
  // The pipeline resolves sessionId from the tile registry before calling this.
  const sessionId = (req.config.metadata?.["sessionId"] as string | undefined) ?? "";
  if (!sessionId) {
    return {
      ok: false,
      code: "missing_session",
      message: `No PTY session known for tile ${targetTileId}; ensure tile is registered`,
    };
  }

  if (!listSessions().includes(sessionId)) {
    return {
      ok: false,
      code: "session_not_active",
      message: `PTY session ${sessionId} is not active`,
      detail: { sessionId, targetTileId },
    };
  }

  try {
    writeToSession(sessionId, text.endsWith("\n") ? text : text + "\n");
    return { ok: true, detail: { sessionId, targetTileId, bytes: text.length } };
  } catch (err) {
    return {
      ok: false,
      code: "write_failed",
      message: err instanceof Error ? err.message : "PTY write failed",
      detail: { sessionId, targetTileId },
    };
  }
}
