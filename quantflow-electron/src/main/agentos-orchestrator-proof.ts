/**
 * V5 scripted proof — Hermes orchestrator spawns worker and delegates via cable.
 */
import { app, type BrowserWindow } from "electron";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHermesOrchestrator } from "./agentos-orchestrator";
import { saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";
import { syncConnectionGraph } from "./tile-session-registry";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 2500;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`ORCHESTRATOR-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

function killPtySidecar(): void {
  try {
    const data = JSON.parse(readFileSync(SIDECAR_PID_PATH, "utf-8")) as { pid?: unknown };
    const pid = typeof data.pid === "number" ? data.pid : NaN;
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch {
    // No sidecar.
  }
}

function exitApp(code: number): void {
  killPtySidecar();
  app.exit(code);
  setTimeout(() => process.exit(code), 2000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runOrchestratorProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);

  const orchestratorTileId = await spawnDockRecipeTile(wc, "hermes", -100, []);
  await sleep(1500);
  const workerTileId = await spawnDockRecipeTile(
    wc,
    "codex",
    100,
    orchestratorTileId ? [orchestratorTileId] : [],
  );
  if (!orchestratorTileId || !workerTileId || orchestratorTileId === workerTileId) {
    logStep("spawn-pair", false, `orch=${orchestratorTileId} worker=${workerTileId}`);
    exitApp(1);
    return;
  }
  logStep("spawn-pair", true, `hermes=${orchestratorTileId} codex=${workerTileId}`);

  const connectionId = `conn-orch-${Date.now()}`;
  syncConnectionGraph([{
    id: connectionId,
    tileAId: orchestratorTileId,
    tileBId: workerTileId,
    label: "orchestrator-worker",
  }]);
  logStep("cable", true, connectionId);

  const orchResult = await runHermesOrchestrator({
    orchestratorTileId,
    goal: "List three files in the workspace root",
    workers: [{ tileId: workerTileId, software: "pi" }],
    connectionIds: [connectionId],
  });
  if (!orchResult.ok) {
    logStep("orchestrate", false, JSON.stringify(orchResult.delegations));
    exitApp(1);
    return;
  }
  logStep("orchestrate", true, `delegations=${orchResult.delegations.length}`);

  await saveProofScreenshot(wc, evidenceDir, "V5-00-orchestrator.png", logStep);
  logStep("done", true, evidenceDir);
  exitApp(0);
}
