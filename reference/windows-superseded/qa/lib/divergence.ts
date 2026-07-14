/**
 * D5 divergence harness — Kernel snapshot == canvas projection == derived export.
 * Receipts/events corroborate transitions; assembly paths never read receipts.
 */

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dispatchKernelCommand } from "../../src/kernel/commands/index";
import { onKernelEvent, type KernelEventPayload } from "../../src/kernel/events/index";
import { setKernelDbForTesting } from "../../src/kernel/database";
import {
  queryCanvasSettingsGet,
  queryTileExtensionGet,
  queryTileList,
} from "../../src/kernel/queries/index";
import { loadConnectionsForCanvas } from "../../quantflow-electron/src/main/connections-access";
import { createInMemoryKernelDb } from "./kernel-memory-db";

type CanvasState = {
  version: number;
  tiles: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  viewport: { centerX: number; centerY: number; zoom: number };
};

const EPHEMERAL_TILE_KEYS = new Set([
  "ptySessionId",
  "herdrPaneId",
  "herdrTerminalId",
]);

const CANVAS_TILE_TYPES = new Set([
  "term",
  "note",
  "code",
  "image",
  "graph",
  "browser",
]);

/** Assembly sources that must not consult receipts for truth (import-graph grep). */
const RECEIPT_FREE_ASSEMBLY_FILES = [
  "quantflow-electron/src/main/canvas-kernel-sync.ts",
  "quantflow-electron/src/main/canvas-persistence.ts",
  "quantflow-electron/src/main/connections-access.ts",
] as const;

const RECEIPT_IMPORT_PATTERN =
  /from\s+['"].*receipt|queryReceipt|receiptList|receipts\/index/;

function normalizeCanvasState(state: CanvasState | null): CanvasState | null {
  if (!state) return null;
  const tiles = [...state.tiles]
    .map((tile) => {
      const normalized: Record<string, unknown> = {};
      const keys = Object.keys(tile).sort();
      for (const key of keys) {
        if (EPHEMERAL_TILE_KEYS.has(key)) continue;
        const value = tile[key];
        if (value !== undefined) normalized[key] = value;
      }
      return normalized;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const connections = [...state.connections]
    .map((conn) => {
      const normalized: Record<string, unknown> = {};
      const keys = Object.keys(conn).sort();
      for (const key of keys) {
        if (key === "createdAt" || key === "updatedAt" || key === "kind") continue;
        const value = conn[key];
        if (value !== undefined) normalized[key] = value;
      }
      return normalized;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    version: 2,
    tiles,
    connections,
    viewport: { ...state.viewport },
  };
}

function canvasTypeFromExtension(canvasType: string | null | undefined): string {
  if (typeof canvasType === "string" && CANVAS_TILE_TYPES.has(canvasType)) {
    return canvasType;
  }
  return "term";
}

/** (A) Kernel truth — independent query-layer assembly, no ephemeral overlay. */
function assembleKernelTruth(): CanvasState {
  const tileRows = queryTileList();
  const settings = queryCanvasSettingsGet();
  const tiles = tileRows.map((row) => {
    const ext = queryTileExtensionGet(row.id);
    const tile: Record<string, unknown> = {
      id: row.id,
      type: canvasTypeFromExtension(ext?.canvasType),
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      zIndex: row.zIndex,
    };
    if (ext?.filePath != null) tile.filePath = ext.filePath;
    if (ext?.folderPath != null) tile.folderPath = ext.folderPath;
    if (ext?.url != null) tile.url = ext.url;
    if (ext?.workspacePath != null) tile.workspacePath = ext.workspacePath;
    if (ext?.terminalTarget != null) tile.terminalTarget = ext.terminalTarget;
    if (ext?.runtimeTarget != null) tile.runtimeTarget = ext.runtimeTarget;
    if (ext?.userTitle != null) tile.userTitle = ext.userTitle;
    if (ext?.autoTitle != null) tile.autoTitle = ext.autoTitle;
    if (ext?.routeHandle != null) tile.routeHandle = ext.routeHandle;
    if (ext?.herdrAgentName != null) tile.herdrAgentName = ext.herdrAgentName;
    if (ext?.herdrWorkspaceId != null) tile.herdrWorkspaceId = ext.herdrWorkspaceId;
    if (ext?.extraJson) {
      for (const [key, value] of Object.entries(ext.extraJson)) {
        if (value !== undefined && value !== null) tile[key] = value;
      }
    }
    return tile;
  });

  return {
    version: 2,
    tiles,
    connections: loadConnectionsForCanvas() as Array<Record<string, unknown>>,
    viewport: settings
      ? { centerX: settings.centerX, centerY: settings.centerY, zoom: settings.zoom }
      : { centerX: 0, centerY: 0, zoom: 1 },
  };
}

function assertAssemblyPathsReceiptFree(): boolean {
  const repoRoot = join(import.meta.dir, "..", "..");
  for (const rel of RECEIPT_FREE_ASSEMBLY_FILES) {
    const raw = readFileSync(join(repoRoot, rel), "utf-8");
    if (RECEIPT_IMPORT_PATTERN.test(raw)) {
      console.error(`divergence: assembly file imports receipts: ${rel}`);
      return false;
    }
  }
  return true;
}

function printThreeWayDiff(
  batch: string,
  a: CanvasState | null,
  b: CanvasState | null,
  c: CanvasState | null,
): void {
  console.error(`divergence: three-way mismatch after batch "${batch}"`);
  console.error("kernel-truth:", JSON.stringify(a, null, 2));
  console.error("canvas-projection:", JSON.stringify(b, null, 2));
  console.error("export-mirror:", JSON.stringify(c, null, 2));
}

async function assertThreeWayAgree(
  batch: string,
  loadState: () => Promise<CanvasState | null>,
  exportState: (path: string) => Promise<string>,
  exportPath: string,
): Promise<boolean> {
  const kernel = normalizeCanvasState(assembleKernelTruth());
  const projection = normalizeCanvasState(await loadState());
  await exportState(exportPath);
  const exported = normalizeCanvasState(
    JSON.parse(await Bun.file(exportPath).text()) as CanvasState,
  );

  const kJson = JSON.stringify(kernel);
  const pJson = JSON.stringify(projection);
  const eJson = JSON.stringify(exported);

  if (kJson !== pJson || kJson !== eJson) {
    printThreeWayDiff(batch, kernel, projection, exported);
    return false;
  }
  console.log(`divergence: three-way-agree [${batch}]`);
  return true;
}

async function dispatch(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  return dispatchKernelCommand(type, payload, "divergence-qa");
}

function extensionPayload(tile: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tileId: tile.id,
    canvasType: tile.type,
  };
  for (const key of [
    "filePath",
    "folderPath",
    "url",
    "workspacePath",
    "terminalTarget",
    "runtimeTarget",
    "userTitle",
    "autoTitle",
    "routeHandle",
    "herdrAgentName",
    "herdrWorkspaceId",
  ] as const) {
    if (tile[key] !== undefined) payload[key] = tile[key];
  }
  return payload;
}

async function spawnTile(tile: Record<string, unknown>): Promise<boolean> {
  const created = await dispatch("kernel.tile.create", {
    id: tile.id,
    displayName: (tile.userTitle as string) || (tile.type as string),
    tileKind: "worker",
    x: tile.x,
    y: tile.y,
    width: tile.width,
    height: tile.height,
    zIndex: tile.zIndex,
    workflowId: "wf_divergence",
  });
  if (!created.ok) {
    console.error("divergence: tile.create failed", tile.id, created.error);
    return false;
  }
  const ext = await dispatch("kernel.tile_extension.set", extensionPayload(tile));
  if (!ext.ok) {
    console.error("divergence: tile_extension.set failed", tile.id, ext.error);
    return false;
  }
  return true;
}

function countCapturedEvents(events: KernelEventPayload[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const evt of events) {
    counts.set(evt.kind, (counts.get(evt.kind) ?? 0) + 1);
  }
  return counts;
}

function assertEventsCorroborate(
  events: Map<string, number>,
  expected: Record<string, number>,
): boolean {
  for (const [kind, min] of Object.entries(expected)) {
    const got = events.get(kind) ?? 0;
    if (got < min) {
      console.error(`divergence: expected >=${min} events of kind ${kind}, got ${got}`);
      return false;
    }
  }
  return true;
}

export async function runDivergenceCheck(): Promise<boolean> {
  if (!assertAssemblyPathsReceiptFree()) return false;

  const root = mkdtempSync(join(tmpdir(), "qf-divergence-"));
  const stateDir = join(root, ".quantflow");
  const exportPath = join(stateDir, "divergence-export.json");
  const { kdb, db } = createInMemoryKernelDb("wf_divergence");
  setKernelDbForTesting(kdb);

  const { installTestRuntimeDb } = await import(
    "../../quantflow-electron/src/main/runtime-state/test-sqlite-adapter"
  );
  const { _resetForTesting: resetConnections } = await import(
    "../../quantflow-electron/src/main/runtime-state/connections-repo"
  );
  const { dispatchConnectionCommand } = await import(
    "../../quantflow-electron/src/main/connections-access"
  );
  const {
    _setCanvasStateDir,
    loadState,
    saveState,
    exportState,
  } = await import("../../quantflow-electron/src/main/canvas-persistence");
  const { _resetCanvasKernelAccessForTesting } = await import(
    "../../quantflow-electron/src/main/canvas-kernel-access"
  );

  installTestRuntimeDb();
  resetConnections();
  _setCanvasStateDir(stateDir);
  _resetCanvasKernelAccessForTesting();
  process.env.QF_ONE_TRUTH = "1";

  const capturedEvents: KernelEventPayload[] = [];
  onKernelEvent((payload) => {
    capturedEvents.push(payload);
  });

  const tileTerm = {
    id: "tile-term",
    type: "term",
    x: 10,
    y: 20,
    width: 400,
    height: 300,
    workspacePath: "/workspace/term",
    terminalTarget: "herdr",
    runtimeTarget: "herdr-wsl",
    userTitle: "Worker",
    zIndex: 1,
  };
  const tileNote = {
    id: "tile-note",
    type: "note",
    x: 500,
    y: 60,
    width: 320,
    height: 240,
    filePath: "/notes/note.md",
    userTitle: "Notes",
    zIndex: 2,
  };
  const tileBrowser = {
    id: "tile-browser",
    type: "browser",
    x: 900,
    y: 100,
    width: 480,
    height: 360,
    url: "https://example.com",
    zIndex: 3,
  };

  try {
    // Batch 1: spawn three tile types with extension fields (spawn command path).
    await dispatch("kernel.canvas.settings.set", {
      centerX: 100,
      centerY: 80,
      zoom: 1.1,
    });
    for (const tile of [tileTerm, tileNote, tileBrowser]) {
      if (!(await spawnTile(tile))) return false;
    }
    if (!(await assertThreeWayAgree("spawn-tiles", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 2: layout — move, resize, z-order, rename.
    const moved = await dispatch("kernel.tile.move", { id: "tile-term", x: 30, y: 40 });
    if (!moved.ok) return false;
    const resized = await dispatch("kernel.tile.resize", {
      id: "tile-note",
      width: 360,
      height: 280,
    });
    if (!resized.ok) return false;
    const zOrdered = await dispatch("kernel.tile.layout_sync", {
      id: "tile-browser",
      zIndex: 10,
    });
    if (!zOrdered.ok) return false;
    const renamed = await dispatch("kernel.tile.rename", {
      id: "tile-term",
      displayName: "Renamed Worker",
    });
    if (!renamed.ok) return false;
    await dispatch("kernel.tile_extension.set", {
      tileId: "tile-term",
      userTitle: "Renamed Worker",
    });
    if (!(await assertThreeWayAgree("layout", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 3: two connections (endpoints + label + kind).
    const conn1 = await dispatchConnectionCommand("kernel.connection.create", {
      id: "conn-ab",
      tileAId: "tile-term",
      tileBId: "tile-note",
      fromTileId: "tile-term",
      toTileId: "tile-note",
      label: "relay-link",
      semanticType: "relay",
    });
    if (!conn1.ok) return false;
    const conn2 = await dispatchConnectionCommand("kernel.connection.create", {
      id: "conn-bc",
      tileAId: "tile-note",
      tileBId: "tile-browser",
      fromTileId: "tile-note",
      toTileId: "tile-browser",
      label: "browse-link",
      semanticType: "manual_connection",
    });
    if (!conn2.ok) return false;
    if (!(await assertThreeWayAgree("connections", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 4: connection label update.
    const labelUpd = await dispatchConnectionCommand("kernel.connection.update", {
      id: "conn-ab",
      label: "updated-relay",
    });
    if (!labelUpd.ok) return false;
    if (!(await assertThreeWayAgree("connection-label", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 5: viewport.
    const vp = await dispatch("kernel.canvas.settings.set", {
      centerX: 200,
      centerY: 150,
      zoom: 1.5,
    });
    if (!vp.ok) return false;
    if (!(await assertThreeWayAgree("viewport", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 6: workspace-rename path (tile_extension.set for filePath + canvasType).
    const renameExt = await dispatch("kernel.tile_extension.set", {
      tileId: "tile-note",
      filePath: "/notes/renamed.md",
      canvasType: "note",
    });
    if (!renameExt.ok) return false;
    if (!(await assertThreeWayAgree("workspace-rename", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 7: delete tile — cascade removes conn-ab touching tile-term.
    const removed = await dispatch("kernel.tile.remove", { id: "tile-term" });
    if (!removed.ok) return false;
    const extGone = queryTileExtensionGet("tile-term");
    if (extGone != null) {
      console.error("divergence: tile_extensions row survived tile.remove cascade");
      return false;
    }
    if (!(await assertThreeWayAgree("delete-tile", loadState, exportState, exportPath))) {
      return false;
    }

    // Batch 8: delete remaining connection.
    const connDel = await dispatchConnectionCommand("kernel.connection.delete", {
      id: "conn-bc",
    });
    if (!connDel.ok) return false;
    if (!(await assertThreeWayAgree("delete-connection", loadState, exportState, exportPath))) {
      return false;
    }

    const events = countCapturedEvents(capturedEvents);
    if (
      !assertEventsCorroborate(events, {
        "tile.created": 3,
        "tile.moved": 1,
        "tile.resized": 1,
        "tile.renamed": 1,
        "connection.created": 2,
        "connection.updated": 1,
        "tile.removed": 1,
        "connection.deleted": 1,
      })
    ) {
      return false;
    }

    // Structural: assembly unchanged when receipts table is ignored (no reads by construction).
    const receiptCount = (
      db.prepare("SELECT COUNT(*) AS n FROM receipts").get() as { n: number }
    ).n;
    if (receiptCount !== 0) {
      console.error(`divergence: expected no receipt authority rows, got ${receiptCount}`);
      return false;
    }
    if (!(await assertThreeWayAgree("receipts-ignored", loadState, exportState, exportPath))) {
      return false;
    }

    // Flag-OFF smoke: JSON-authoritative boot returns saved state.
    const rawFlagOn = await loadState();
    const flagOnNorm = normalizeCanvasState(rawFlagOn);
    if (!rawFlagOn || !flagOnNorm) {
      console.error("divergence: flag-ON final loadState empty");
      return false;
    }

    delete process.env.QF_ONE_TRUTH;
    _resetCanvasKernelAccessForTesting();
    await saveState(rawFlagOn);
    const flagOffNorm = normalizeCanvasState(await loadState());
    if (JSON.stringify(flagOffNorm) !== JSON.stringify(flagOnNorm)) {
      console.error("divergence: flag-OFF loadState != flag-ON final state");
      console.error("flag-off:", JSON.stringify(flagOffNorm, null, 2));
      console.error("flag-on:", JSON.stringify(flagOnNorm, null, 2));
      return false;
    }

    console.log(
      "divergence: OK — 8 mutation batches three-way-agree; events corroborate; receipt-free assembly",
    );
    return true;
  } finally {
    delete process.env.QF_ONE_TRUTH;
    setKernelDbForTesting(null);
    _resetCanvasKernelAccessForTesting();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}
