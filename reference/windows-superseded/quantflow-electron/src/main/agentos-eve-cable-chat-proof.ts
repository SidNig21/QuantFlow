/**
 * T-UX-lite scripted proof — typed /cable command from an Eve session tile.
 * Drives submitEveTileChat, the exact seam the tile's Send input calls over
 * IPC, so the assertion covers the operator's real input route.
 */
import type { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { submitEveTileChat } from "./agentos-terminal-bridge";
import { createConnectionViaShell } from "./canvas-rpc";
import {
  assertAgentOsWorkers,
  ensureProofRecipe,
  makeLogStep,
  spawnProofRecipeTile,
  waitForAttach,
} from "./agentos-eve-proof-shared";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot } from "./proof-tile-spawn";
import { getStringLog, pushConnectionGraphToHost } from "./tile-session-registry";

const SETTLE_MS = 2500;
const RELAY_TIMEOUT_MS = 180_000;
const CABLE_TEXT = "Reply with exactly: cable-chat-ok";
const CABLE_EXPECT = "cable-chat-ok";

const logStep = makeLogStep("AGENTOS-EVE-CABLE-CHAT-PROOF");

async function spawnAttachedEvePair(mainWindow: BrowserWindow): Promise<{
  tileA: string;
  tileB: string;
} | null> {
  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  if (!(await ensureProofRecipe(wc, logStep))) return null;

  const tileA = await spawnProofRecipeTile(wc, -120, [], logStep);
  if (!tileA) return null;
  const attachA = await waitForAttach(tileA);
  if (!attachA?.sessionId || attachA.software !== "eve") {
    logStep("session-attach-a", false, `software=${attachA?.software ?? "null"} session=${attachA?.sessionId ?? "null"}`);
    return null;
  }
  logStep("session-attach-a", true, `tile=${tileA} session=${attachA.sessionId}`);

  const tileB = await spawnProofRecipeTile(wc, 120, [tileA], logStep);
  if (!tileB || tileB === tileA) {
    logStep("spawn-pair", false, `tileA=${tileA} tileB=${tileB}`);
    return null;
  }
  const attachB = await waitForAttach(tileB);
  if (!attachB?.sessionId || attachB.software !== "eve") {
    logStep("session-attach-b", false, `software=${attachB?.software ?? "null"} session=${attachB?.sessionId ?? "null"}`);
    return null;
  }
  logStep("session-attach-b", true, `tile=${tileB} session=${attachB.sessionId}`);

  if (!(await assertAgentOsWorkers(wc, [tileA, tileB], logStep))) return null;
  return { tileA, tileB };
}

async function waitForRelayLog(connectionId: string, tileA: string, tileB: string): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < RELAY_TIMEOUT_MS) {
    const log = getStringLog(connectionId, 20);
    const forward = log.some((entry) =>
      entry.fromTileId === tileA && entry.toTileId === tileB && entry.text === CABLE_TEXT);
    const backward = log.some((entry) =>
      entry.fromTileId === tileB && entry.toTileId === tileA && entry.text.includes(CABLE_EXPECT));
    if (forward && backward) {
      logStep("relay-log", true, `forward=${forward} backward=${backward} entries=${log.length}`);
      return true;
    }
    await proofSleep(1000);
  }
  const log = getStringLog(connectionId, 20);
  logStep("relay-log", false, `entries=${JSON.stringify(log)}`);
  return false;
}

export async function runAgentosEveCableChatProof(mainWindow: BrowserWindow): Promise<void> {
  if (process.env.QF_AGENTOS_SIM === "1") {
    logStep("sim-mode-guard", false, "sim-mode forbidden for cable-chat live proof");
    exitProofApp(1);
    return;
  }

  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v7", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const pair = await spawnAttachedEvePair(mainWindow);
  if (!pair) {
    exitProofApp(1);
    return;
  }

  const createdConnection = await createConnectionViaShell({
    tileAId: pair.tileA,
    tileBId: pair.tileB,
    label: "eve-cable-chat",
  });
  const connectionId = typeof createdConnection?.id === "string" ? createdConnection.id : "";
  if (!connectionId) {
    logStep("canvas-cable", false, "renderer returned no connection id");
    exitProofApp(1);
    return;
  }
  await pushConnectionGraphToHost([{
    id: connectionId,
    tileAId: pair.tileA,
    tileBId: pair.tileB,
    label: "eve-cable-chat",
  }]);

  try {
    const cableResult = await submitEveTileChat(pair.tileA, `/cable ${CABLE_TEXT}`);
    logStep("cable-submit", true, `reply=${cableResult.text.slice(0, 120)}`);
  } catch (error) {
    logStep("cable-submit", false, error instanceof Error ? error.message : String(error));
    exitProofApp(1);
    return;
  }
  if (!(await waitForRelayLog(connectionId, pair.tileA, pair.tileB))) {
    exitProofApp(1);
    return;
  }

  const beforePlain = getStringLog(connectionId, 50).length;
  try {
    await submitEveTileChat(pair.tileA, "Answer locally in one word: what color is the sky?");
  } catch (error) {
    logStep("plain-local-submit", false, error instanceof Error ? error.message : String(error));
    exitProofApp(1);
    return;
  }
  await proofSleep(5000);
  const afterPlain = getStringLog(connectionId, 50).length;
  const plainOk = beforePlain === afterPlain;
  logStep("plain-local-negative", plainOk, `before=${beforePlain} after=${afterPlain}`);
  if (!plainOk) {
    exitProofApp(1);
    return;
  }

  await saveProofScreenshot(mainWindow.webContents, evidenceDir, "V7-03-agentos-eve-cable-chat-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
