/**
 * U5 scripted proof — two proof-only Eve dock tiles alive at once.
 */
import type { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promptAgentOsTile } from "./agentos-terminal-bridge";
import {
  assertAgentOsWorkers,
  ensureProofRecipe,
  makeLogStep,
  spawnProofRecipeTile,
  waitForAttach,
} from "./agentos-eve-proof-shared";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot } from "./proof-tile-spawn";

const SETTLE_MS = 2500;

const logStep = makeLogStep("AGENTOS-EVE-MULTISPAWN-PROOF");

async function promptAndAssert(tileId: string, expected: string): Promise<boolean> {
  try {
    const result = await promptAgentOsTile(tileId, `Reply with exactly: ${expected}`);
    const text = result.text.trim();
    const ok = text.includes(expected);
    logStep("prompt-round-trip", ok, `${tileId} -> ${text || "empty reply"}`);
    return ok;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep("prompt-round-trip", false, `${tileId} -> ${detail}`);
    return false;
  }
}

export async function runAgentosEveMultispawnProof(mainWindow: BrowserWindow): Promise<void> {
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

  const okA = await promptAndAssert(tileA, "eve-multi-a-ok");
  const okB = await promptAndAssert(tileB, "eve-multi-b-ok");
  if (!okA || !okB) {
    exitProofApp(1);
    return;
  }

  await saveProofScreenshot(wc, evidenceDir, "V7-01-agentos-eve-multispawn-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
