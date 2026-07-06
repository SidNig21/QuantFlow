/**
 * V4 scripted proof — two pi-stick AgentOS sessions, cable relay, sim ack.
 */
import { type BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sendConnectionRelay } from "./agentos-a2a-relay";
import { getStringLog, syncConnectionGraph } from "./tile-session-registry";
import { proofSleep, saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";
import { exitProofApp } from "./proof-app-lifecycle";

const SETTLE_MS = 2500;
const RECIPE_ID = "pi-stick";

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`AGENTOS-A2A-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

export async function runA2aCableProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  const tileA = await spawnDockRecipeTile(wc, RECIPE_ID, -80, []);
  await proofSleep(1500);
  const tileB = await spawnDockRecipeTile(wc, RECIPE_ID, 80, tileA ? [tileA] : []);
  if (!tileA || !tileB || tileA === tileB) {
    logStep("spawn-pair", false, `tileA=${tileA} tileB=${tileB}`);
    exitProofApp(1);
    return;
  }
  logStep("spawn-pair", true, `tileA=${tileA} tileB=${tileB}`);

  const connectionId = `conn-a2a-${Date.now()}`;
  syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB, label: "a2a-proof" }]);

  const relay = await sendConnectionRelay({
    connectionId,
    fromTileId: tileA,
    text: "Reply with exactly PONG",
  });
  if (!relay.ok) {
    logStep("cable-relay", false, relay.message ?? "relay failed");
    exitProofApp(1);
    return;
  }

  const logs = getStringLog(connectionId, 10);
  const hasAck = logs.some((e) => e.fromTileId === tileB && String(e.text).startsWith("ack:"));
  if (!hasAck) {
    logStep("cable-relay", false, "sim ack missing from relay log");
    exitProofApp(1);
    return;
  }
  logStep("cable-relay", true, `connectionId=${connectionId} target=${relay.targetTileId}`);

  const screenshot = process.env.QF_AGENTOS_A2A_PROOF === "1"
    ? "V6-00-agentos-a2a-live.png"
    : "V4-00-a2a-cable.png";
  await saveProofScreenshot(wc, evidenceDir, screenshot, logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
