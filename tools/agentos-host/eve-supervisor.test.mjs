import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  _resetEveSupervisorForTests,
  ensureEveForActorKey,
  portForKey,
  prewarmEve,
  stopEveForActorKey,
  stopWarmEve,
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

test("new actor key adopts the warm instance and a replacement starts warming", async () => {
  const children = [];
  const spawnImpl = () => {
    const child = fakeChild();
    children.push(child);
    return child;
  };
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const warmEntry = await prewarmEve({ spawnImpl, fetchImpl, intervalMs: 1 });
  assert.equal(children.length, 1);

  const adopted = await ensureEveForActorKey(
    { workspaceId: "ws", tileId: "tile-warm" },
    { spawnImpl, fetchImpl, intervalMs: 1 },
  );
  assert.equal(adopted.adopted, true);
  assert.equal(adopted.baseUrl, warmEntry.baseUrl);
  assert.equal(adopted.keyId, JSON.stringify(["ws", "tile-warm"]));
  // one warm boot + one replacement warm boot; no cold boot for the tile
  assert.equal(children.length, 2);
  await stopWarmEve();
});

test("second spawn adopts the replacement warm instance", async () => {
  const children = [];
  const spawnImpl = () => {
    const child = fakeChild();
    children.push(child);
    return child;
  };
  const fetchImpl = async () => ({ ok: true, status: 200 });
  await prewarmEve({ spawnImpl, fetchImpl, intervalMs: 1 });
  const first = await ensureEveForActorKey(
    { workspaceId: "ws", tileId: "tile-1" },
    { spawnImpl, fetchImpl, intervalMs: 1 },
  );
  const second = await ensureEveForActorKey(
    { workspaceId: "ws", tileId: "tile-2" },
    { spawnImpl, fetchImpl, intervalMs: 1 },
  );
  assert.equal(second.adopted, true);
  assert.notEqual(second.baseUrl, first.baseUrl);
  // warm + replacement + second replacement = 3 spawns, zero cold boots
  assert.equal(children.length, 3);
  await stopWarmEve();
});

test("EVE_WARM_POOL=0 disables the pool and keeps the cold path", async () => {
  process.env.EVE_WARM_POOL = "0";
  try {
    const children = [];
    const spawnImpl = () => {
      const child = fakeChild();
      children.push(child);
      return child;
    };
    const fetchImpl = async () => ({ ok: true, status: 200 });
    assert.equal(prewarmEve({ spawnImpl, fetchImpl, intervalMs: 1 }), null);
    const entry = await ensureEveForActorKey(
      { workspaceId: "ws", tileId: "tile-cold" },
      { spawnImpl, fetchImpl, intervalMs: 1 },
    );
    assert.equal(entry.adopted, undefined);
    assert.equal(children.length, 1);
  } finally {
    delete process.env.EVE_WARM_POOL;
  }
});

test("failed warm boot falls back to the cold path", async () => {
  let warmPhase = true;
  const spawnImpl = () => fakeChild();
  const fetchImpl = async () => {
    // every poll during the warm boot fails; cold boot succeeds
    if (warmPhase) return { ok: false, status: 503, text: async () => "warm down" };
    return { ok: true, status: 200 };
  };
  const warmReady = prewarmEve({ spawnImpl, fetchImpl, intervalMs: 1, timeoutMs: 5, maxAttempts: 1 });
  await warmReady.catch(() => {});
  warmPhase = false;
  const entry = await ensureEveForActorKey(
    { workspaceId: "ws", tileId: "tile-fallback" },
    { spawnImpl, fetchImpl, intervalMs: 1 },
  );
  assert.equal(entry.adopted, undefined);
  assert.equal(entry.keyId, JSON.stringify(["ws", "tile-fallback"]));
  await stopWarmEve();
});

test("warm generations use distinct ports so adopted instances never collide", async () => {
  const ports = [];
  const spawnImpl = () => fakeChild();
  const fetchImpl = async () => ({ ok: true, status: 200 });
  await prewarmEve({ spawnImpl, fetchImpl, intervalMs: 1 });
  const a = await ensureEveForActorKey({ workspaceId: "ws", tileId: "p1" }, { spawnImpl, fetchImpl, intervalMs: 1 });
  ports.push(a.port);
  const b = await ensureEveForActorKey({ workspaceId: "ws", tileId: "p2" }, { spawnImpl, fetchImpl, intervalMs: 1 });
  ports.push(b.port);
  assert.equal(new Set(ports).size, ports.length);
  await stopWarmEve();
});
