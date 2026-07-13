import assert from "node:assert/strict";
import test from "node:test";
import { EveSessionBroker } from "./eve-session-broker.js";

test("serializes human and peer prompt delivery without owning an Eve cursor", async () => {
  const broker = new EveSessionBroker();
  broker.ensureTile({ tileId: "eve-b", baseUrl: "http://127.0.0.1:33101" });
  const order = [];
  let releaseFirst;
  const first = broker.enqueuePrompt("eve-b", async () => {
    order.push("human:start");
    await new Promise((resolve) => { releaseFirst = resolve; });
    order.push("human:end");
  });
  const second = broker.enqueuePrompt("eve-b", async () => {
    order.push("peer");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["human:start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["human:start", "human:end", "peer"]);

  const snapshot = broker.snapshot("eve-b");
  assert.equal(snapshot.baseUrl, "http://127.0.0.1:33101");
  assert.equal("continuationToken" in snapshot, false);
  assert.equal(snapshot.eventStartIndex, 0);
  assert.equal(snapshot.eventCount, snapshot.events.length);
  await broker.dispose();
});

test("tails the durable Eve stream from the reported session id", async () => {
  let firstRead = true;
  const broker = new EveSessionBroker({
    fetchImpl: async (_url, { signal } = {}) => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          if (!firstRead) {
            signal?.addEventListener("abort", () => controller.close(), { once: true });
            return;
          }
          firstRead = false;
          controller.enqueue(new TextEncoder().encode(
            `${JSON.stringify({ type: "message.appended", data: { messageDelta: "hello" } })}\n`
            + `${JSON.stringify({ type: "session.waiting", data: {} })}\n`,
          ));
          controller.close();
        },
      }),
    }),
  });
  broker.ensureTile({ tileId: "eve-b", baseUrl: "http://127.0.0.1:33101" });
  broker.registerSession({ tileId: "eve-b", eveSessionId: "eve-session-1" });

  for (let attempt = 0; attempt < 20 && broker.snapshot("eve-b").events.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const snapshot = broker.snapshot("eve-b");
  assert.equal(snapshot.eveSessionId, "eve-session-1");
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.phase, "idle");
  await broker.dispose();
});
