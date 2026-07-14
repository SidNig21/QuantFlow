/**
 * Shared helpers for Eve AgentOS scripted proofs (U5 multispawn, U6 A2A live).
 * Extracted from agentos-eve-multispawn-proof.ts — behavior must stay identical
 * for existing callers; each proof supplies its own logStep prefix.
 */
import type { WebContents } from "electron";
import { getAgentOsTileAttach } from "./agentos-terminal-bridge";
import { proofSleep } from "./proof-tile-spawn";

export const SPAWN_TIMEOUT_MS = 180_000;
export const ATTACH_TIMEOUT_MS = 180_000;
// Founder-locked 2026-07-13: proofs seed and click the SAME dock entry the
// operator uses (~/.quantflow/roles/eve-agentos.json), never a parallel
// "proof" recipe that can drift from the real one.
export const RECIPE_ID = "eve-agentos";

export type LogStep = (name: string, ok: boolean, detail: string) => void;

export function makeLogStep(prefix: string): LogStep {
  return (name: string, ok: boolean, detail: string): void => {
    console.log(`${prefix}: step=${name} ok=${ok} detail=${detail}`);
  };
}

export async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
}

export async function ensureProofRecipe(wc: WebContents, logStep: LogStep): Promise<boolean> {
  const created = await execJs<{ ok: boolean; error?: string }>(wc, `(async () => {
    try {
      const entries = await window.shellApi.legendList?.() ?? [];
      if (Array.isArray(entries) && entries.some((entry) => entry?.id === ${JSON.stringify(RECIPE_ID)})) {
        return { ok: true };
      }
      // Mirror of the operator's live recipe (~/.quantflow/roles/eve-agentos.json).
      // If the live recipe gains fields, mirror them here.
      await window.shellApi.legendCreate?.({
        id: ${JSON.stringify(RECIPE_ID)},
        name: 'Eve',
        description: 'Eve on the AgentOS rail',
        color: '#8b5cf6',
        icon: 'agentos',
        runtimeTarget: 'agentos',
        cwdPolicy: 'workspace',
        defaultShell: 'auto',
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

export async function spawnProofRecipeTile(
  wc: WebContents,
  offsetX: number,
  excludeTileIds: string[],
  logStep: LogStep,
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

export async function waitForAttach(tileId: string): Promise<ReturnType<typeof getAgentOsTileAttach>> {
  const started = Date.now();
  while (Date.now() - started < ATTACH_TIMEOUT_MS) {
    const attach = getAgentOsTileAttach(tileId);
    if (attach?.sessionId) return attach;
    await proofSleep(500);
  }
  return getAgentOsTileAttach(tileId);
}

export async function assertAgentOsWorkers(
  wc: WebContents,
  tileIds: string[],
  logStep: LogStep,
): Promise<boolean> {
  let check: { ok: boolean; detail: string } = { ok: false, detail: "not checked" };
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    check = await execJs<{ ok: boolean; detail: string }>(wc, `(async () => {
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
    if (check.ok) break;
    await proofSleep(500);
  }
  logStep("worker-runtime", check.ok, check.detail);
  return check.ok;
}
