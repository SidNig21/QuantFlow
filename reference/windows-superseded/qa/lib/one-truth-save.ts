import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

export async function runOneTruthSaveCheck(): Promise<boolean> {
  const root = mkdtempSync(join(tmpdir(), "qf-one-truth-save-"));
  const stateDir = join(root, ".quantflow");
  const stateFile = join(stateDir, "canvas-state.json");
  const ephemeralFile = join(stateDir, "canvas-ephemeral.json");
  const { kdb, db } = createInMemoryKernelDb("wf_one_truth_save");
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
    exportState,
  } = await import("../../quantflow-electron/src/main/canvas-persistence");
  const { _resetCanvasKernelAccessForTesting } = await import(
    "../../quantflow-electron/src/main/canvas-kernel-access"
  );

  installTestRuntimeDb();
  resetConnections();
  _setCanvasStateDir(stateDir);
  _resetCanvasKernelAccessForTesting();

  const seedState: CanvasState = {
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
        cwd: "/repo",
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

  const flagOnUpdate: CanvasState = {
    ...seedState,
    version: 2,
    tiles: seedState.tiles.map((tile) =>
      tile.id === "tile-a"
        ? { ...tile, ptySessionId: "pty-updated", herdrPaneId: "pane-updated" }
        : tile,
    ),
    viewport: { centerX: 130, centerY: 90, zoom: 1.5 },
  };

  try {
    delete process.env.QF_ONE_TRUTH;
    await saveState(seedState as never);
    const authorityBeforeFlagOn = await readFile(stateFile, "utf-8");

    process.env.QF_ONE_TRUTH = "1";
    await saveState(flagOnUpdate as never);

    const authorityAfterFlagOn = await readFile(stateFile, "utf-8");
    if (authorityAfterFlagOn !== authorityBeforeFlagOn) {
      console.error("one-truth-save: canvas-state.json was rewritten under flag ON");
      return false;
    }

    let ephemeralRaw: string;
    try {
      ephemeralRaw = await readFile(ephemeralFile, "utf-8");
    } catch {
      console.error("one-truth-save: canvas-ephemeral.json missing after flag-ON save");
      return false;
    }
    const ephemeralDoc = JSON.parse(ephemeralRaw) as { version?: string; tiles?: unknown[] };
    if (ephemeralDoc.version !== "ephemeral-v1") {
      console.error(`one-truth-save: unexpected ephemeral cache version: ${ephemeralDoc.version}`);
      return false;
    }
    const ephemeralTile = (ephemeralDoc.tiles ?? []).find(
      (t) => t && typeof t === "object" && (t as { id?: string }).id === "tile-a",
    ) as { ptySessionId?: string; herdrPaneId?: string; herdrTerminalId?: string } | undefined;
    if (
      ephemeralTile?.ptySessionId !== "pty-updated" ||
      ephemeralTile?.herdrPaneId !== "pane-updated" ||
      ephemeralTile?.herdrTerminalId !== "term-a"
    ) {
      console.error("one-truth-save: ephemeral cache round-trip mismatch");
      return false;
    }

    _resetCanvasKernelAccessForTesting();
    const kernelLoaded = await loadState();
    const tileA = kernelLoaded?.tiles.find((t) => t.id === "tile-a");
    if (
      kernelLoaded?.viewport.centerX !== 130 ||
      (kernelLoaded?.tiles.length ?? 0) !== 2 ||
      tileA?.ptySessionId !== "pty-updated"
    ) {
      console.error("one-truth-save: flag-ON load did not assemble Kernel truth");
      return false;
    }

    delete process.env.QF_ONE_TRUTH;
    _resetCanvasKernelAccessForTesting();
    const downgradeLoaded = await loadState();
    const normalizedFlagOff = normalizeCanvasState(downgradeLoaded as CanvasState | null);
    const normalizedKernel = normalizeCanvasState(kernelLoaded as CanvasState | null);
    if (JSON.stringify(normalizedFlagOff) !== JSON.stringify(normalizedKernel)) {
      console.error("one-truth-save: downgrade path mismatch after flag-ON saves");
      console.error("flag-off load:", JSON.stringify(normalizedFlagOff, null, 2));
      console.error("kernel load:", JSON.stringify(normalizedKernel, null, 2));
      return false;
    }

    const exportPath = join(stateDir, "canvas-export.json");
    await exportState(exportPath);
    const exported = JSON.parse(await readFile(exportPath, "utf-8")) as CanvasState;
    if (exported.version !== 2) {
      console.error("one-truth-save: export missing version 2");
      return false;
    }

    delete process.env.QF_ONE_TRUTH;
    await saveState(flagOnUpdate as never);
    const flagOffSaved = normalizeCanvasState(
      JSON.parse(await readFile(stateFile, "utf-8")) as CanvasState,
    );
    const normalizedExport = normalizeCanvasState(exported);
    if (JSON.stringify(normalizedExport) !== JSON.stringify(flagOffSaved)) {
      console.error("one-truth-save: export != flag-OFF save shape");
      console.error("export:", JSON.stringify(normalizedExport, null, 2));
      console.error("flag-off save:", JSON.stringify(flagOffSaved, null, 2));
      return false;
    }

    console.log("one-truth-save: ephemeral cache + export + downgrade confirmed");
    return true;
  } finally {
    delete process.env.QF_ONE_TRUTH;
    setKernelDbForTesting(null);
    _resetCanvasKernelAccessForTesting();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}
