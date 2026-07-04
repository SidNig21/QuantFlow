/**
 * Proof-only AgentOS loop driver (QF_AGENTOS_LOOP_PROOF=1).
 *
 * Runs inside Electron main after the shell window loads: spawns the AgentOS
 * legend recipe, waits for approval UI, approves, captures screenshots.
 */
import { app, type BrowserWindow, type WebContents } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

const SETTLE_MS = 2500;
const POLL_MS = 400;
const SPAWN_TIMEOUT_MS = 30_000;
const APPROVAL_TIMEOUT_MS = 45_000;
const COMPLETE_TIMEOUT_MS = 45_000;

function logStep(name: string, ok: boolean, detail: string): void {
  console.log(`LOOP-PROOF: step=${name} ok=${ok} detail=${detail}`);
}

/**
 * The detached pty-sidecar outlives app.exit and inherits the launcher's
 * console handles, which keeps outer pipelines (qa runner, PowerShell) open
 * forever. Kill it by pid file (scoped to the proof's temp QUANTFLOW_DIR).
 */
function killPtySidecar(): void {
  try {
    const data = JSON.parse(readFileSync(SIDECAR_PID_PATH, "utf-8")) as { pid?: unknown };
    const pid = typeof data.pid === "number" ? data.pid : NaN;
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch {
    // No sidecar spawned or already gone.
  }
}

/**
 * app.exit can be held open by background service restarts (e.g. the image
 * worker watcher respawning during teardown); force the process down if the
 * graceful exit stalls.
 */
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
  required = true,
): Promise<boolean> {
  try {
    const image = await wc.capturePage();
    const png = image.toPNG();
    if (!png.byteLength) {
      logStep(`screenshot-${filename}`, false, "capturePage returned empty PNG");
      return !required;
    }
    writeFileSync(join(evidenceDir, filename), png);
    logStep(`screenshot-${filename}`, true, `${png.byteLength} bytes`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep(`screenshot-${filename}`, false, detail);
    return false;
  }
}

async function clickAgentOsRecipe(wc: WebContents): Promise<boolean> {
  const result = await execJs<{ ok: boolean; error?: string; spawnMode?: string }>(wc, `(() => {
    const btn = document.querySelector('.lv1-recipe[data-recipe="agentos"]');
    if (!btn) return { ok: false, error: 'agentos recipe button not found' };
    const dock = document.querySelector('.lv1-dock');
    const spawnMode = dock?.getAttribute('data-spawn-mode') ?? 'center';
    btn.click();
    if (spawnMode === 'click') {
      const panel = document.getElementById('panel-viewer');
      if (!panel) return { ok: false, error: 'panel-viewer not found for click-to-place' };
      const rect = panel.getBoundingClientRect();
      panel.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
    }
    return { ok: true, spawnMode };
  })()`);
  if (!result.ok) {
    logStep("spawn-click", false, result.error ?? "click failed");
    return false;
  }
  logStep(
    "spawn-click",
    true,
    `selector=.lv1-recipe[data-recipe="agentos"] spawnMode=${result.spawnMode ?? "center"}`,
  );
  return true;
}

async function findAgentOsTileId(wc: WebContents): Promise<string | null> {
  const result = await execJs<{ tileId: string | null }>(wc, `(async () => {
    const backs = document.querySelectorAll('.tile-state-card[data-tile-id]');
    if (backs.length > 0) {
      const last = backs[backs.length - 1];
      return { tileId: last?.dataset?.tileId ?? null };
    }
    const workers = await window.kernelApi?.sendQuery?.('kernel.worker.list', {}) ?? [];
    if (Array.isArray(workers) && workers.length > 0) {
      return { tileId: workers[workers.length - 1]?.tileId ?? null };
    }
    return { tileId: null };
  })()`);
  return result.tileId;
}

interface ApprovalPoll {
  blocked: boolean;
  hasApproveBtn: boolean;
  pendingCount: number;
  tileId: string | null;
  blocker: string | null;
  status: string | null;
}

async function pollApprovalBlocked(
  wc: WebContents,
  tileId: string,
): Promise<ApprovalPoll> {
  return execJs<ApprovalPoll>(wc, `(async () => {
    const tileId = ${JSON.stringify(tileId)};
    const approveBtn = document.querySelector('[data-agentos-approval="approve"]');
    let blocker = null;
    let status = null;
    let blocked = false;
    if (tileId && window.kernelApi?.sendQuery) {
      const card = await window.kernelApi.sendQuery('kernel.state_card.get', { tileId });
      blocker = card?.blocker ?? null;
      status = card?.status ?? null;
      blocked = card?.status === 'blocked'
        && typeof card?.blocker === 'string'
        && card.blocker.startsWith('AgentOS approval:');
    }
    const pending = await window.shellApi?.agentosListApprovals?.() ?? [];
    const pendingCount = Array.isArray(pending) ? pending.length : 0;
    return {
      blocked,
      hasApproveBtn: !!approveBtn,
      pendingCount,
      tileId,
      blocker,
      status,
    };
  })()`);
}

async function clickApprove(wc: WebContents, tileId: string): Promise<boolean> {
  const result = await execJs<{ ok: boolean; via?: string }>(wc, `(async () => {
    const btn = document.querySelector('[data-agentos-approval="approve"]');
    if (btn) {
      btn.click();
      return { ok: true, via: 'dom' };
    }
    const pending = await window.shellApi?.agentosListApprovals?.() ?? [];
    if (!Array.isArray(pending) || pending.length === 0) return { ok: false };
    let match = pending.find((entry) => entry?.tileId === ${JSON.stringify(tileId)}) ?? null;
    if (!match && pending.length === 1) match = pending[0];
    if (!match?.requestId) return { ok: false };
    await window.shellApi.agentosApprove({ requestId: match.requestId, approved: true });
    return { ok: true, via: 'shellApi' };
  })()`);
  if (!result.ok) return false;
  logStep("approval-click", true, result.via === "dom"
    ? 'selector=[data-agentos-approval="approve"]'
    : "shellApi.agentosApprove");
  return true;
}

interface CompletePoll {
  ok: boolean;
  status: string | null;
  receiptCount: number;
  rowCount: number;
  hasHuman: boolean;
}

async function pollRunComplete(wc: WebContents, tileId: string): Promise<CompletePoll> {
  return execJs<CompletePoll>(wc, `(async () => {
    const tileId = ${JSON.stringify(tileId)};
    const card = await window.kernelApi?.sendQuery?.('kernel.state_card.get', { tileId });
    const receipts = await window.kernelApi?.sendQuery?.('kernel.receipt.list', { limit: 200 }) ?? [];
    const forTile = Array.isArray(receipts)
      ? receipts.filter((entry) => entry?.tileId === tileId)
      : [];
    const rows = document.querySelectorAll('.tile-state-card-receipt-row');
    const domTypes = [...rows].map((row) =>
      row.querySelector('.tile-state-card-receipt-type')?.textContent ?? '',
    );
    const hasHuman = forTile.some((entry) => entry?.type === 'human_decision')
      || domTypes.includes('human_decision');
    const notBlocked = card?.status !== 'blocked';
    return {
      ok: notBlocked && forTile.length >= 3 && hasHuman,
      status: card?.status ?? null,
      receiptCount: forTile.length,
      rowCount: rows.length,
      hasHuman,
    };
  })()`);
}

async function waitUntil<T>(
  label: string,
  timeoutMs: number,
  poll: () => Promise<T>,
  ready: (value: T) => boolean,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await poll();
    if (ready(last)) return last;
    await sleep(POLL_MS);
  }
  logStep(label, false, `timeout after ${timeoutMs}ms`);
  return null;
}

export async function runAgentOsLoopProof(mainWindow: BrowserWindow): Promise<void> {
  const evidenceDir = process.env.QF_LOOP_PROOF_EVIDENCE_DIR?.trim();
  if (!evidenceDir) {
    logStep("init", false, "QF_LOOP_PROOF_EVIDENCE_DIR required");
    exitApp(1);
    return;
  }
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await sleep(SETTLE_MS);
  logStep("renderer-ready", true, `settle=${SETTLE_MS}ms`);

  if (!await clickAgentOsRecipe(wc)) {
    exitApp(1);
    return;
  }

  const tileId = await waitUntil(
    "spawn-tile",
    SPAWN_TIMEOUT_MS,
    () => findAgentOsTileId(wc),
    (id) => typeof id === "string" && id.length > 0,
  );
  if (!tileId) {
    exitApp(1);
    return;
  }
  logStep("spawn-tile", true, `tileId=${tileId}`);

  await saveScreenshot(wc, evidenceDir, "00-canvas-spawn.png", false);

  const approval = await waitUntil(
    "approval-blocked",
    APPROVAL_TIMEOUT_MS,
    () => pollApprovalBlocked(wc, tileId),
    (state) =>
      state.blocked && (state.hasApproveBtn || state.pendingCount > 0),
  );
  if (!approval) {
    const last = await pollApprovalBlocked(wc, tileId);
    const debug = await execJs<{ summaries: string[] }>(wc, `(async () => {
      const tileId = ${JSON.stringify(tileId)};
      const receipts = await window.kernelApi?.sendQuery?.('kernel.receipt.list', { limit: 100 }) ?? [];
      const forTile = Array.isArray(receipts)
        ? receipts.filter((entry) => entry?.tileId === tileId)
        : [];
      return { summaries: forTile.map((entry) => String(entry?.summary ?? "")) };
    })()`);
    logStep(
      "approval-blocked",
      false,
      `status=${last.status ?? ""} blocker=${last.blocker ?? ""} pending=${last.pendingCount} receipts=${debug.summaries.join(" | ")}`,
    );
    exitApp(1);
    return;
  }
  logStep(
    "approval-blocked",
    true,
    `blocker=${approval.blocker ?? ""}`,
  );

  if (!await saveScreenshot(wc, evidenceDir, "01-blocked-approval.png")) {
    exitApp(1);
    return;
  }

  if (!await clickApprove(wc, tileId)) {
    logStep("approval-click", false, "approve action failed");
    exitApp(1);
    return;
  }

  const complete = await waitUntil(
    "run-complete",
    COMPLETE_TIMEOUT_MS,
    () => pollRunComplete(wc, tileId),
    (state) => state.ok === true,
  );
  if (!complete) {
    exitApp(1);
    return;
  }
  logStep(
    "run-complete",
    true,
    `status=${complete.status ?? ""} receipts=${complete.receiptCount} rows=${complete.rowCount}`,
  );

  if (!await saveScreenshot(wc, evidenceDir, "02-approved-timeline.png")) {
    exitApp(1);
    return;
  }

  logStep("done", true, evidenceDir);
  exitApp(0);
}
