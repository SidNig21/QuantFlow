/**
 * U6 scripted proof — live A2A cable relay between two real Eve AgentOS tiles.
 */
import type { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sendConnectionRelay } from "./agentos-a2a-relay";
import {
  assertAgentOsWorkers,
  ensureProofRecipe,
  makeLogStep,
  spawnProofRecipeTile,
  waitForAttach,
} from "./agentos-eve-proof-shared";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot } from "./proof-tile-spawn";
import { getStringLog, syncConnectionGraph } from "./tile-session-registry";

const SETTLE_MS = 2500;
const RELAY_TEXT = "Reply with exactly: eve-a2a-u6-ok";
const RELAY_EXPECT = "eve-a2a-u6-ok";

const logStep = makeLogStep("AGENTOS-EVE-A2A-PROOF");

export async function runAgentosEveA2aLiveProof(mainWindow: BrowserWindow): Promise<void> {
  if (process.env.QF_AGENTOS_SIM === "1") {
    logStep("sim-mode-guard", false, "sim-mode forbidden for U6 live proof");
    exitProofApp(1);
    return;
  }

  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v7", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  if (!(await ensureProofRecipe(wc, logStep))) {
    exitProofApp(1);
    return;
  }

  const tileA = await spawnProofRecipeTile(wc, -120, [], logStep);
  if (!tileA) {
    exitProofApp(1);
    return;
  }
  const attachA = await waitForAttach(tileA);
  if (!attachA?.sessionId || attachA.software !== "eve") {
    logStep("session-attach-a", false, `software=${attachA?.software ?? "null"} session=${attachA?.sessionId ?? "null"}`);
    exitProofApp(1);
    return;
  }
  logStep("session-attach-a", true, `tile=${tileA} session=${attachA.sessionId} actorKey=${JSON.stringify([attachA.workspaceId, attachA.tileId])}`);

  const tileB = await spawnProofRecipeTile(wc, 120, [tileA], logStep);
  if (!tileB || tileB === tileA) {
    logStep("spawn-pair", false, `tileA=${tileA} tileB=${tileB}`);
    exitProofApp(1);
    return;
  }
  const attachB = await waitForAttach(tileB);
  if (!attachB?.sessionId || attachB.software !== "eve") {
    logStep("session-attach-b", false, `software=${attachB?.software ?? "null"} session=${attachB?.sessionId ?? "null"}`);
    exitProofApp(1);
    return;
  }
  logStep("session-attach-b", true, `tile=${tileB} session=${attachB.sessionId} actorKey=${JSON.stringify([attachB.workspaceId, attachB.tileId])}`);

  const distinct = tileA !== tileB
    && attachA.sessionId !== attachB.sessionId
    && JSON.stringify([attachA.workspaceId, attachA.tileId]) !== JSON.stringify([attachB.workspaceId, attachB.tileId]);
  logStep("distinct-actors", distinct, `tileA=${tileA} tileB=${tileB} sessionA=${attachA.sessionId} sessionB=${attachB.sessionId}`);
  if (!distinct || !(await assertAgentOsWorkers(wc, [tileA, tileB], logStep))) {
    exitProofApp(1);
    return;
  }

  const connectionId = `conn-eve-a2a-${Date.now()}`;
  syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB, label: "eve-a2a-u6" }]);

  const relay = await sendConnectionRelay({
    connectionId,
    fromTileId: tileA,
    text: RELAY_TEXT,
  });
  const relayOk = relay.ok
    && relay.targetTileId === tileB
    && typeof relay.reply === "string"
    && relay.reply.includes(RELAY_EXPECT);
  logStep("cable-relay", relayOk, `ok=${relay.ok} target=${relay.targetTileId ?? "null"} reply=${relay.reply ?? "null"} message=${relay.message ?? "null"}`);
  if (!relayOk) {
    exitProofApp(1);
    return;
  }

  const log = getStringLog(connectionId, 10);
  const forward = log.some((entry) => entry.fromTileId === tileA && entry.toTileId === tileB && entry.text === RELAY_TEXT);
  const backward = log.some((entry) => entry.fromTileId === tileB && entry.toTileId === tileA && entry.text.includes(RELAY_EXPECT));
  const logOk = forward && backward;
  logStep("relay-log", logOk, `forward=${forward} backward=${backward} entries=${log.length}`);
  if (!logOk) {
    exitProofApp(1);
    return;
  }

  await saveProofScreenshot(wc, evidenceDir, "V7-02-agentos-eve-a2a-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
