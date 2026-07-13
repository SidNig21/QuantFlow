/**
 * Read-only Eve session projection for QuantFlow tiles.
 *
 * The ACP adapter owns Eve POSTs and the continuation cursor.  This broker
 * only serializes delivery onto AgentOS's prompt rail and tails Eve's public
 * stream, so a peer turn and a human turn cannot race each other without
 * introducing a second Eve writer.
 */

function normalizedUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
}

async function* readNdjson(response) {
  if (!response.body) return;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield JSON.parse(buffer.trim());
}

export class EveSessionBroker {
  constructor({ fetchImpl = globalThis.fetch, onUpdate = () => {} } = {}) {
    this.fetch = fetchImpl;
    this.onUpdate = onUpdate;
    this.tiles = new Map();
  }

  ensureTile({ tileId, baseUrl }) {
    const id = String(tileId ?? "").trim();
    const host = normalizedUrl(baseUrl);
    if (!id) throw new Error("tileId required for Eve session broker");
    if (!host) throw new Error("baseUrl required for Eve session broker");
    const current = this.tiles.get(id);
    if (current) {
      current.baseUrl = host;
      return current;
    }
    const record = {
      tileId: id,
      baseUrl: host,
      eveSessionId: null,
      events: [],
      revision: 0,
      phase: "idle",
      error: null,
      tailAbort: null,
      tailPromise: null,
      queue: Promise.resolve(),
    };
    this.tiles.set(id, record);
    this.publish(record);
    return record;
  }

  registerSession({ tileId, eveSessionId }) {
    const id = String(tileId ?? "").trim();
    const sessionId = String(eveSessionId ?? "").trim();
    const record = this.tiles.get(id);
    if (!record) throw new Error(`Eve session broker has no tile registration: ${id}`);
    if (!sessionId) throw new Error("eveSessionId required for Eve session broker");
    if (record.eveSessionId && record.eveSessionId !== sessionId) {
      throw new Error(`Eve session broker refuses to replace the live session for tile ${id}`);
    }
    if (record.eveSessionId === sessionId) return this.snapshot(id);
    record.eveSessionId = sessionId;
    record.error = null;
    this.publish(record);
    this.startTail(record);
    return this.snapshot(id);
  }

  enqueuePrompt(tileId, operation) {
    const record = this.requireTile(tileId);
    const run = async () => {
      record.phase = "working";
      record.error = null;
      this.publish(record);
      try {
        const result = await operation();
        // The Eve stream will normally publish session.waiting before this
        // returns. Set idle here too so transport failures cannot strand the
        // visible tile in a fake working state.
        if (record.phase === "working") {
          record.phase = "idle";
          this.publish(record);
        }
        return result;
      } catch (error) {
        record.phase = "error";
        record.error = error instanceof Error ? error.message : String(error);
        this.publish(record);
        throw error;
      }
    };
    const queued = record.queue.then(run, run);
    record.queue = queued.catch(() => {});
    return queued;
  }

  snapshot(tileId, { startIndex = 0 } = {}) {
    const record = this.requireTile(tileId);
    const safeStartIndex = Number.isInteger(startIndex) && startIndex >= 0
      ? Math.min(startIndex, record.events.length)
      : 0;
    return {
      tileId: record.tileId,
      baseUrl: record.baseUrl,
      eveSessionId: record.eveSessionId,
      initialSession: record.eveSessionId
        ? { sessionId: record.eveSessionId, streamIndex: 0 }
        : null,
      eventStartIndex: safeStartIndex,
      eventCount: record.events.length,
      events: record.events.slice(safeStartIndex),
      revision: record.revision,
      phase: record.phase,
      error: record.error,
    };
  }

  async dispose() {
    for (const record of this.tiles.values()) record.tailAbort?.abort();
    await Promise.allSettled([...this.tiles.values()].map((record) => record.tailPromise));
    this.tiles.clear();
  }

  requireTile(tileId) {
    const record = this.tiles.get(String(tileId ?? "").trim());
    if (!record) throw new Error(`Eve session broker has no tile registration: ${tileId}`);
    return record;
  }

  publish(record) {
    record.revision += 1;
    this.onUpdate(this.snapshot(record.tileId));
  }

  startTail(record) {
    if (record.tailPromise || !record.eveSessionId) return;
    const controller = new AbortController();
    record.tailAbort = controller;
    record.tailPromise = this.tail(record, controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) return;
        record.phase = "error";
        record.error = error instanceof Error ? error.message : String(error);
        this.publish(record);
      })
      .finally(() => {
        if (record.tailAbort === controller) record.tailAbort = null;
        record.tailPromise = null;
      });
  }

  async tail(record, signal) {
    while (!signal.aborted && record.eveSessionId) {
      const startIndex = record.events.length;
      const response = await this.fetch(
        `${record.baseUrl}/eve/v1/session/${encodeURIComponent(record.eveSessionId)}/stream?startIndex=${startIndex}`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(`Eve session stream failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
      }
      for await (const event of readNdjson(response)) {
        record.events.push(event);
        if (event?.type === "session.waiting" || event?.type === "turn.completed") {
          record.phase = "idle";
        } else if (event?.type === "session.failed" || event?.type === "turn.failed") {
          record.phase = "error";
          record.error = event?.data?.message ?? event.type;
        }
        this.publish(record);
      }
      // Eve may close a completed stream. Reopen at the next index to tail
      // the same durable session when a later AgentOS prompt arrives.
      if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
