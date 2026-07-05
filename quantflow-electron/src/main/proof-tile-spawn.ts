/**
 * Shared dock-recipe spawn helper for scripted Electron proofs.
 */
import type { WebContents } from "electron";

const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 35_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
}

export async function spawnDockRecipeTile(
  wc: WebContents,
  recipeId: string,
  offsetX: number,
  excludeTileIds: string[] = [],
): Promise<string | null> {
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
      bubbles: true, cancelable: true,
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

export async function saveProofScreenshot(
  wc: WebContents,
  evidenceDir: string,
  filename: string,
  logStep: (name: string, ok: boolean, detail: string) => void,
): Promise<boolean> {
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
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

export function proofSleep(ms: number): Promise<void> {
  return sleep(ms);
}
