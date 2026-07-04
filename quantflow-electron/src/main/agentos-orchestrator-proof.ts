/**
 * V5 scripted proof — Hermes orchestrator spawns worker and delegates via cable.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHermesOrchestrator } from "./agentos-orchestrator";
import { syncConnectionGraph } from "./tile-session-registry";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 2500;
const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 30_000;

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

async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
}

async function saveScreenshot(
  wc: WebContents,
  evidenceDir: string,
  filename: string,
): Promise<boolean> {
  try {
    const image = await wc.capturePage();
    const png = image.toPNG();
    writeFileSync(join(evidenceDir, filename), png);
    logStep(`screenshot-${filename}`, true, `${png.byteLength} bytes`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep(`screenshot-${filename}`, false, detail);
    return false;
  }
}

async function spawnRecipe(wc: WebContents, recipeId: string, offsetX: number, excludeTileIds: string[] = []): Promise<string | null> {
  const baseline = await execJs<number>(wc, `(async () => {
    const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
    return Array.isArray(workers) ? workers.length : 0;
  })()`);

  const clicked = await execJs<{ ok: boolean; error?: string }>(wc, `(() => {
    const btn = document.querySelector('.lv1-recipe[data-recipe="${recipeId}"]');
    if (!btn) return { ok: false, error: 'recipe ${recipeId} not found' };
    btn.click();
    const panel = document.getElementById('panel-viewer');
    if (!panel) return { ok: false, error: 'panel-viewer not found' };
    const rect = panel.getBoundingClientRect();
    panel.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2 + ${offsetX},
      clientY: rect.top + rect.height / 2,
    }));
    return { ok: true };
  })()`);
  if (!clicked.ok) return null;

  const started = Date.now();
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{ tileId: string | null; hasWebview: boolean; flipped: boolean }>(wc, `(async () => {
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      if (!Array.isArray(workers) || workers.length <= ${baseline}) {
        return { tileId: null, hasWebview: false, flipped: false };
      }
      const exclude = new Set(${JSON.stringify(excludeTileIds)});
      const tileId = [...workers].reverse().map((w) => w?.tileId).find((id) => id && !exclude.has(id)) ?? null;
      if (!tileId) return { tileId: null, hasWebview: false, flipped: false };
      const tileEl = document.querySelector(\`[data-tile-id="\${tileId}"]\`);
      return {
        tileId,
        hasWebview: !!tileEl?.querySelector('webview'),
        flipped: tileEl?.classList.contains('is-flipped') ?? false,
      };
    })()`);
    if (poll.tileId && poll.hasWebview && !poll.flipped) return poll.tileId;
    await sleep(POLL_MS);
  }
  return null;
}

export async function runOrchestratorProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);

  const orchestratorTileId = await spawnRecipe(wc, "hermes", -100, []);
  await sleep(1500);
  const workerTileId = await spawnRecipe(wc, "codex", 100, orchestratorTileId ? [orchestratorTileId] : []);
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

  await saveScreenshot(wc, evidenceDir, "V5-00-orchestrator.png");
  logStep("done", true, evidenceDir);
  exitApp(0);
}
