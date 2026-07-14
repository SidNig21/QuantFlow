/**
 * Worker harness service — v3 Goal 6 (live wiring).
 *
 * Assembles the real LiveHarnessDeps from the shipped app + Kernel bindings and
 * exposes `getWorkerHarness(kind)` — the seam Goal 5D will call to spawn/send/
 * read/collect/stop workers without inventing terminal driving or role hacks.
 *
 * This module is intentionally heavy (imports the Electron app + Kernel); the
 * routing logic it depends on lives in the pure, unit-tested harness-ops.ts.
 */

import { getKernelDb } from "@qf-kernel/database";
import { dispatchKernelCommand } from "@qf-kernel/commands/index";
import { queryStateCardGet } from "@qf-kernel/queries/index";
import { queryWorkerForTile } from "@qf-kernel/worker-instances/index";
import { createHarness } from "@qf-harness/registry";
import type { HarnessKind, WorkerHarness } from "@qf-harness/types";
import { spawnRoleViaShell } from "./canvas-rpc";
import { getRole } from "./role-service";
import { writeToSession, killSession } from "./pty";
import { sendToPane } from "./herdr-socket-ops";
import { createLiveHarnessOps, type LiveHarnessDeps } from "./harness-ops";
import { getAgentOsWorkerHarness } from "./agentos-service";

export function defaultLiveHarnessDeps(): LiveHarnessDeps {
  return {
    resolveRole: async (roleId) => {
      const role = await getRole(roleId);
      return role ? (role as unknown as { id: string; name: string }) : null;
    },
    spawnViaShell: async (params) =>
      (await spawnRoleViaShell(params)) as Record<string, unknown>,
    ptyWrite: (sessionId, text) => writeToSession(sessionId, text),
    ptyKill: (sessionId) => killSession(sessionId),
    herdrSend: (paneId, text) => sendToPane(paneId, text),
    dispatchKernel: (type, payload) => dispatchKernelCommand(type, payload, "conductor"),
    getStateCard: (tileId) => {
      const card = queryStateCardGet(tileId);
      return card
        ? {
            status: card.status,
            blocker: card.blocker,
            lastMeaningfulUpdate: card.lastMeaningfulUpdate,
            nextAction: card.nextAction,
          }
        : null;
    },
    getWorkerForTile: (tileId) => queryWorkerForTile(getKernelDb(), tileId),
  };
}

/** Build a live worker harness for a kind, wired to the shipped runtime + Kernel. */
export function getWorkerHarness(kind: HarnessKind): WorkerHarness {
  if (kind === "agentos") return getAgentOsWorkerHarness();
  return createHarness(kind, createLiveHarnessOps(defaultLiveHarnessDeps()));
}
