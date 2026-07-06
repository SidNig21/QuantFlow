/**
 * Stick proof — pi-stick dock actor → AgentOS session → terminal tile → prompt round-trip.
 */
import type { BrowserWindow, WebContents } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentOsTileAttach,
  promptAgentOsTile,
} from "./agentos-terminal-bridge";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";

const SETTLE_MS = 2500;
const RECIPE_ID = "pi-stick";

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`AGENTOS-STICK-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

async function execJs<T>(wc: WebContents, expression: string): Promise<T> {
  return wc.executeJavaScript(expression, true) as Promise<T>;
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

export async function runAgentosStickProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v6", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  const tileId = await spawnDockRecipeTile(wc, RECIPE_ID, 0, []);
  if (!tileId) {
    logStep("spawn-pi-stick", false, "dock spawn failed");
    exitProofApp(1);
    return;
  }
  logStep("spawn-pi-stick", true, `tileId=${tileId}`);

  if (!(await assertAgentOsRailTile(wc, tileId))) {
    exitProofApp(1);
    return;
  }

  await proofSleep(1500);
  const attach = getAgentOsTileAttach(tileId);
  if (!attach?.sessionId || attach.software !== "pi") {
    logStep(
      "session-attach",
      false,
      `software=${attach?.software ?? "null"} session=${attach?.sessionId ?? "null"}`,
    );
    exitProofApp(1);
    return;
  }
  logStep("session-attach", true, `sessionId=${attach.sessionId} software=${attach.software}`);

  try {
    await promptAgentOsTile(tileId, "say hello");
    logStep("prompt-round-trip", true, "prompt accepted");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep("prompt-round-trip", false, detail);
    exitProofApp(1);
    return;
  }

  await saveProofScreenshot(wc, evidenceDir, "V6-00-agentos-stick-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
