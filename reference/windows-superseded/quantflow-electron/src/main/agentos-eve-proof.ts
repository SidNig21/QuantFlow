/**
 * U4 scripted proof — proof-only Eve dock recipe → AgentOS attach → prompt round-trip.
 */
import type { BrowserWindow, WebContents } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentOsTileAttach,
  promptAgentOsTile,
} from "./agentos-terminal-bridge";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot } from "./proof-tile-spawn";

const SETTLE_MS = 2500;
const SPAWN_TIMEOUT_MS = 180_000;
const ATTACH_TIMEOUT_MS = 180_000;
const RECIPE_ID = "proof-eve-agentos";
const PROMPT = "Reply with exactly: eve-proof-ok";

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`AGENTOS-EVE-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
}

async function createProofRecipe(wc: WebContents): Promise<boolean> {
  const created = await execJs<{ ok: boolean; error?: string }>(wc, `(async () => {
    try {
      await window.shellApi.legendCreate?.({
        id: ${JSON.stringify(RECIPE_ID)},
        name: 'Proof Eve',
        color: '#8b5cf6',
        icon: 'agentos',
        runtimeTarget: 'agentos',
        harnessKind: 'agentos',
        agentosSoftware: 'eve',
        type: 'agent',
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })()`);
  if (!created.ok) {
    logStep("legend-create", false, created.error ?? "create failed");
    return false;
  }
  await execJs(wc, `window.__quantflowRefreshLegendRegistry?.()`);
  logStep("legend-create", true, `recipe=${RECIPE_ID}`);
  return true;
}

async function waitForRecipe(wc: WebContents): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    await execJs(wc, `window.__quantflowRefreshLegendRegistry?.()`);
    const found = await execJs<{ inDock: boolean; inList: boolean; software: string | null }>(wc, `(async () => {
      const inDock = !!document.querySelector('.lv1-recipe[data-recipe="${RECIPE_ID}"]');
      const entries = await window.shellApi.legendList?.() ?? [];
      const recipe = Array.isArray(entries) ? entries.find((e) => e?.id === ${JSON.stringify(RECIPE_ID)}) : null;
      return {
        inDock,
        inList: !!recipe,
        software: recipe?.agentosSoftware ?? null,
      };
    })()`);
    if ((found.inDock || found.inList) && found.software === "eve") {
      logStep("legend-registry", true, `inDock=${found.inDock} software=${found.software}`);
      return true;
    }
    await proofSleep(300);
  }
  logStep("legend-registry", false, `recipe=${RECIPE_ID} not visible with agentosSoftware=eve`);
  return false;
}

async function spawnProofRecipeTile(wc: WebContents): Promise<string | null> {
  const baseline = await execJs<number>(wc, `(async () => {
    const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
    return Array.isArray(workers) ? workers.length : 0;
  })()`);

  const clicked = await execJs<{ ok: boolean; error?: string }>(wc, `(() => {
    const btn = document.querySelector('.lv1-recipe[data-recipe="${RECIPE_ID}"]');
    if (!btn) return { ok: false, error: 'recipe ${RECIPE_ID} not found' };
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
    return null;
  }
  logStep("spawn-click", true, `recipe=${RECIPE_ID}`);

  const started = Date.now();
  let last = "waiting";
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{
      tileId: string | null;
      workerCount: number;
      hasTile: boolean;
      hasWebview: boolean;
      status: string | null;
    }>(wc, `(async () => {
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      const list = Array.isArray(workers) ? workers : [];
      const tileId = list.length > ${baseline}
        ? [...list].reverse().map((w) => w?.tileId).find(Boolean) ?? null
        : null;
      const tileEl = tileId ? document.querySelector(\`[data-tile-id="\${tileId}"]\`) : null;
      return {
        tileId,
        workerCount: list.length,
        hasTile: !!tileEl,
        hasWebview: !!tileEl?.querySelector('webview'),
        status: tileId ? list.find((w) => w?.tileId === tileId)?.status ?? null : null,
      };
    })()`);
    last = `workers=${poll.workerCount} tile=${poll.tileId ?? "null"} dom=${poll.hasTile} webview=${poll.hasWebview} status=${poll.status ?? "null"}`;
    if (poll.tileId && poll.hasTile) {
      logStep("spawn-eve", true, last);
      return poll.tileId;
    }
    await proofSleep(500);
  }
  logStep("spawn-eve", false, last);
  return null;
}

async function waitForAttach(tileId: string): Promise<ReturnType<typeof getAgentOsTileAttach>> {
  const started = Date.now();
  while (Date.now() - started < ATTACH_TIMEOUT_MS) {
    const attach = getAgentOsTileAttach(tileId);
    if (attach?.sessionId) return attach;
    await proofSleep(500);
  }
  return getAgentOsTileAttach(tileId);
}

async function assertAgentOsRailTile(wc: WebContents, tileId: string): Promise<boolean> {
  const check = await execJs<{
    ok: boolean;
    runtimeTarget: string | null;
    isAgentOs: boolean;
  }>(wc, `(async () => {
    const tileId = ${JSON.stringify(tileId)};
    const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
    const worker = Array.isArray(workers)
      ? workers.find((entry) => entry?.tileId === tileId)
      : null;
    const runtimeTarget = worker?.runtimeTarget ?? worker?.harnessKind ?? null;
    const tileEl = document.querySelector(\`[data-tile-id="\${tileId}"]\`);
    const webview = tileEl?.querySelector('webview');
    const src = webview?.getAttribute('src') ?? '';
    const decoded = decodeURIComponent(src);
    const isAgentOs = runtimeTarget === 'agentos'
      || decoded.includes('target=agentos')
      || decoded.includes('agentos%3A');
    return { ok: !!webview && isAgentOs, runtimeTarget, isAgentOs };
  })()`);
  if (!check.ok) {
    logStep(
      "agentos-rail",
      false,
      `runtime=${check.runtimeTarget ?? "null"} agentos=${check.isAgentOs}`,
    );
    return false;
  }
  logStep("agentos-rail", true, `runtime=${check.runtimeTarget ?? "agentos"}`);
  return true;
}

export async function runAgentosEveProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v7", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  if (!(await createProofRecipe(wc)) || !(await waitForRecipe(wc))) {
    exitProofApp(1);
    return;
  }

  const tileId = await spawnProofRecipeTile(wc);
  if (!tileId) {
    logStep("spawn-eve", false, "dock spawn failed");
    exitProofApp(1);
    return;
  }
  logStep("spawn-eve", true, `tileId=${tileId}`);

  const attach = await waitForAttach(tileId);
  if (!attach?.sessionId || attach.software !== "eve") {
    logStep(
      "session-attach",
      false,
      `software=${attach?.software ?? "null"} session=${attach?.sessionId ?? "null"}`,
    );
    exitProofApp(1);
    return;
  }
  logStep("session-attach", true, `sessionId=${attach.sessionId} software=${attach.software}`);

  if (!(await assertAgentOsRailTile(wc, tileId))) {
    exitProofApp(1);
    return;
  }

  try {
    const result = await promptAgentOsTile(tileId, PROMPT);
    const text = result.text.trim();
    const sim = process.env.QF_AGENTOS_SIM === "1";
    const ok = sim ? text.length > 0 : text.includes("eve-proof-ok");
    logStep("prompt-round-trip", ok, text || "empty reply");
    if (!ok) {
      exitProofApp(1);
      return;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep("prompt-round-trip", false, detail);
    exitProofApp(1);
    return;
  }

  await saveProofScreenshot(wc, evidenceDir, "V7-00-agentos-eve-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
