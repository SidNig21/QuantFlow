/**
 * V6 Eve persona A2A proof — Bovada Odds ↔ Canvas Scout on AgentOS fabric.
 */
import { type BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sendConnectionRelay } from "./agentos-a2a-relay";
import { createConnectionViaShell } from "./canvas-rpc";
import { getConnectionById, getStringLog, pushConnectionGraphToHost, syncConnectionGraph } from "./tile-session-registry";
import { proofSleep, saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";
import { exitProofApp } from "./proof-app-lifecycle";

const SETTLE_MS = 2500;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`EVE-A2A-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

export async function runEveA2aProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  const oddsTile = await spawnDockRecipeTile(wc, "bovada-odds", -90, []);
  await proofSleep(1500);
  const scoutTile = await spawnDockRecipeTile(wc, "canvas-scout", 90, oddsTile ? [oddsTile] : []);
  if (!oddsTile || !scoutTile || oddsTile === scoutTile) {
    logStep("spawn-pair", false, `odds=${oddsTile} scout=${scoutTile}`);
    exitProofApp(1);
    return;
  }
  logStep("spawn-pair", true, `${oddsTile}↔${scoutTile}`);

  const createdConnection = await createConnectionViaShell({
    tileAId: oddsTile,
    tileBId: scoutTile,
    label: "eve-a2a-proof",
  });
  const connectionId = typeof createdConnection?.id === "string" ? createdConnection.id : "";
  if (!connectionId) {
    logStep("canvas-cable", false, "renderer returned no connection id");
    exitProofApp(1);
    return;
  }
  const connection = {
    id: connectionId,
    tileAId: oddsTile,
    tileBId: scoutTile,
    label: "eve-a2a-proof",
  };
  await pushConnectionGraphToHost([connection]);
  void syncConnectionGraph([connection]);
  const localConnection = getConnectionById(connectionId);
  if (!localConnection) {
    logStep("canvas-cable", false, `connection registry missing ${connectionId}`);
    exitProofApp(1);
    return;
  }

  const relay = await sendConnectionRelay({
    connectionId,
    fromTileId: oddsTile,
    text: "Report NBA moneyline movement for tonight",
    connection,
  });
  if (!relay.ok) {
    logStep("cable-relay", false, relay.message ?? "relay failed");
    exitProofApp(1);
    return;
  }

  const logs = getStringLog(connectionId, 10);
  const hasAck = logs.some((e) => e.fromTileId === scoutTile && String(e.text).startsWith("ack:"));
  if (!hasAck) {
    logStep("cable-relay", false, "sim ack missing from relay log");
    exitProofApp(1);
    return;
  }
  logStep("cable-relay", true, `connectionId=${connectionId} target=${relay.targetTileId}`);

  await saveProofScreenshot(wc, evidenceDir, "V6-00-eve-a2a.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
