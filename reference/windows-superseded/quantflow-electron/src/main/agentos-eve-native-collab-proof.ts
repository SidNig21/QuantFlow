/**
 * T-UX scripted proof - Eve discovers a cabled peer and collaborates through native cable tools.
 */
import type { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promptAgentOsTile } from "./agentos-terminal-bridge";
import { createConnectionViaShell } from "./canvas-rpc";
import {
  assertAgentOsWorkers,
  ensureProofRecipe,
  makeLogStep,
  spawnProofRecipeTile,
  waitForAttach,
} from "./agentos-eve-proof-shared";
import { exitProofApp } from "./proof-app-lifecycle";
import { proofSleep, saveProofScreenshot } from "./proof-tile-spawn";
import { pushConnectionGraphToHost } from "./tile-session-registry";

const SETTLE_MS = 2500;
const COLLAB_EXPECT = "collab-ok";
/** B's peer turn + A's host-owned reply turn, each a real LLM call. */
const FOLLOW_UP_TIMEOUT_MS = 120_000;
const COLLAB_INSTRUCTION = "You are cabled to one peer. Call your cable_list tool to get the connectionId, then call cable_send with that connectionId and the text 'Reply with exactly: collab-ok'. Then tell me your peer's reply.";

const logStep = makeLogStep("AGENTOS-EVE-NATIVE-COLLAB-PROOF");

export async function runAgentosEveNativeCollabProof(mainWindow: BrowserWindow): Promise<void> {
  if (process.env.QF_AGENTOS_SIM === "1") {
    logStep("sim-mode-guard", false, "sim-mode forbidden for native collab live proof");
    exitProofApp(1);
    return;
  }

  const evidenceDir = process.env.QF_TERMINAL_PROOF_EVIDENCE_DIR
    ?? join(process.cwd(), "..", "docs", "v7", "reports", "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const wc = mainWindow.webContents;
  await proofSleep(SETTLE_MS);

  if (!(await ensureProofRecipe(wc, logStep))) {
    exitProofApp(1);
    return;
  }

  const tileA = await spawnProofRecipeTile(wc, -120, [], logStep);
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

  const tileB = await spawnProofRecipeTile(wc, 120, [tileA], logStep);
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
  if (!distinct || !(await assertAgentOsWorkers(wc, [tileA, tileB], logStep))) {
    exitProofApp(1);
    return;
  }

  const createdConnection = await createConnectionViaShell({ tileAId: tileA, tileBId: tileB, label: "eve-native-collab" });
  const connectionId = typeof createdConnection?.id === "string" ? createdConnection.id : "";
  if (!connectionId) {
    logStep("canvas-cable", false, "renderer returned no connection id");
    exitProofApp(1);
    return;
  }
  await pushConnectionGraphToHost([{ id: connectionId, tileAId: tileA, tileBId: tileB, label: "eve-native-collab" }]);

  let agentText = "";
  try {
    const result = await promptAgentOsTile(tileA, COLLAB_INSTRUCTION);
    agentText = result.text.trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logStep("agent-collab", false, detail);
    exitProofApp(1);
    return;
  }

  const { resolveAgentOsHostAddress } = await import("@qf-harness/agentos/host-lifecycle");
  const port = Number.parseInt(process.env.AGENTOS_HOST_PORT ?? process.env.QF_AGENTOS_PORT ?? "7430", 10);
  const hostAddr = await resolveAgentOsHostAddress({ port });
  const base = `http://${hostAddr}:${port}`;

  // The cable relay is asynchronous by design: A's first turn ends with a
  // delivery note and B's reply arrives as a host-owned FOLLOW-UP turn
  // (per-tile rails, 2026-07-13). Assert the reply at its true arrival
  // point — A's persisted session events — not inside the first turn.
  let collabOk = agentText.includes(COLLAB_EXPECT);
  let collabDetail = agentText || "empty reply";
  if (!collabOk) {
    const deadline = Date.now() + FOLLOW_UP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const runtimeA = await fetch(`${base}/session/${encodeURIComponent(attachA.sessionId)}/runtime`);
        if (runtimeA.ok) {
          const bodyA = await runtimeA.json() as { persistedEvents?: unknown[] };
          if (JSON.stringify(bodyA.persistedEvents ?? []).includes(COLLAB_EXPECT)) {
            collabOk = true;
            collabDetail = `first turn: ${agentText.slice(0, 100)} | follow-up turn delivered ${COLLAB_EXPECT}`;
            break;
          }
        }
      } catch {
        // Poll again until the deadline.
      }
      await proofSleep(2000);
    }
    if (!collabOk) collabDetail = `no follow-up ${COLLAB_EXPECT} within ${FOLLOW_UP_TIMEOUT_MS}ms; first turn: ${agentText.slice(0, 200)}`;
  }
  logStep("agent-collab", collabOk, collabDetail);
  if (!collabOk) {
    exitProofApp(1);
    return;
  }

  let persistedEvents: unknown[] = [];
  let framingError: string | null = null;
  try {
    const runtimeResponse = await fetch(`${base}/session/${encodeURIComponent(attachB.sessionId)}/runtime`);
    if (runtimeResponse.ok) {
      const body = await runtimeResponse.json() as { persistedEvents?: unknown[] };
      persistedEvents = Array.isArray(body.persistedEvents) ? body.persistedEvents : [];
    } else {
      framingError = `runtimeStatus=${runtimeResponse.status}`;
    }
  } catch (error) {
    framingError = error instanceof Error ? error.message : String(error);
  }

  const eventsText = JSON.stringify(persistedEvents);
  const cleanFraming = !eventsText.includes("[a2a ");
  const framedPromptVisible = eventsText.includes("Message from cabled agent");
  const framingOk = cleanFraming && !framingError;
  logStep("framing", framingOk, `cleanFraming=${cleanFraming} framedPromptVisible=${framedPromptVisible} eventCount=${persistedEvents.length}${framingError ? ` error=${framingError}` : ""}`);
  if (!framingOk) {
    exitProofApp(1);
    return;
  }

  const noSecondA2aEcho = !agentText.includes("[a2a " );
  logStep("double-prompt-soft", noSecondA2aEcho, noSecondA2aEcho ? "no stray [a2a echo in agent text" : agentText);

  await saveProofScreenshot(wc, evidenceDir, "V7-04-agentos-eve-native-collab-live.png", logStep);
  logStep("done", true, evidenceDir);
  exitProofApp(0);
}
