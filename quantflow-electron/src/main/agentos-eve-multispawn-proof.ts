/**
 * U5 scripted proof — two proof-only Eve dock tiles alive at once.
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

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`AGENTOS-EVE-MULTISPAWN-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
}

async function ensureProofRecipe(wc: WebContents): Promise<boolean> {
  const created = await execJs<{ ok: boolean; error?: string }>(wc, `(async () => {
    try {
      const entries = await window.shellApi.legendList?.() ?? [];
      if (Array.isArray(entries) && entries.some((entry) => entry?.id === ${JSON.stringify(RECIPE_ID)})) {
        return { ok: true };
      }
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

  const started = Date.now();
  while (Date.now() - started < 15_000) {
    await execJs(wc, `window.__quantflowRefreshLegendRegistry?.()`);
    const found = await execJs<{ inDock: boolean; software: string | null }>(wc, `(async () => {
      const inDock = !!document.querySelector('.lv1-recipe[data-recipe="${RECIPE_ID}"]');
      const entries = await window.shellApi.legendList?.() ?? [];
      const recipe = Array.isArray(entries) ? entries.find((entry) => entry?.id === ${JSON.stringify(RECIPE_ID)}) : null;
      return { inDock, software: recipe?.agentosSoftware ?? null };
    })()`);
    if (found.inDock && found.software === "eve") {
      logStep("legend-registry", true, `recipe=${RECIPE_ID} software=${found.software}`);
      return true;
    }
    await proofSleep(300);
  }
  logStep("legend-registry", false, `recipe=${RECIPE_ID} not visible`);
  return false;
}

async function spawnProofRecipeTile(
  wc: WebContents,
  offsetX: number,
  excludeTileIds: string[],
): Promise<string | null> {
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
      clientX: rect.left + rect.width / 2 + ${offsetX},
      clientY: rect.top + rect.height / 2,
    }));
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    logStep("spawn-click", false, clicked.error ?? "click failed");
    return null;
  }

  const started = Date.now();
  let last = "waiting";
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{
      tileId: string | null;
      workerCount: number;
      hasTile: boolean;
      status: string | null;
    }>(wc, `(async () => {
      const exclude = new Set(${JSON.stringify(excludeTileIds)});
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      const list = Array.isArray(workers) ? workers : [];
      const tileId = list.length > ${baseline}
        ? [...list].reverse().map((w) => w?.tileId).find((id) => id && !exclude.has(id)) ?? null
        : null;
      const tileEl = tileId ? document.querySelector(\`[data-tile-id="\${tileId}"]\`) : null;
      return {
        tileId,
        workerCount: list.length,
        hasTile: !!tileEl,
        status: tileId ? list.find((w) => w?.tileId === tileId)?.status ?? null : null,
      };
    })()`);
    last = `workers=${poll.workerCount} tile=${poll.tileId ?? "null"} dom=${poll.hasTile} status=${poll.status ?? "null"}`;
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

async function assertAgentOsWorkers(wc: WebContents, tileIds: string[]): Promise<boolean> {
  const check = await execJs<{ ok: boolean; detail: string }>(wc, `(async () => {
    const tileIds = ${JSON.stringify(tileIds)};
    const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
    const list = Array.isArray(workers) ? workers : [];
    const details = tileIds.map((tileId) => {
      const worker = list.find((entry) => entry?.tileId === tileId);
      const runtime = worker?.runtimeTarget ?? worker?.harnessKind ?? null;
      // kernel worker rows do not carry runtimeTarget; fall back to the
      // tile webview src, same as the U4 agentos-rail check
      const tileEl = document.querySelector('[data-tile-id="' + tileId + '"]');
      const webview = tileEl?.querySelector('webview');
      const decoded = decodeURIComponent(webview?.getAttribute('src') ?? '');
      const isAgentOs = runtime === 'agentos'
        || decoded.includes('target=agentos')
        || decoded.includes('agentos%3A');
      return { tileId, runtime, isAgentOs, hasWebview: !!webview };
    });
    return {
      ok: details.every((entry) => entry.isAgentOs && entry.hasWebview),
      detail: JSON.stringify(details),
    };
  })()`);
  logStep("worker-runtime", check.ok, check.detail);
  return check.ok;
}

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

  if (!(await ensureProofRecipe(wc))) {
    exitProofApp(1);
    return;
  }

  const tileA = await spawnProofRecipeTile(wc, -120, []);
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

  const tileB = await spawnProofRecipeTile(wc, 120, [tileA]);
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
  if (!distinct || !(await assertAgentOsWorkers(wc, [tileA, tileB]))) {
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
