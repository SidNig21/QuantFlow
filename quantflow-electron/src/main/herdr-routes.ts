/**
 * herdr-routes.ts — tile ↔ herdr pane identity links (v2).
 */

/** Maps tileId → herdr paneId for linked tiles */
const herdrLinks = new Map<string, string>();

type PendingReply = {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingReplies = new Map<string, PendingReply>();

export function resolveCorrelatedReply(
  correlationId: string,
  result: string,
): boolean {
  const pending = pendingReplies.get(correlationId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingReplies.delete(correlationId);
  pending.resolve(result);
  return true;
}

export function awaitCorrelatedReply(
  correlationId: string,
  timeoutMs = 30_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingReplies.delete(correlationId);
      reject(
        new Error(
          `Correlated reply timeout after ${timeoutMs}ms (correlation_id: ${correlationId})`,
        ),
      );
    }, timeoutMs);
    pendingReplies.set(correlationId, { resolve, reject, timer });
  });
}

export function registerHerdrPaneLink(tileId: string, paneId: string): void {
  herdrLinks.set(tileId, paneId);
}

export function unregisterHerdrPaneLink(tileId: string): void {
  herdrLinks.delete(tileId);
}

export function getHerdrPaneId(tileId: string): string | undefined {
  return herdrLinks.get(tileId);
}

/** Resets internal state — used only in tests */
export function _resetHerdrRoutesForTests(): void {
  herdrLinks.clear();
  pendingReplies.clear();
}
