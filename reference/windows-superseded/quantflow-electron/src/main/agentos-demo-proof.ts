/**
 * V6 end-to-end demo proof — spawn actors, cable, orchestrator delegation.
 */
import { type BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runHermesOrchestrator } from "./agentos-orchestrator";
import { sendConnectionRelay } from "./agentos-a2a-relay";
import { syncConnectionGraph } from "./tile-session-registry";
import { proofSleep, saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";
import { exitProofApp } from "./proof-app-lifecycle";

const SETTLE_MS = 2500;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`ACTORS-DEMO-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

export async function runActorsDemoProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const runTag = process.env.QF_ACTORS_DEMO_RUN ?? "1";

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  const spawned: string[] = [];
  const hermesTile = await spawnDockRecipeTile(wc, "hermes", -120, spawned);
  if (hermesTile) spawned.push(hermesTile);
  await proofSleep(1200);
  const codexTile = await spawnDockRecipeTile(wc, "codex", 0, spawned);
  if (codexTile) spawned.push(codexTile);
  await proofSleep(1200);
  const claudeTile = await spawnDockRecipeTile(wc, "claude", 120, spawned);
  if (!hermesTile || !codexTile || !claudeTile
    || new Set([hermesTile, codexTile, claudeTile]).size !== 3) {
    logStep("spawn-trio", false, `hermes=${hermesTile} codex=${codexTile} claude=${claudeTile}`);
    exitProofApp(1);
    return;
  }
  logStep("spawn-trio", true, `${hermesTile},${codexTile},${claudeTile}`);
  await proofSleep(2000);

  const connOrchWorker = `conn-demo-orch-${runTag}`;
  const connManual = `conn-demo-manual-${runTag}`;

  syncConnectionGraph([
    { id: connOrchWorker, tileAId: hermesTile, tileBId: codexTile },
    { id: connManual, tileAId: codexTile, tileBId: claudeTile },
  ]);
  logStep("sync-graph", true, connManual);

  const manual = await sendConnectionRelay({
    connectionId: connManual,
    fromTileId: codexTile,
    text: "Hand off review to Claude",
  });
  if (!manual.ok) {
    logStep("cables", false, manual.message ?? "manual relay failed");
    exitProofApp(1);
    return;
  }
  logStep("cables", true, `${connOrchWorker}+${connManual}`);

  const orch = await runHermesOrchestrator({
    orchestratorTileId: hermesTile,
    goal: "Demo: confirm workspace is reachable",
    workers: [{ tileId: codexTile, software: "pi" }],
    connectionIds: [connOrchWorker],
  });
  if (!orch.ok) {
    logStep("orchestrate", false, JSON.stringify(orch.delegations));
    exitProofApp(1);
    return;
  }
  logStep("orchestrate", true, "hermes→codex delegated");

  await saveProofScreenshot(wc, evidenceDir, `V6-00-actors-demo-run${runTag}.png`, logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
