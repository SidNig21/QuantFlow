import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  _resetEveSupervisorForTests,
  ensureEveForActorKey,
  portForKey,
  stopEveForActorKey,
} from "./eve-supervisor.js";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.killCalled = false;
  child.kill = () => {
    child.killCalled = true;
    child.exitCode = 0;
  };
  return child;
}

test.afterEach(() => {
  _resetEveSupervisorForTests();
});

test("two distinct actor keys get different deterministic ports", () => {
  const first = portForKey(JSON.stringify(["ws", "tile-a"]));
  const second = portForKey(JSON.stringify(["ws", "tile-b"]));
  assert.notEqual(first, second);
  assert.equal(first, portForKey(JSON.stringify(["ws", "tile-a"])));
});

test("same actor key reuses the same Eve process/baseUrl", async () => {
  const children = [];
  const spawnImpl = () => {
    const child = fakeChild();
    children.push(child);
    return child;
  };
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const address = { workspaceId: "ws", tileId: "tile-a" };
  const first = await ensureEveForActorKey(address, { spawnImpl, fetchImpl, intervalMs: 1 });
  const second = await ensureEveForActorKey(address, { spawnImpl, fetchImpl, intervalMs: 1 });
  assert.equal(first.baseUrl, second.baseUrl);
  assert.equal(children.length, 1);
});

test("spawn/health failure surfaces an actionable error", async () => {
  const spawnImpl = () => fakeChild();
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => "nope" });
  await assert.rejects(
    () => ensureEveForActorKey(
      { workspaceId: "ws", tileId: "bad" },
      { spawnImpl, fetchImpl, timeoutMs: 5, intervalMs: 1, maxAttempts: 1 },
    ),
    /Eve failed for actor/,
  );
});

test("stopEveForActorKey releases the process slot", async () => {
  const child = fakeChild();
  const spawnImpl = () => child;
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const address = { workspaceId: "ws", tileId: "tile-stop" };
  await ensureEveForActorKey(address, { spawnImpl, fetchImpl, intervalMs: 1 });
  await stopEveForActorKey(address);
  assert.equal(child.killCalled, true);
});
