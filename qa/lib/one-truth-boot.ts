import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setKernelDbForTesting } from "../../src/kernel/database";
import { createInMemoryKernelDb } from "./kernel-memory-db";

type CanvasState = {
  version: number;
  tiles: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  viewport: { centerX: number; centerY: number; zoom: number };
};

function normalizeCanvasState(state: CanvasState | null): CanvasState | null {
  if (!state) return null;
  const tiles = [...state.tiles]
    .map((tile) => {
      const normalized: Record<string, unknown> = {};
      const keys = Object.keys(tile).sort();
      for (const key of keys) {
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
        // Transition sync assigns Kernel timestamps and coerces semantic types.
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

export async function runOneTruthBootCheck(): Promise<boolean> {
  const root = mkdtempSync(join(tmpdir(), "qf-one-truth-boot-"));
  const stateDir = join(root, ".quantflow");
  const { kdb, db } = createInMemoryKernelDb("wf_one_truth");
  setKernelDbForTesting(kdb);

  const { installTestRuntimeDb } = await import(
    "../../quantflow-electron/src/main/runtime-state/test-sqlite-adapter"
  );
  const { _resetForTesting: resetConnections } = await import(
    "../../quantflow-electron/src/main/runtime-state/connections-repo"
  );
  const {
    _setCanvasStateDir,
    saveState,
    loadState,
  } = await import("../../quantflow-electron/src/main/canvas-persistence");
  const {
    _resetCanvasKernelAccessForTesting,
    _getCanvasKernelAccessCountersForTesting,
  } = await import("../../quantflow-electron/src/main/canvas-kernel-access");

  installTestRuntimeDb();
  resetConnections();
  _setCanvasStateDir(stateDir);
  _resetCanvasKernelAccessForTesting();

  const sampleState: CanvasState = {
    version: 1,
    tiles: [
      {
        id: "tile-a",
        type: "term",
        x: 10,
        y: 20,
        width: 400,
        height: 300,
        workspacePath: "/workspace/a",
        terminalTarget: "herdr",
        runtimeTarget: "herdr-wsl",
        userTitle: "Worker A",
        autoTitle: "auto-a",
        routeHandle: "route-a",
        herdrAgentName: "agent-a",
        herdrWorkspaceId: "ws-a",
        ptySessionId: "pty-a",
        herdrPaneId: "pane-a",
        herdrTerminalId: "term-a",
        zIndex: 2,
      },
      {
        id: "tile-b",
        type: "note",
        x: 500,
        y: 60,
        width: 320,
        height: 240,
        filePath: "/notes/b.md",
        userTitle: "Notes",
        zIndex: 1,
        cwd: "/repo",
      },
    ],
    connections: [
      {
        id: "conn-ab",
        tileAId: "tile-a",
        tileBId: "tile-b",
        label: "link",
        from: { tileId: "tile-a", side: "E" },
        to: { tileId: "tile-b", side: "W" },
        kind: "relay",
        createdAt: 100,
        updatedAt: 200,
      },
    ],
    viewport: { centerX: 120, centerY: 80, zoom: 1.25 },
  };

  try {
    await saveState(sampleState as never);

    delete process.env.QF_ONE_TRUTH;
    _resetCanvasKernelAccessForTesting();
    const jsonLoaded = await loadState();
    const { kernelReadCount: kernelReadsOff } = _getCanvasKernelAccessCountersForTesting();
    if (kernelReadsOff !== 0) {
      console.error(`expected flag-off load to avoid Kernel reads, got ${kernelReadsOff}`);
      return false;
    }

    process.env.QF_ONE_TRUTH = "1";
    _resetCanvasKernelAccessForTesting();
    const kernelLoaded = await loadState();
    const countersOn = _getCanvasKernelAccessCountersForTesting();
    if (countersOn.kernelReadCount === 0) {
      console.error("expected flag-on load to read Kernel");
      return false;
    }
    if (countersOn.jsonEphemeralReadCount === 0) {
      console.error("expected flag-on load to read JSON ephemeral overlay");
      return false;
    }

    const normalizedJson = normalizeCanvasState(jsonLoaded as CanvasState | null);
    const normalizedKernel = normalizeCanvasState(kernelLoaded as CanvasState | null);
    if (JSON.stringify(normalizedJson) !== JSON.stringify(normalizedKernel)) {
      console.error("one-truth-boot parity mismatch:");
      console.error("json path:", JSON.stringify(normalizedJson, null, 2));
      console.error("kernel path:", JSON.stringify(normalizedKernel, null, 2));
      return false;
    }

    console.log("one-truth-boot: both-paths-parity confirmed");
    return true;
  } finally {
    delete process.env.QF_ONE_TRUTH;
    setKernelDbForTesting(null);
    _resetCanvasKernelAccessForTesting();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}
