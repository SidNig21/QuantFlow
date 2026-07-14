import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setKernelDbForTesting } from "../../src/kernel/database";
import { createInMemoryKernelDb } from "./kernel-memory-db";

export async function runConnectionRoundTripCheck(): Promise<boolean> {
  const root = mkdtempSync(join(tmpdir(), "qf-connection-round-trip-"));
  const stateDir = join(root, ".quantflow");

  const { kdb, db } = createInMemoryKernelDb("wf_conn_rt");
  setKernelDbForTesting(kdb);

  const { installTestRuntimeDb } = await import(
    "../../quantflow-electron/src/main/runtime-state/test-sqlite-adapter"
  );
  const {
    _resetWriteSpyForTesting,
    _getWriteSpyForTesting,
  } = await import(
    "../../quantflow-electron/src/main/runtime-state/connections-repo"
  );
  const {
    _resetConnectionWriteSpyForTesting,
    _getConnectionWriteSpyForTesting,
    dispatchConnectionCommand,
  } = await import("../../quantflow-electron/src/main/connections-access");
  const {
    _setCanvasStateDir,
    loadState,
    exportState,
    saveState,
  } = await import("../../quantflow-electron/src/main/canvas-persistence");

  installTestRuntimeDb();
  _setCanvasStateDir(stateDir);
  _resetWriteSpyForTesting();
  _resetConnectionWriteSpyForTesting();

  const now = Date.now();
  db.prepare(
    `INSERT INTO tiles (id, display_name, tile_kind, x, y, width, height, z_index, status, workflow_id, created_at, updated_at)
     VALUES ('tile-a', 'A', 'worker', 0, 0, 400, 300, 0, 'active', 'wf_conn_rt', ?, ?),
            ('tile-b', 'B', 'worker', 100, 0, 400, 300, 1, 'active', 'wf_conn_rt', ?, ?)`,
  ).run(now, now, now, now);

  process.env.QF_ONE_TRUTH = "1";

  const connId = "conn-round-trip-1";

  const created = await dispatchConnectionCommand("kernel.connection.create", {
    id: connId,
    tileAId: "tile-a",
    tileBId: "tile-b",
    label: "initial",
  });
  if (!created.ok) {
    console.error("connection.create failed:", created.error);
    cleanup(root, db, kdb);
    return false;
  }

  const kernelRow = db
    .prepare("SELECT label FROM connections WHERE id = ?")
    .get(connId) as { label: string | null } | undefined;
  if (kernelRow?.label !== "initial") {
    console.error("Kernel row missing after create");
    cleanup(root, db, kdb);
    return false;
  }

  if (_getWriteSpyForTesting() > 0 || _getConnectionWriteSpyForTesting() > 0) {
    console.error(
      "runtime.db connections repo received writes after kernel.connection.create",
      { repo: _getWriteSpyForTesting(), canvas: _getConnectionWriteSpyForTesting() },
    );
    cleanup(root, db, kdb);
    return false;
  }

  const updated = await dispatchConnectionCommand("kernel.connection.update", {
    id: connId,
    label: "updated-label",
  });
  if (!updated.ok) {
    console.error("connection.update failed:", updated.error);
    cleanup(root, db, kdb);
    return false;
  }

  const loaded = await loadState();
  const loadedConn = loaded?.connections.find((c) => c.id === connId);
  if (!loadedConn || loadedConn.label !== "updated-label") {
    console.error("loadState missing connection or label", loadedConn);
    cleanup(root, db, kdb);
    return false;
  }

  const exportPath = join(stateDir, "export.json");
  await exportState(exportPath);
  const exported = JSON.parse(await Bun.file(exportPath).text()) as {
    connections: Array<{ id: string; label?: string }>;
  };
  const exportedConn = exported.connections.find((c) => c.id === connId);
  if (!exportedConn || exportedConn.label !== "updated-label") {
    console.error("exportState missing connection", exportedConn);
    cleanup(root, db, kdb);
    return false;
  }

  if (_getWriteSpyForTesting() > 0 || _getConnectionWriteSpyForTesting() > 0) {
    console.error("runtime.db writes after load/export");
    cleanup(root, db, kdb);
    return false;
  }

  const deleted = await dispatchConnectionCommand("kernel.connection.delete", { id: connId });
  if (!deleted.ok) {
    console.error("connection.delete failed:", deleted.error);
    cleanup(root, db, kdb);
    return false;
  }

  const afterDelete = db.prepare("SELECT id FROM connections WHERE id = ?").get(connId);
  if (afterDelete) {
    console.error("Kernel row still present after delete");
    cleanup(root, db, kdb);
    return false;
  }

  // Flag-OFF sanity: dual-write to runtime.db still works
  delete process.env.QF_ONE_TRUTH;
  _resetWriteSpyForTesting();
  _resetConnectionWriteSpyForTesting();

  await saveState({
    version: 2,
    tiles: [],
    connections: [
      {
        id: "conn-dual-write",
        tileAId: "tile-a",
        tileBId: "tile-b",
        label: "dual",
        createdAt: now,
        updatedAt: now,
      },
    ],
    viewport: { centerX: 0, centerY: 0, zoom: 1 },
  });

  if (_getWriteSpyForTesting() === 0 && _getConnectionWriteSpyForTesting() === 0) {
    console.error("flag-OFF saveState did not write connections to runtime.db");
    cleanup(root, db, kdb);
    return false;
  }

  const runtimeRow = (
    await import("../../quantflow-electron/src/main/runtime-state/connections-repo")
  ).getConnection("conn-dual-write");
  if (!runtimeRow) {
    console.error("flag-OFF dual-write missing runtime.db row");
    cleanup(root, db, kdb);
    return false;
  }

  cleanup(root, db, kdb);
  console.log("connection-round-trip: OK");
  return true;
}

function cleanup(
  root: string,
  db: { close: () => void },
  kdb: unknown,
): void {
  delete process.env.QF_ONE_TRUTH;
  setKernelDbForTesting(null);
  db.close();
  void kdb;
  rmSync(root, { recursive: true, force: true });
}
