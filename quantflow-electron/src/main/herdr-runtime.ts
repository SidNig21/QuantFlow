/**
 * Herdr runtime bootstrap: ensure server is up, then start event subscription.
 */

import { appendEvent } from "./runtime-state/events-repo";
import {
  ensureHerdrServer,
  type HerdrBootstrapResult,
} from "./herdr-server-bootstrap";
import { startHerdrStatusService } from "./herdr-status-service";

function logBootstrapResult(result: HerdrBootstrapResult): void {
  const prefix = "[herdr-bootstrap]";
  if (result.state === "failed") {
    console.warn(`${prefix} ${result.message}`);
    return;
  }
  console.log(
    `${prefix} ${result.message}` +
    (result.socketPath ? ` (${result.socketPath}, ${result.durationMs}ms)` : ""),
  );
}

export async function bootstrapHerdrRuntime(): Promise<HerdrBootstrapResult> {
  const result = await ensureHerdrServer();
  logBootstrapResult(result);

  appendEvent({
    kind: "herdr.bootstrap",
    level: result.state === "failed" ? "warn" : "info",
    data: {
      state: result.state,
      message: result.message,
      socket_path: result.socketPath,
      duration_ms: result.durationMs,
    },
  });

  startHerdrStatusService();
  return result;
}
