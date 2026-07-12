/**
 * T-UX-lite scripted proof — typed /cable command in an Eve terminal.
 */
import type { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentOsPtySessionIdForTile,
  writeAgentOsPtySession,
} from "./agentos-terminal-bridge";
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
const PTY_TIMEOUT_MS = 120_000;
const RELAY_TIMEOUT_MS = 180_000;
const CABLE_TEXT = "Reply with exactly: cable-chat-ok";
const CABLE_EXPECT = "cable-chat-ok";

const logStep = makeLogStep("AGENTOS-EVE-CABLE-CHAT-PROOF");

async function waitForPty(tileId: string): Promise<string | null> {
  const started = Date.now();
  while (Date.now() - started < PTY_TIMEOUT_MS) {
    const ptySessionId = getAgentOsPtySessionIdForTile(tileId);
    if (ptySessionId) return ptySessionId;
    await proofSleep(500);
  }
  return getAgentOsPtySessionIdForTile(tileId);
}

async function spawnAttachedEvePair(mainWindow: BrowserWindow): Promise<{
  tileA: string;
  tileB: string;
  ptyA: string;
  ptyB: string;
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

  const ptyA = await waitForPty(tileA);
  const ptyB = await waitForPty(tileB);
  if (!ptyA || !ptyB) {
    logStep("pty-bridge", false, `ptyA=${ptyA ?? "null"} ptyB=${ptyB ?? "null"}`);
    return null;
  }
  logStep("pty-bridge", true, `ptyA=${ptyA} ptyB=${ptyB}`);

  if (!(await assertAgentOsWorkers(wc, [tileA, tileB], logStep))) return null;
  return { tileA, tileB, ptyA, ptyB };
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

  const connectionId = `conn-eve-cable-chat-${Date.now()}`;
  syncConnectionGraph([{
    id: connectionId,
    tileAId: pair.tileA,
    tileBId: pair.tileB,
    label: "eve-cable-chat",
  }]);

  await writeAgentOsPtySession(pair.ptyA, `/cable ${CABLE_TEXT}\r`);
  if (!(await waitForRelayLog(connectionId, pair.tileA, pair.tileB))) {
    exitProofApp(1);
    return;
  }

  const beforePlain = getStringLog(connectionId, 50).length;
  await writeAgentOsPtySession(pair.ptyA, "plain local line\r");
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
