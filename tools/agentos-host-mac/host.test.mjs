import assert from "node:assert/strict";
import test from "node:test";
import { makeHealth, runtimeConfig } from "./host.js";

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
