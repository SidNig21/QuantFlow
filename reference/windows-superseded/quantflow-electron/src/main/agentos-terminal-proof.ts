/**
 * V1 scripted AgentOS terminal proof — terminal tile front, screenshots.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 3000;
const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 45_000;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`TERMINAL-PROOF: step=${name} ok=${ok} detail=${detail}`);
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

export async function runAgentOsTerminalProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);
  logStep("renderer-ready", true, `settle=${SETTLE_MS}ms`);

  const clicked = await execJs<{ ok: boolean; error?: string }>(wc, `(() => {
    const btn = document.querySelector('.lv1-recipe[data-recipe="codex"]');
    if (!btn) return { ok: false, error: 'agentos recipe button not found' };
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
  logStep("spawn-click", true, 'recipe=codex');

  const started = Date.now();
  let tileId: string | null = null;
  while (Date.now() - started < SPAWN_TIMEOUT_MS) {
    const poll = await execJs<{
      tileId: string | null;
      hasWebview: boolean;
      flipped: boolean;
      terminalTarget: string | null;
    }>(wc, `(async () => {
      const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
      const tileId = Array.isArray(workers) && workers.length > 0
        ? workers[workers.length - 1]?.tileId ?? null
        : null;
      if (!tileId) return { tileId: null, hasWebview: false, flipped: false, terminalTarget: null };
      const tileEl = document.querySelector(\`[data-tile-id="\${tileId}"]\`);
      const webview = tileEl?.querySelector('webview');
      const flipped = tileEl?.classList.contains('is-flipped') ?? false;
      const src = webview?.getAttribute('src') ?? '';
      const hasAgentOsTarget = src.includes('target=agentos') || decodeURIComponent(src).includes('agentos%3A');
      return {
        tileId,
        hasWebview: !!webview,
        flipped,
        terminalTarget: hasAgentOsTarget ? 'agentos:ready' : null,
      };
    })()`);
    if (poll.tileId && poll.hasWebview && poll.terminalTarget?.startsWith('agentos:') && !poll.flipped) {
      tileId = poll.tileId;
      break;
    }
    await sleep(POLL_MS);
  }

  if (!tileId) {
    logStep("terminal-tile", false, "timeout waiting for agentos terminal tile");
    exitApp(1);
    return;
  }
  logStep("terminal-tile", true, `tileId=${tileId} front=terminal`);

  await saveScreenshot(wc, evidenceDir, "V1-00-terminal-spawn.png");
  logStep("done", true, evidenceDir);
  exitApp(0);
}
