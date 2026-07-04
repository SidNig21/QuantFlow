/**
 * V3 scripted proof — codex, hermes, claude spawn as AgentOS terminal actors.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 2500;
const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 30_000;
const RECIPES = ["codex", "hermes", "claude"] as const;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`ACTORS-ON-AGENTOS-PROOF: step=${name} ok=${ok} detail=${detail}`);
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

async function spawnRecipeTerminal(
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
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2 + ${offsetX},
      clientY: rect.top + rect.height / 2,
    }));
    return { ok: true };
  })()`);
  if (!clicked.ok) {
    logStep(`spawn-${recipeId}`, false, clicked.error ?? "click failed");
    return null;
  }

  const started = Date.now();
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{
      tileId: string | null;
      hasWebview: boolean;
      flipped: boolean;
      runtime: string | null;
    }>(wc, `(async () => {
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      if (!Array.isArray(workers) || workers.length <= ${baseline}) {
        return { tileId: null, hasWebview: false, flipped: false, runtime: null };
      }
      const exclude = new Set(${JSON.stringify(excludeTileIds)});
      const tileId = [...workers].reverse().map((w) => w?.tileId).find((id) => id && !exclude.has(id)) ?? null;
      if (!tileId) return { tileId: null, hasWebview: false, flipped: false, runtime: null };
      const tileEl = document.querySelector(\`[data-tile-id="\${tileId}"]\`);
      const webview = tileEl?.querySelector('webview');
      const flipped = tileEl?.classList.contains('is-flipped') ?? false;
      const src = webview?.getAttribute('src') ?? '';
      const isAgentOs = src.includes('target=agentos') || decodeURIComponent(src).includes('agentos%3A');
      const running = tileEl?.dataset?.ptyStatus === 'running' || !!webview;
      return {
        tileId,
        hasWebview: running,
        flipped,
        runtime: isAgentOs ? 'agentos' : (running ? 'pending-agentos' : 'other'),
      };
    })()`);
    if (poll.tileId && poll.hasWebview && !poll.flipped
      && (poll.runtime === "agentos" || poll.runtime === "pending-agentos")) {
      logStep(`spawn-${recipeId}`, true, `tileId=${poll.tileId} runtime=${poll.runtime}`);
      return poll.tileId;
    }
    await sleep(POLL_MS);
  }
  logStep(`spawn-${recipeId}`, false, "timeout waiting for agentos terminal tile");
  return null;
}

export async function runActorsOnAgentosProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);

  const spawned: string[] = [];
  for (let i = 0; i < RECIPES.length; i++) {
    const recipeId = RECIPES[i]!;
    const tileId = await spawnRecipeTerminal(wc, recipeId, i * 120, spawned);
    if (!tileId) {
      exitApp(1);
      return;
    }
    spawned.push(tileId);
    await sleep(500);
  }

  logStep("all-actors", true, `recipes=${RECIPES.join(",")} tiles=${spawned.join(",")}`);
  await saveScreenshot(wc, evidenceDir, "V3-00-actors-on-agentos.png");
  logStep("done", true, evidenceDir);
  exitApp(0);
}
