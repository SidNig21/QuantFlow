/**
 * V3 scripted proof — codex, hermes, claude spawn as AgentOS terminal actors.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { saveProofScreenshot, spawnDockRecipeTile } from "./proof-tile-spawn";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 2500;
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

async function assertAgentOsRailTile(wc: WebContents, tileId: string): Promise<boolean> {
  const check = await execJs<{
    ok: boolean;
    runtimeTarget: string | null;
    isAgentOs: boolean;
    isHerdr: boolean;
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
    const isHerdr = runtimeTarget === 'herdr-wsl'
      || decoded.includes('herdr-wsl')
      || decoded.includes('herdr%3A');
    return {
      ok: !!webview && isAgentOs && !isHerdr,
      runtimeTarget,
      isAgentOs,
      isHerdr,
    };
  })()`);
  if (!check.ok) {
    logStep(
      `agentos-rail-${tileId}`,
      false,
      `runtime=${check.runtimeTarget ?? "null"} agentos=${check.isAgentOs} herdr=${check.isHerdr}`,
    );
    return false;
  }
  logStep(`agentos-rail-${tileId}`, true, `runtime=${check.runtimeTarget ?? "agentos"}`);
  return true;
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
    const tileId = await spawnDockRecipeTile(wc, recipeId, i * 120, spawned);
    if (!tileId) {
      logStep(`spawn-${recipeId}`, false, "dock spawn failed");
      exitApp(1);
      return;
    }
    if (!(await assertAgentOsRailTile(wc, tileId))) {
      exitApp(1);
      return;
    }
    logStep(`spawn-${recipeId}`, true, `tileId=${tileId}`);
    spawned.push(tileId);
    await sleep(500);
  }

  logStep("all-actors", true, `recipes=${RECIPES.join(",")} tiles=${spawned.join(",")}`);
  await saveProofScreenshot(wc, evidenceDir, "V3-00-actors-on-agentos.png", logStep);
  logStep("done", true, evidenceDir);
  exitApp(0);
}
