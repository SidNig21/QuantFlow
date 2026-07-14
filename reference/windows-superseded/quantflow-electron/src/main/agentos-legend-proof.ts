/**
 * V2 scripted proof — custom AgentOS legend recipe spawns as terminal tile.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 3000;
const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 45_000;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`LEGEND-AGENTOS-PROOF: step=${name} ok=${ok} detail=${detail}`);
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

export async function runLegendAgentosProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);

  const created = await execJs<{ ok: boolean; error?: string }>(wc, `(async () => {
    try {
      await window.shellApi.legendCreate?.({
        id: 'proof-agentos-actor',
        name: 'Proof AgentOS',
        color: '#6366f1',
        icon: 'agentos',
        runtimeTarget: 'agentos',
        harnessKind: 'agentos',
        agentosSoftware: 'pi',
        agentosInstruction: 'Reply with one word: ready',
        type: 'agent',
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })()`);
  if (!created.ok) {
    logStep("legend-create", false, created.error ?? "create failed");
    exitApp(1);
    return;
  }
  logStep("legend-create", true, "recipe=proof-agentos-actor");
  await sleep(800);

  let recipeReady = false;
  const recipeWaitStart = Date.now();
  while (Date.now() - recipeWaitStart < 15_000) {
    const found = await execJs<{ inDock: boolean; inList: boolean }>(wc, `(async () => {
      const inDock = !!document.querySelector('.lv1-recipe[data-recipe="proof-agentos-actor"]');
      const entries = await window.shellApi.legendList?.() ?? [];
      const inList = Array.isArray(entries) && entries.some((e) => e.id === 'proof-agentos-actor');
      return { inDock, inList };
    })()`);
    if (found.inDock || found.inList) {
      recipeReady = true;
      logStep("legend-registry", true, `inDock=${found.inDock} inList=${found.inList}`);
      break;
    }
    await sleep(300);
  }
  if (!recipeReady) {
    logStep("legend-dock", false, "custom recipe not in registry after create");
    exitApp(1);
    return;
  }
  if (await execJs<boolean>(wc, `!!document.querySelector('.lv1-recipe[data-recipe="proof-agentos-actor"]')`)) {
    logStep("legend-dock", true, "custom recipe visible in dock");
  }

  const useCustom = await execJs<boolean>(wc, `!!document.querySelector('.lv1-recipe[data-recipe="proof-agentos-actor"]')`);
  const clicked = await execJs<{ ok: boolean; error?: string }>(wc, `(() => {
    const recipeId = ${useCustom ? '"proof-agentos-actor"' : '"codex"'};
    const btn = document.querySelector(\`.lv1-recipe[data-recipe="\${recipeId}"]\`);
    if (!btn) return { ok: false, error: 'custom recipe button not found' };
    btn.click();
    const panel = document.getElementById('panel-viewer');
    if (!panel) return { ok: false, error: 'panel-viewer not found' };
    const rect = panel.getBoundingClientRect();
    panel.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    logStep("spawn-click", false, clicked.error ?? "click failed");
    exitApp(1);
    return;
  }
  logStep("spawn-click", true, `recipe=${useCustom ? "proof-agentos-actor" : "codex"}`);

  const started = Date.now();
  let tileId: string | null = null;
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{
      tileId: string | null;
      hasWebview: boolean;
      flipped: boolean;
    }>(wc, `(async () => {
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      const tileId = Array.isArray(workers) && workers.length > 0
        ? workers[workers.length - 1]?.tileId ?? null
        : null;
      if (!tileId) return { tileId: null, hasWebview: false, flipped: false };
      const tileEl = document.querySelector(\`[data-tile-id="\${tileId}"]\`);
      const webview = tileEl?.querySelector('webview');
      const flipped = tileEl?.classList.contains('is-flipped') ?? false;
      return { tileId, hasWebview: !!webview, flipped };
    })()`);
    if (poll.tileId && poll.hasWebview && !poll.flipped) {
      tileId = poll.tileId;
      break;
    }
    await sleep(POLL_MS);
  }

  if (!tileId) {
    logStep("terminal-tile", false, "timeout waiting for custom agentos terminal tile");
    exitApp(1);
    return;
  }
  logStep("terminal-tile", true, `tileId=${tileId}`);

  await saveScreenshot(wc, evidenceDir, "V2-00-legend-agentos.png");
  logStep("done", true, evidenceDir);
  exitApp(0);
}
