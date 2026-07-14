import assert from "node:assert/strict";
import test from "node:test";
import { makeHealth, makeServer, runtimeConfig } from "./host.js";

test("runtime is permanently loopback-bound and has distinct ports", () => {
  const config = runtimeConfig({ QUANTFLOW_RUNTIME_PORT: "8100", QUANTFLOW_EVE_PORT: "8105" });
  assert.equal(config.bind, "127.0.0.1");
  assert.equal(config.port, 8100);
  assert.equal(config.evePort, 8105);
});

test("health refuses to call a credentialless runtime promptable", () => {
  const runtime = { eve: { state: "ready", error: null }, agentos: { state: "ready", error: null } };
  const health = makeHealth(runtime);
  assert.equal(health.ok, true);
  assert.equal(health.promptable, false);
  assert.equal(health.state, "not_promptable");
});

test("terminal routes require the exact Eve workspace, tile, and session identity", async () => {
  const calls = [];
  const runtime = {
    config: { bind: "127.0.0.1", port: 0 },
    eve: { state: "ready", error: null },
    agentos: {
      async openTerminal(value) { calls.push(["open", value]); return { shellID: "shell-a", cursor: 4 }; },
      readTerminal(value) { calls.push(["read", value]); return { shellID: "shell-a", start: 0, cursor: 9, data: "ready", reset: false, closed: false }; },
      async writeTerminal(value) { calls.push(["write", value]); },
      async resizeTerminal(value) { calls.push(["resize", value]); },
    },
  };
  const server = makeServer(runtime);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/v1/agentos/eve-session/session-a/terminal`;
  try {
    const opened = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceID: "workflow-a", tileID: "tile-a", cols: 100, rows: 30 }),
    });
    assert.deepEqual(await opened.json(), { shellID: "shell-a", cursor: 4 });

    const read = await fetch(`${base}/shell-a/read?workspaceID=workflow-a&tileID=tile-a&cursor=4`);
    assert.deepEqual(await read.json(), { shellID: "shell-a", start: 0, cursor: 9, data: "ready", reset: false, closed: false });

    const write = await fetch(`${base}/shell-a/write`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceID: "workflow-a", tileID: "tile-a", data: "pwd\\r" }),
    });
    assert.deepEqual(await write.json(), { ok: true });
    assert.deepEqual(calls, [
      ["open", { workspaceID: "workflow-a", tileID: "tile-a", sessionID: "session-a", cols: 100, rows: 30 }],
      ["read", { workspaceID: "workflow-a", tileID: "tile-a", sessionID: "session-a", shellID: "shell-a", cursor: 4 }],
      ["write", { workspaceID: "workflow-a", tileID: "tile-a", sessionID: "session-a", shellID: "shell-a", data: "pwd\\r" }],
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
