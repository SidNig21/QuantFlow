const DEFAULT_TERMINAL_READ_LINES = 400;

export const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_PATTERN, "");
}

function jsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function plainText(value) {
  return {
    content: [
      {
        type: "text",
        text: String(value ?? ""),
      },
    ],
  };
}

function metadataFromJson(metadataJson) {
  if (!metadataJson) return undefined;
  return JSON.parse(String(metadataJson));
}

function stringToBoolean(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true" || value === "1";
}

function normalizeTile(tile) {
  return {
    id: tile.id,
    type: tile.type,
    label: tile.userTitle || tile.autoTitle || tile.roleName || tile.id,
    routeHandle: tile.routeHandle,
    position: tile.position,
    size: tile.size,
    role: tile.roleName || tile.roleId || null,
    roleId: tile.roleId,
    ptySessionId: tile.ptySessionId,
    status: tile.ptyStatus || null,
    raw: tile,
  };
}

function normalizeCable(cable) {
  return {
    id: cable.id,
    sourceTileId: cable.sourceTileId || cable.tileAId,
    targetTileId: cable.targetTileId || cable.tileBId,
    label: cable.label || "",
    lastActivityTs: cable.lastActivityTs || cable.updatedAt || cable.createdAt || 0,
    raw: cable,
  };
}

function normalizeCableList(result) {
  const cables = Array.isArray(result?.cables)
    ? result.cables
    : Array.isArray(result)
      ? result
      : Array.isArray(result?.connections)
        ? result.connections
        : [];
  return { cables: cables.map(normalizeCable) };
}

async function findTile(rpc, tileId) {
  const result = await rpc("canvas.tileList", {});
  const tiles = Array.isArray(result?.tiles) ? result.tiles : [];
  return tiles.find((tile) => tile.id === tileId) || null;
}

async function removeCablesBetweenTiles(rpc, params) {
  const sourceTileId = String(params?.sourceTileId ?? "");
  const targetTileId = String(params?.targetTileId ?? "");
  const listed = normalizeCableList(await rpc("canvas.connectionList", {}));
  const matches = listed.cables.filter((cable) =>
    (cable.sourceTileId === sourceTileId && cable.targetTileId === targetTileId) ||
    (cable.sourceTileId === targetTileId && cable.targetTileId === sourceTileId)
  );
  const removed = [];
  for (const cable of matches) {
    await rpc("canvas.connectionRemove", { id: cable.id });
    removed.push(cable.id);
  }
  return { count: removed.length, removed };
}

async function injectContextIntoTile(rpc, params) {
  const tileId = String(params?.tileId ?? params?.targetTileId ?? "");
  const tile = await findTile(rpc, tileId);
  if (!tile) throw new Error(`Tile not found: ${tileId}`);
  if (!tile.ptySessionId) {
    throw new Error(`Tile ${tileId} has no PTY session for context injection`);
  }
  return rpc("context.inject", { sessionId: tile.ptySessionId });
}

export const TOOL_DEFINITIONS = [
  {
    name: "quantflow_ping",
    description: "Health check the QuantFlow relay connection",
    schema: {},
    handle: (rpc) => async () => jsonText(await rpc("ping", {})),
  },
  {
    name: "quantflow_tile_list",
    description: "List all QuantFlow tiles with routing and terminal metadata",
    schema: {},
    handle: (rpc) => async () => {
      const result = await rpc("canvas.tileList", {});
      return jsonText({
        tiles: (result?.tiles || []).map(normalizeTile),
      });
    },
  },
  {
    name: "quantflow_tile_create",
    description: "Create a tile on the QuantFlow canvas",
    schema: {
      type: { kind: "enum", values: ["term", "note", "code", "image"], default: "term" },
      x: { kind: "number", optional: true },
      y: { kind: "number", optional: true },
      width: { kind: "number", optional: true },
      height: { kind: "number", optional: true },
      role: { kind: "string", optional: true },
      filePath: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => {
      const rpcParams = {
        tileType: params.type || "term",
        ...(params.filePath ? { filePath: params.filePath } : {}),
        ...(Number.isFinite(params.x) && Number.isFinite(params.y)
          ? { position: { x: params.x, y: params.y } }
          : {}),
        ...(Number.isFinite(params.width) && Number.isFinite(params.height)
          ? { size: { width: params.width, height: params.height } }
          : {}),
        ...(params.role ? { role: params.role } : {}),
      };
      return jsonText(await rpc("canvas.tileCreate", rpcParams));
    },
  },
  {
    name: "quantflow_tile_remove",
    description: "Remove a QuantFlow tile by id",
    schema: { tileId: { kind: "string" } },
    handle: (rpc) => async ({ tileId }) =>
      jsonText(await rpc("canvas.tileRemove", { tileId })),
  },
  {
    name: "quantflow_tile_move",
    description: "Move a QuantFlow tile to a new canvas position",
    schema: {
      tileId: { kind: "string" },
      x: { kind: "number" },
      y: { kind: "number" },
    },
    handle: (rpc) => async ({ tileId, x, y }) =>
      jsonText(await rpc("canvas.tileMove", { tileId, position: { x, y } })),
  },
  {
    name: "quantflow_tile_resize",
    description: "Resize a QuantFlow tile",
    schema: {
      tileId: { kind: "string" },
      width: { kind: "number" },
      height: { kind: "number" },
    },
    handle: (rpc) => async ({ tileId, width, height }) =>
      jsonText(await rpc("canvas.tileResize", { tileId, size: { width, height } })),
  },
  {
    name: "quantflow_tile_focus",
    description: "Pan the viewport to center the given tile ids",
    schema: { tileIds: { kind: "stringArray" } },
    handle: (rpc) => async ({ tileIds }) =>
      jsonText(await rpc("canvas.tileFocus", { tileIds })),
  },
  {
    name: "quantflow_tile_rename",
    description: "Rename a tile display title while keeping its route handle stable",
    schema: {
      tileId: { kind: "string" },
      title: { kind: "string" },
    },
    handle: (rpc) => async ({ tileId, title }) =>
      jsonText(await rpc("canvas.tileRename", { tileId, title })),
  },
  {
    name: "quantflow_viewport_get",
    description: "Get QuantFlow canvas viewport position and zoom",
    schema: {},
    handle: (rpc) => async () => jsonText(await rpc("canvas.viewportGet", {})),
  },
  {
    name: "quantflow_viewport_set",
    description: "Set QuantFlow canvas viewport position and zoom",
    schema: {
      x: { kind: "number" },
      y: { kind: "number" },
      zoom: { kind: "number", default: 1 },
    },
    handle: (rpc) => async ({ x, y, zoom }) =>
      jsonText(await rpc("canvas.viewportSet", { pan: { x, y }, zoom })),
  },
  {
    name: "quantflow_terminal_write",
    description: "Write input text into a terminal tile PTY",
    schema: {
      tileId: { kind: "string" },
      input: { kind: "string" },
    },
    handle: (rpc) => async ({ tileId, input }) =>
      jsonText(await rpc("canvas.terminalWrite", { tileId, input })),
  },
  {
    name: "quantflow_terminal_read",
    description: "Read current visible output from a terminal tile with ANSI stripped",
    schema: {
      tileId: { kind: "string" },
      lines: { kind: "number", default: DEFAULT_TERMINAL_READ_LINES },
    },
    handle: (rpc) => async ({ tileId, lines = DEFAULT_TERMINAL_READ_LINES }) => {
      const result = await rpc("canvas.terminalRead", { tileId, lines });
      return plainText(stripAnsi(result?.output || ""));
    },
  },
  {
    name: "quantflow_cable_list",
    description: "List all QuantFlow cables",
    schema: {},
    handle: (rpc) => async () =>
      jsonText(normalizeCableList(await rpc("canvas.connectionList", {}))),
  },
  {
    name: "quantflow_cable_create",
    description: "Create a cable between two terminal tile ids",
    schema: {
      sourceTileId: { kind: "string" },
      targetTileId: { kind: "string" },
      label: { kind: "string", optional: true },
    },
    handle: (rpc) => async ({ sourceTileId, targetTileId, label }) =>
      jsonText(await rpc("canvas.connectionCreate", {
        tileAId: sourceTileId,
        tileBId: targetTileId,
        ...(label ? { label } : {}),
      })),
  },
  {
    name: "quantflow_cable_remove",
    description: "Remove a QuantFlow cable by id",
    schema: { cableId: { kind: "string" } },
    handle: (rpc) => async ({ cableId }) =>
      jsonText(await rpc("canvas.connectionRemove", { id: cableId })),
  },
  {
    name: "quantflow_cable_remove_between_tiles",
    description: "Remove all cables between two specific tile ids",
    schema: {
      sourceTileId: { kind: "string" },
      targetTileId: { kind: "string" },
    },
    handle: (rpc) => async (params) => jsonText(await removeCablesBetweenTiles(rpc, params)),
  },
  {
    name: "quantflow_cable_send",
    description: "Send a one-shot message through a cable from source to target",
    schema: {
      cableId: { kind: "string" },
      sourceTileId: { kind: "string" },
      message: { kind: "string" },
    },
    handle: (rpc) => async ({ cableId, sourceTileId, message }) =>
      jsonText(await rpc("relay.connectionSend", {
        connectionId: cableId,
        fromTileId: sourceTileId,
        text: message,
      })),
  },
  {
    name: "quantflow_role_list",
    description: "List available QuantFlow roles",
    schema: {},
    handle: (rpc) => async () => jsonText(await rpc("role.list", {})),
  },
  {
    name: "quantflow_role_spawn",
    description: "Spawn a new terminal tile with a QuantFlow role",
    schema: {
      roleId: { kind: "string" },
      x: { kind: "number", optional: true },
      y: { kind: "number", optional: true },
      width: { kind: "number", optional: true },
      height: { kind: "number", optional: true },
      cwd: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => {
      const role = await rpc("role.get", { id: params.roleId });
      if (!role) throw new Error(`Role not found: ${params.roleId}`);
      return jsonText(await rpc("canvas.roleSpawn", {
        role,
        ...(params.cwd ? { cwd: params.cwd } : {}),
        ...(Number.isFinite(params.x) && Number.isFinite(params.y)
          ? { position: { x: params.x, y: params.y } }
          : {}),
        ...(Number.isFinite(params.width) && Number.isFinite(params.height)
          ? { size: { width: params.width, height: params.height } }
          : {}),
      }));
    },
  },
  {
    name: "quantflow_orchestration_run_create",
    description: "Create a QuantFlow orchestration run",
    schema: {
      title: { kind: "string", optional: true },
      metadataJson: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("orchestration.runCreate", {
        ...(params.title ? { title: params.title } : {}),
        ...(params.metadataJson ? { metadata: metadataFromJson(params.metadataJson) } : {}),
      })),
  },
  {
    name: "quantflow_orchestration_run_get",
    description: "Get a QuantFlow orchestration run",
    schema: { runId: { kind: "string" } },
    handle: (rpc) => async ({ runId }) =>
      jsonText(await rpc("orchestration.runGet", { id: runId })),
  },
  {
    name: "quantflow_orchestration_run_list",
    description: "List QuantFlow orchestration runs",
    schema: {
      status: { kind: "string", optional: true },
      limit: { kind: "number", optional: true },
    },
    handle: (rpc) => async (params = {}) => {
      const rpcParams = {
        ...(params.status ? { status: params.status } : {}),
        ...(Number.isFinite(params.limit) ? { limit: params.limit } : {}),
      };
      return jsonText(await rpc("orchestration.runList", rpcParams));
    },
  },
  {
    name: "quantflow_orchestration_run_cancel",
    description: "Cancel a QuantFlow orchestration run",
    schema: { runId: { kind: "string" } },
    handle: (rpc) => async ({ runId }) =>
      jsonText(await rpc("orchestration.runCancel", { id: runId })),
  },
  {
    name: "quantflow_orchestration_capability_register",
    description: "Register a tile capability for orchestration routing",
    schema: {
      tileId: { kind: "string" },
      capability: { kind: "string" },
      schemaVersion: { kind: "string", optional: true },
      metadataJson: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("orchestration.capabilityRegister", {
        tileId: params.tileId,
        capability: params.capability,
        ...(params.schemaVersion ? { schemaVersion: params.schemaVersion } : {}),
        ...(params.metadataJson ? { metadata: metadataFromJson(params.metadataJson) } : {}),
      })),
  },
  {
    name: "quantflow_orchestration_capability_list",
    description: "List tile capabilities registered for orchestration routing",
    schema: {
      tileId: { kind: "string", optional: true },
      capability: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("orchestration.capabilityList", {
        ...(params.tileId ? { tileId: params.tileId } : {}),
        ...(params.capability ? { capability: params.capability } : {}),
      })),
  },
  {
    name: "quantflow_orchestration_resolve_route",
    description: "Resolve an orchestration capability to a tile route",
    schema: {
      capability: { kind: "string" },
      requireOnline: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("orchestration.resolveRoute", {
        capability: params.capability,
        requireOnline: stringToBoolean(params.requireOnline),
      })),
  },
  {
    name: "quantflow_orchestration_tile_heartbeat",
    description: "Update tile runtime heartbeat and presence",
    schema: {
      tileId: { kind: "string" },
      paneId: { kind: "string", optional: true },
      status: { kind: "string", optional: true },
      presence: { kind: "string", optional: true },
      metadataJson: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("orchestration.tileHeartbeat", {
        tileId: params.tileId,
        ...(params.paneId ? { paneId: params.paneId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.presence ? { presence: params.presence } : {}),
        ...(params.metadataJson ? { metadata: metadataFromJson(params.metadataJson) } : {}),
      })),
  },
  {
    name: "quantflow_context_pin",
    description: "Pin a vault file to the current workspace shared context",
    schema: { filePath: { kind: "string" } },
    handle: (rpc) => async ({ filePath }) =>
      jsonText(await rpc("context.pinFile", { filePath })),
  },
  {
    name: "quantflow_context_inject",
    description: "Inject composed shared context into a target terminal tile",
    schema: { tileId: { kind: "string" } },
    handle: (rpc) => async (params) => jsonText(await injectContextIntoTile(rpc, params)),
  },
  {
    name: "quantflow_watchtower_snapshot",
    description: "Return Watchtower agent state and recent relay events",
    schema: {},
    handle: (rpc) => async () => {
      const agents = await rpc("watchtower.snapshot", {});
      const recentRelays = await rpc("relay.log", { limit: 50 });
      return jsonText({
        agents,
        recentRelays,
        failedSends: (recentRelays || []).filter((entry) => entry?.ok === false),
        needsAttention: (agents || []).filter((agent) =>
          agent?.status === "waiting" ||
          agent?.status === "blocked" ||
          agent?.status === "exited"
        ),
      });
    },
  },
  {
    name: "quantflow_notify",
    description: "Send a desktop notification through QuantFlow",
    schema: {
      title: { kind: "string", default: "Hermes" },
      body: { kind: "string" },
    },
    handle: (rpc) => async ({ title = "Hermes", body }) =>
      jsonText(await rpc("app.notify", { title, body })),
  },
];

export function getToolDefinition(name) {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name) || null;
}
