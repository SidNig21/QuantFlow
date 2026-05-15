import assert from "node:assert/strict";
import test from "node:test";
import {
  TOOL_DEFINITIONS,
  getToolDefinition,
  stripAnsi,
} from "./tool-definitions.js";

const REQUIRED_TOOLS = [
  "quantflow_tile_list",
  "quantflow_tile_create",
  "quantflow_tile_remove",
  "quantflow_tile_move",
  "quantflow_tile_resize",
  "quantflow_tile_focus",
  "quantflow_tile_rename",
  "quantflow_viewport_get",
  "quantflow_viewport_set",
  "quantflow_terminal_write",
  "quantflow_terminal_read",
  "quantflow_cable_list",
  "quantflow_cable_create",
  "quantflow_cable_remove",
  "quantflow_cable_remove_between_tiles",
  "quantflow_cable_send",
  "quantflow_role_list",
  "quantflow_role_spawn",
  "quantflow_orchestration_run_create",
  "quantflow_orchestration_run_get",
  "quantflow_orchestration_run_list",
  "quantflow_orchestration_run_cancel",
  "quantflow_orchestration_capability_register",
  "quantflow_orchestration_capability_list",
  "quantflow_orchestration_resolve_route",
  "quantflow_orchestration_tile_heartbeat",
  "quantflow_context_pin",
  "quantflow_context_inject",
  "quantflow_watchtower_snapshot",
  "quantflow_notify",
  "quantflow_ping",
];

function makeRpcStub(results = {}) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    const result = results[method];
    return typeof result === "function" ? result(params) : result;
  };
  return { calls, rpc };
}

function textPayload(response) {
  return response.content[0].text;
}

test("defines every required QuantFlow MCP tool name", () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name).sort();
  assert.deepEqual(names, [...REQUIRED_TOOLS].sort());
});

test("maps tile create arguments to existing canvas.tileCreate RPC shape", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.tileCreate": { tileId: "tile-1" },
  });
  const tool = getToolDefinition("quantflow_tile_create");

  await tool.handle(rpc)({
    type: "term",
    x: 10,
    y: 20,
    width: 500,
    height: 300,
  });

  assert.deepEqual(calls, [
    {
      method: "canvas.tileCreate",
      params: {
        tileType: "term",
        position: { x: 10, y: 20 },
        size: { width: 500, height: 300 },
      },
    },
  ]);
});

test("maps cable send to one-shot relay.connectionSend", async () => {
  const { calls, rpc } = makeRpcStub({
    "relay.connectionSend": { ok: true },
  });
  const tool = getToolDefinition("quantflow_cable_send");

  await tool.handle(rpc)({
    cableId: "conn-1",
    sourceTileId: "tile-a",
    message: "run tests",
  });

  assert.deepEqual(calls, [
    {
      method: "relay.connectionSend",
      params: {
        connectionId: "conn-1",
        fromTileId: "tile-a",
        text: "run tests",
      },
    },
  ]);
});

test("maps orchestration run create to JSON-RPC", async () => {
  const { calls, rpc } = makeRpcStub({
    "orchestration.runCreate": { id: "run-1" },
  });
  const tool = getToolDefinition("quantflow_orchestration_run_create");

  await tool.handle(rpc)({
    title: "Scout run",
    metadataJson: "{\"phase\":\"7.5\"}",
  });

  assert.deepEqual(calls, [
    {
      method: "orchestration.runCreate",
      params: {
        title: "Scout run",
        metadata: { phase: "7.5" },
      },
    },
  ]);
});

test("maps orchestration route resolution to JSON-RPC", async () => {
  const { calls, rpc } = makeRpcStub({
    "orchestration.resolveRoute": { tileId: "tile-1" },
  });
  const tool = getToolDefinition("quantflow_orchestration_resolve_route");

  await tool.handle(rpc)({
    capability: "shell.exec",
    requireOnline: "true",
  });

  assert.deepEqual(calls, [
    {
      method: "orchestration.resolveRoute",
      params: {
        capability: "shell.exec",
        requireOnline: true,
      },
    },
  ]);
});

test("maps orchestration tile heartbeat to JSON-RPC", async () => {
  const { calls, rpc } = makeRpcStub({
    "orchestration.tileHeartbeat": { tile_id: "tile-1" },
  });
  const tool = getToolDefinition("quantflow_orchestration_tile_heartbeat");

  await tool.handle(rpc)({
    tileId: "tile-1",
    paneId: "pane-1",
    status: "ready",
    presence: "online",
    metadataJson: "{\"cwd\":\"/tmp\"}",
  });

  assert.deepEqual(calls, [
    {
      method: "orchestration.tileHeartbeat",
      params: {
        tileId: "tile-1",
        paneId: "pane-1",
        status: "ready",
        presence: "online",
        metadata: { cwd: "/tmp" },
      },
    },
  ]);
});

test("removes all cables between two tile ids in either direction", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.connectionList": [
      { id: "a", tileAId: "tile-1", tileBId: "tile-2" },
      { id: "b", tileAId: "tile-2", tileBId: "tile-1" },
      { id: "c", tileAId: "tile-1", tileBId: "tile-3" },
    ],
    "canvas.connectionRemove": { ok: true },
  });
  const tool = getToolDefinition("quantflow_cable_remove_between_tiles");

  const response = await tool.handle(rpc)({
    sourceTileId: "tile-1",
    targetTileId: "tile-2",
  });

  assert.deepEqual(JSON.parse(textPayload(response)), {
    count: 2,
    removed: ["a", "b"],
  });
  assert.deepEqual(calls.slice(1), [
    { method: "canvas.connectionRemove", params: { id: "a" } },
    { method: "canvas.connectionRemove", params: { id: "b" } },
  ]);
});

test("strips ANSI from terminal reads", async () => {
  assert.equal(stripAnsi("\u001b[31mred\u001b[0m"), "red");

  const { rpc } = makeRpcStub({
    "canvas.terminalRead": { output: "\u001b[32mgreen\u001b[0m" },
  });
  const tool = getToolDefinition("quantflow_terminal_read");

  const response = await tool.handle(rpc)({
    tileId: "tile-a",
  });

  assert.equal(textPayload(response), "green");
});

test("context inject resolves tile id to PTY session id", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.tileList": {
      tiles: [{ id: "tile-a", type: "term", ptySessionId: "session-a" }],
    },
    "context.inject": { ok: true },
  });
  const tool = getToolDefinition("quantflow_context_inject");

  await tool.handle(rpc)({ tileId: "tile-a" });

  assert.deepEqual(calls, [
    { method: "canvas.tileList", params: {} },
    { method: "context.inject", params: { sessionId: "session-a" } },
  ]);
});

test("covers tile create/remove lifecycle through MCP handlers", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.tileCreate": { tileId: "tile-created" },
    "canvas.tileRemove": { ok: true },
  });

  const create = getToolDefinition("quantflow_tile_create");
  const remove = getToolDefinition("quantflow_tile_remove");

  assert.deepEqual(
    JSON.parse(textPayload(await create.handle(rpc)({ type: "term" }))),
    { tileId: "tile-created" },
  );
  assert.deepEqual(
    JSON.parse(textPayload(await remove.handle(rpc)({ tileId: "tile-created" }))),
    { ok: true },
  );

  assert.deepEqual(calls, [
    {
      method: "canvas.tileCreate",
      params: { tileType: "term" },
    },
    {
      method: "canvas.tileRemove",
      params: { tileId: "tile-created" },
    },
  ]);
});

test("covers cable create/remove lifecycle through MCP handlers", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.connectionCreate": { id: "conn-created" },
    "canvas.connectionRemove": { ok: true },
  });

  const create = getToolDefinition("quantflow_cable_create");
  const remove = getToolDefinition("quantflow_cable_remove");

  assert.deepEqual(
    JSON.parse(textPayload(await create.handle(rpc)({
      sourceTileId: "tile-a",
      targetTileId: "tile-b",
      label: "delegate",
    }))),
    { id: "conn-created" },
  );
  assert.deepEqual(
    JSON.parse(textPayload(await remove.handle(rpc)({ cableId: "conn-created" }))),
    { ok: true },
  );

  assert.deepEqual(calls, [
    {
      method: "canvas.connectionCreate",
      params: {
        tileAId: "tile-a",
        tileBId: "tile-b",
        label: "delegate",
      },
    },
    {
      method: "canvas.connectionRemove",
      params: { id: "conn-created" },
    },
  ]);
});

test("covers terminal write/read round-trip through MCP handlers", async () => {
  const { calls, rpc } = makeRpcStub({
    "canvas.terminalWrite": { ok: true },
    "canvas.terminalRead": { output: "\u001b[36mstarted training\u001b[0m" },
  });

  const write = getToolDefinition("quantflow_terminal_write");
  const read = getToolDefinition("quantflow_terminal_read");

  assert.deepEqual(
    JSON.parse(textPayload(await write.handle(rpc)({
      tileId: "tile-worker",
      input: "python train.py\n",
    }))),
    { ok: true },
  );
  assert.equal(
    textPayload(await read.handle(rpc)({
      tileId: "tile-worker",
      lines: 400,
    })),
    "started training",
  );

  assert.deepEqual(calls, [
    {
      method: "canvas.terminalWrite",
      params: {
        tileId: "tile-worker",
        input: "python train.py\n",
      },
    },
    {
      method: "canvas.terminalRead",
      params: {
        tileId: "tile-worker",
        lines: 400,
      },
    },
  ]);
});
