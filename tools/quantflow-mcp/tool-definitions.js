const DEFAULT_TERMINAL_READ_LINES = 400;
const DEFAULT_PTY_EXPECT_TIMEOUT_MS = 10_000;
const DEFAULT_PTY_EXPECT_INTERVAL_MS = 250;

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

function optionalJsonArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return undefined;
  const parsed = JSON.parse(String(value));
  return Array.isArray(parsed) ? parsed.map(String) : undefined;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textAfterMarker(text, marker) {
  if (!marker) return text;
  const index = text.lastIndexOf(marker);
  if (index === -1) return "";
  return text.slice(index + marker.length);
}

function outputTail(text, maxChars = 4000) {
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
}

function patternMatches(text, pattern, mode) {
  if (mode === "regex") {
    return new RegExp(pattern, "m").test(text);
  }
  return text.includes(pattern);
}

function normalizeTile(tile) {
  const displayName =
    tile.displayName ||
    tile.userTitle ||
    tile.autoTitle ||
    tile.roleName ||
    tile.id;
  return {
    tileId: tile.id,
    id: tile.id,
    displayName,
    type: tile.type,
    label: displayName,
    herdrPaneId: tile.herdrPaneId ?? null,
    herdrAgentName: tile.herdrAgentName ?? null,
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

async function routeTask(rpc, params = {}) {
  const metadata = params.metadataJson ? metadataFromJson(params.metadataJson) : undefined;
  const route = await rpc("orchestration.resolveRoute", {
    capability: params.capability,
    requireOnline: stringToBoolean(params.requireOnline),
  });
  return {
    task: params.task || null,
    capability: params.capability,
    metadata,
    route,
  };
}

function browserSnapshotText(snapshot, info) {
  if (typeof snapshot === "string") return snapshot;
  if (typeof snapshot?.text === "string") return snapshot.text;
  if (typeof snapshot?.markdown === "string") return snapshot.markdown;
  const parts = [
    info?.title,
    info?.url,
    snapshot?.title,
    snapshot?.url,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : JSON.stringify(snapshot ?? info ?? {}, null, 2);
}

async function readTile(rpc, params = {}) {
  const tileId = String(params.tileId ?? "");
  const tile = await findTile(rpc, tileId);
  if (!tile) throw new Error(`Tile not found: ${tileId}`);

  const requestedMode = params.mode || "auto";
  const readMode = requestedMode === "auto"
    ? tile.type === "browser"
      ? "browser"
      : tile.type === "term" || tile.ptySessionId
        ? "terminal"
        : "metadata"
    : requestedMode;
  const includeRaw = stringToBoolean(params.includeRaw);

  if (readMode === "terminal") {
    const lines = positiveNumber(params.lines, DEFAULT_TERMINAL_READ_LINES);
    const result = await rpc("canvas.terminalRead", { tileId, lines });
    return {
      tile: normalizeTile(tile),
      readType: "terminal",
      text: stripAnsi(result?.output || ""),
      ...(includeRaw ? { raw: result } : {}),
    };
  }

  if (readMode === "browser") {
    const [snapshot, info] = await Promise.all([
      rpc("canvas.browserSnapshot", { tileId }),
      rpc("canvas.browserInfo", { tileId }),
    ]);
    return {
      tile: normalizeTile(tile),
      readType: "browser",
      text: browserSnapshotText(snapshot, info),
      snapshot,
      info,
    };
  }

  return {
    tile: normalizeTile(tile),
    readType: "metadata",
    text: "",
    unsupported: true,
    reason: `No content read adapter is available for tile type ${tile.type}`,
    ...(includeRaw ? { raw: tile } : {}),
  };
}

async function expectPty(rpc, params = {}) {
  const tileId = String(params.tileId ?? "");
  const pattern = String(params.pattern ?? "");
  const matchMode = params.matchMode === "regex" ? "regex" : "contains";
  const timeoutMs = positiveNumber(params.timeoutMs, DEFAULT_PTY_EXPECT_TIMEOUT_MS);
  const intervalMs = positiveNumber(params.intervalMs, DEFAULT_PTY_EXPECT_INTERVAL_MS);
  const lines = positiveNumber(params.lines, DEFAULT_TERMINAL_READ_LINES);
  const shouldStripAnsi = params.stripAnsi === undefined || stringToBoolean(params.stripAnsi);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastOutput = "";

  do {
    attempts += 1;
    const result = await rpc("canvas.terminalRead", { tileId, lines });
    const output = String(result?.output ?? "");
    const cleanOutput = shouldStripAnsi ? stripAnsi(output) : output;
    const searchable = textAfterMarker(cleanOutput, params.afterText);
    lastOutput = cleanOutput;
    if (patternMatches(searchable, pattern, matchMode)) {
      return {
        ok: true,
        matched: true,
        tileId,
        pattern,
        matchMode,
        attempts,
        elapsedMs: Date.now() - startedAt,
        staleOutputPolicy: params.afterText
          ? "searched captured output after the provided afterText marker"
          : "canvas.terminalRead has no timestamps; searched current captured buffer",
        output: outputTail(searchable),
      };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  } while (true);

  return {
    ok: false,
    matched: false,
    timedOut: true,
    tileId,
    pattern,
    matchMode,
    attempts,
    timeoutMs,
    staleOutputPolicy: params.afterText
      ? "searched captured output after the provided afterText marker"
      : "canvas.terminalRead has no timestamps; searched current captured buffer",
    lastOutput: outputTail(lastOutput),
  };
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
    name: "quantflow_route_task",
    description: "Resolve a task capability to the current best QuantFlow route",
    schema: {
      capability: { kind: "string" },
      task: { kind: "string", optional: true },
      requireOnline: { kind: "string", optional: true },
      metadataJson: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => jsonText(await routeTask(rpc, params)),
  },
  {
    name: "quantflow_tile_read",
    description: "Read a terminal or browser tile through existing QuantFlow RPC surfaces",
    schema: {
      tileId: { kind: "string" },
      mode: { kind: "enum", values: ["auto", "terminal", "browser"], default: "auto" },
      lines: { kind: "number", default: DEFAULT_TERMINAL_READ_LINES },
      includeRaw: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => jsonText(await readTile(rpc, params)),
  },
  {
    name: "quantflow_pty_write",
    description: "Write input to a terminal tile PTY, optionally appending a newline",
    schema: {
      tileId: { kind: "string" },
      input: { kind: "string" },
      appendNewline: { kind: "string", optional: true },
    },
    handle: (rpc) => async ({ tileId, input, appendNewline }) => {
      const text = stringToBoolean(appendNewline) && !String(input).endsWith("\n")
        ? `${input}\n`
        : input;
      const result = await rpc("canvas.terminalWrite", { tileId, input: text });
      return jsonText({
        ok: true,
        tileId,
        inputBytes: Buffer.byteLength(String(text), "utf8"),
        result,
      });
    },
  },
  {
    name: "quantflow_pty_expect",
    description: "Poll a terminal tile PTY until output contains text or matches a regex",
    schema: {
      tileId: { kind: "string" },
      pattern: { kind: "string" },
      matchMode: { kind: "enum", values: ["contains", "regex"], default: "contains" },
      timeoutMs: { kind: "number", default: DEFAULT_PTY_EXPECT_TIMEOUT_MS },
      intervalMs: { kind: "number", default: DEFAULT_PTY_EXPECT_INTERVAL_MS },
      lines: { kind: "number", default: DEFAULT_TERMINAL_READ_LINES },
      afterText: { kind: "string", optional: true },
      stripAnsi: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => jsonText(await expectPty(rpc, params)),
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
    name: "qf_envoy_space_status",
    description: "Get QuantFlow Envoy space status for a canvas",
    schema: {
      canvasId: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.spaceStatus", {
        ...(params.canvasId ? { canvasId: params.canvasId } : {}),
      })),
  },
  {
    name: "qf_task_list",
    description: "List QuantFlow Envoy tasks",
    schema: {
      canvasId: { kind: "string", optional: true },
      status: { kind: "string", optional: true },
      targetTileId: { kind: "string", optional: true },
      sourceTileId: { kind: "string", optional: true },
      correlationId: { kind: "string", optional: true },
      connectionId: { kind: "string", optional: true },
      limit: { kind: "number", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskList", {
        ...(params.canvasId ? { canvasId: params.canvasId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.targetTileId ? { targetTileId: params.targetTileId } : {}),
        ...(params.sourceTileId ? { sourceTileId: params.sourceTileId } : {}),
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(params.connectionId ? { connectionId: params.connectionId } : {}),
        ...(Number.isFinite(params.limit) ? { limit: params.limit } : {}),
      })),
  },
  {
    name: "qf_task_create",
    description: "Create a QuantFlow Envoy task for agent delegation",
    schema: {
      canvasId: { kind: "string" },
      sourceTileId: { kind: "string" },
      title: { kind: "string" },
      instruction: { kind: "string" },
      targetTileId: { kind: "string", optional: true },
      connectionId: { kind: "string", optional: true },
      correlationId: { kind: "string", optional: true },
      acceptanceCriteriaJson: { kind: "string", optional: true },
      operatorOverride: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskCreate", {
        canvasId: params.canvasId,
        sourceTileId: params.sourceTileId,
        title: params.title,
        instruction: params.instruction,
        ...(params.targetTileId ? { targetTileId: params.targetTileId } : {}),
        ...(params.connectionId ? { connectionId: params.connectionId } : {}),
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(params.acceptanceCriteriaJson
          ? { acceptanceCriteria: optionalJsonArray(params.acceptanceCriteriaJson) }
          : {}),
        operatorOverride: stringToBoolean(params.operatorOverride),
      })),
  },
  {
    name: "qf_task_claim",
    description: "Atomically claim a QuantFlow Envoy task",
    schema: {
      taskId: { kind: "string" },
      claimingTileId: { kind: "string" },
      agentName: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskClaim", {
        taskId: params.taskId,
        claimingTileId: params.claimingTileId,
        ...(params.agentName ? { agentName: params.agentName } : {}),
      })),
  },
  {
    name: "qf_task_update",
    description: "Post a progress update for a QuantFlow Envoy task",
    schema: {
      taskId: { kind: "string" },
      summary: { kind: "string" },
      actorTileId: { kind: "string", optional: true },
      agentName: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskUpdate", {
        taskId: params.taskId,
        summary: params.summary,
        ...(params.actorTileId ? { actorTileId: params.actorTileId } : {}),
        ...(params.agentName ? { agentName: params.agentName } : {}),
      })),
  },
  {
    name: "qf_task_complete",
    description: "Complete a QuantFlow Envoy task",
    schema: {
      taskId: { kind: "string" },
      resultSummary: { kind: "string" },
      artifactPathsJson: { kind: "string", optional: true },
      actorTileId: { kind: "string", optional: true },
      agentName: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskComplete", {
        taskId: params.taskId,
        resultSummary: params.resultSummary,
        ...(params.artifactPathsJson
          ? { artifactPaths: optionalJsonArray(params.artifactPathsJson) }
          : {}),
        ...(params.actorTileId ? { actorTileId: params.actorTileId } : {}),
        ...(params.agentName ? { agentName: params.agentName } : {}),
      })),
  },
  {
    name: "qf_task_block",
    description: "Mark a QuantFlow Envoy task blocked",
    schema: {
      taskId: { kind: "string" },
      reason: { kind: "string" },
      actorTileId: { kind: "string", optional: true },
      agentName: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskBlock", {
        taskId: params.taskId,
        reason: params.reason,
        ...(params.actorTileId ? { actorTileId: params.actorTileId } : {}),
        ...(params.agentName ? { agentName: params.agentName } : {}),
      })),
  },
  {
    name: "qf_task_fail",
    description: "Mark a QuantFlow Envoy task failed",
    schema: {
      taskId: { kind: "string" },
      reason: { kind: "string" },
      actorTileId: { kind: "string", optional: true },
      agentName: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.taskFail", {
        taskId: params.taskId,
        reason: params.reason,
        ...(params.actorTileId ? { actorTileId: params.actorTileId } : {}),
        ...(params.agentName ? { agentName: params.agentName } : {}),
      })),
  },
  {
    name: "qf_task_submit",
    description:
      "Submit a Kernel task result for verification (working → submitted). " +
      "The worker submits; the system verifies. Use qf_task_verify to pass it.",
    schema: {
      taskId: { kind: "string" },
      summary: { kind: "string", optional: true },
      artifactRefsJson: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("kernel.taskSubmit", {
        taskId: params.taskId,
        ...(params.summary ? { summary: params.summary } : {}),
        ...(params.artifactRefsJson
          ? { artifactRefs: optionalJsonArray(params.artifactRefsJson) }
          : {}),
      })),
  },
  {
    name: "qf_task_verify",
    description:
      "Verify a submitted Kernel task. verdict 'pass' (default) records a " +
      "verification_passed receipt and completes the task; 'fail' returns it " +
      "to working. A worker may not verify its own task.",
    schema: {
      taskId: { kind: "string" },
      verdict: { kind: "string", optional: true },
      verifierWorkerId: { kind: "string", optional: true },
      summary: { kind: "string", optional: true },
      operatorOverride: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("kernel.taskVerify", {
        taskId: params.taskId,
        ...(params.verdict ? { verdict: params.verdict } : {}),
        ...(params.verifierWorkerId ? { verifierWorkerId: params.verifierWorkerId } : {}),
        ...(params.summary ? { summary: params.summary } : {}),
        operatorOverride: stringToBoolean(params.operatorOverride),
      })),
  },
  {
    name: "qf_task_reject",
    description:
      "Reject a submitted/verifying Kernel task. Records a verification_failed " +
      "receipt and returns the task to working for rework.",
    schema: {
      taskId: { kind: "string" },
      reason: { kind: "string", optional: true },
      verifierWorkerId: { kind: "string", optional: true },
      operatorOverride: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("kernel.taskReject", {
        taskId: params.taskId,
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.verifierWorkerId ? { verifierWorkerId: params.verifierWorkerId } : {}),
        operatorOverride: stringToBoolean(params.operatorOverride),
      })),
  },
  {
    name: "qf_receipt_list",
    description: "List QuantFlow Envoy receipts",
    schema: {
      taskId: { kind: "string", optional: true },
      canvasId: { kind: "string", optional: true },
      correlationId: { kind: "string", optional: true },
      limit: { kind: "number", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.receiptList", {
        ...(params.taskId ? { taskId: params.taskId } : {}),
        ...(params.canvasId ? { canvasId: params.canvasId } : {}),
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(Number.isFinite(params.limit) ? { limit: params.limit } : {}),
      })),
  },
  {
    name: "qf_envoy_watch",
    description: "List recent QuantFlow Envoy events",
    schema: {
      correlationId: { kind: "string", optional: true },
      limit: { kind: "number", optional: true },
    },
    handle: (rpc) => async (params = {}) =>
      jsonText(await rpc("envoy.watch", {
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
        ...(Number.isFinite(params.limit) ? { limit: params.limit } : {}),
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
      tileId: { kind: "string", optional: true },
      workflowTaskId: { kind: "string", optional: true },
      workflowCorrelationId: { kind: "string", optional: true },
      workflowEnvoySpaceId: { kind: "string", optional: true },
      canvasId: { kind: "string", optional: true },
      workspaceId: { kind: "string", optional: true },
    },
    handle: (rpc) => async (params = {}) => {
      const role = await rpc("role.get", { id: params.roleId });
      if (!role) throw new Error(`Role not found: ${params.roleId}`);
      return jsonText(await rpc("canvas.roleSpawn", {
        role,
        ...(params.tileId ? { tileId: params.tileId } : {}),
        ...(params.cwd ? { cwd: params.cwd } : {}),
        ...(params.workflowTaskId ? { workflowTaskId: params.workflowTaskId } : {}),
        ...(params.workflowCorrelationId ? { workflowCorrelationId: params.workflowCorrelationId } : {}),
        ...(params.workflowEnvoySpaceId ? { workflowEnvoySpaceId: params.workflowEnvoySpaceId } : {}),
        ...(params.canvasId ? { canvasId: params.canvasId } : {}),
        ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
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
    name: "quantflow_kernel_state_cards",
    description: "Read-only: Kernel State Cards (current per-tile reality). Optional workflowId filter.",
    schema: { workflowId: { kind: "string", default: "" } },
    handle: (rpc) => async ({ workflowId = "" }) =>
      jsonText(await rpc("kernel.stateCardList", workflowId ? { workflowId } : {})),
  },
  {
    name: "quantflow_kernel_workflow_region",
    description: "Read-only: one workflow's canvas region projection (status, member tiles, counts, blockers).",
    schema: { workflowId: { kind: "string" } },
    handle: (rpc) => async ({ workflowId }) =>
      jsonText(await rpc("kernel.workflowRegion", { workflowId })),
  },
  {
    name: "quantflow_kernel_workflow_regions",
    description: "Read-only: all workflow region projections.",
    schema: {},
    handle: (rpc) => async () => jsonText(await rpc("kernel.workflowRegionList", {})),
  },
  {
    name: "quantflow_kernel_run",
    description: "Read-only: the Run projection for a workflow (run_id ≡ workflow_id; references only — task/artifact/receipt ids + instance fields).",
    schema: { workflowId: { kind: "string" } },
    handle: (rpc) => async ({ workflowId }) =>
      jsonText(await rpc("kernel.run", { workflowId })),
  },
  {
    name: "quantflow_kernel_evals",
    description: "Read-only: Kernel evaluation rows (non-authoritative, cross-run). Optional workflowId filter.",
    schema: { workflowId: { kind: "string", default: "" } },
    handle: (rpc) => async ({ workflowId = "" }) =>
      jsonText(await rpc("kernel.evalList", workflowId ? { workflowId } : {})),
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
