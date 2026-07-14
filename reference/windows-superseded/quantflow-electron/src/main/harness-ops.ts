/**
 * Live HarnessRuntimeOps factory — v3 Goal 6 (app boundary).
 *
 * This is the real app-side seam Goal 5D calls: it adapts the shipped runtime
 * (approved shell role-spawn path, PTY/herdr input, Kernel queries/commands)
 * into the Electron-free `HarnessRuntimeOps` contract from src/harness.
 *
 * The factory itself is PURE dependency-injection (type-only imports), so it is
 * unit-testable under bun without pulling in the Kernel SQLite/?raw module. The
 * real bindings are assembled in harness-service.ts.
 */

import type {
  HarnessRuntimeOps,
  PartialStateCard,
  ReceiptDraft,
  WorkerHandle,
} from "@qf-harness/types";

export interface RoleLike {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface LiveHarnessDeps {
  /** Resolve a role object for the approved shell role-spawn path. */
  resolveRole(roleId: string): Promise<RoleLike | null>;
  /** Spawn via the approved shell role-spawn path (gated by kernel.worker.spawn). */
  spawnViaShell(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Write input to a worker's PTY display bridge (the shipped input route). */
  ptyWrite(sessionId: string, text: string): void;
  /** Kill a worker's PTY session. */
  ptyKill(sessionId: string): Promise<void> | void;
  /** Fallback: send to a herdr pane directly when there is no PTY session. */
  herdrSend(paneId: string, text: string): Promise<void>;
  /** Dispatch a Kernel command (kernel.worker.stop). */
  dispatchKernel(type: string, payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string }>;
  /** Read the Kernel-owned State Card for a tile. */
  getStateCard(tileId: string): PartialStateCard | null;
  /** Resolve the Kernel worker id for a tile (after spawn). */
  getWorkerForTile(tileId: string): string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function createLiveHarnessOps(deps: LiveHarnessDeps): HarnessRuntimeOps {
  return {
    async startRuntime(input) {
      // The approved path spawns from a role object, so a roleId is required.
      if (!input.roleId) {
        throw new Error("harness spawn: roleId required for the approved role-spawn path");
      }
      const role = await deps.resolveRole(input.roleId);
      if (!role) throw new Error(`harness spawn: role not found: ${input.roleId}`);

      const summary = await deps.spawnViaShell({
        role,
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.tileId ? { tileId: input.tileId } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.runtimeTarget ? { runtimeTarget: input.runtimeTarget } : {}),
        ...(input.activationPrompt ? { activationPrompt: input.activationPrompt } : {}),
      });

      const tileId = str(summary["tileId"]) ?? str(summary["id"]);
      if (!tileId) throw new Error("harness spawn: shell role-spawn returned no tile id");
      const workerId = deps.getWorkerForTile(tileId) ?? "";

      const handle: WorkerHandle = {
        workerId,
        tileId,
        kind: input.harnessKind ?? "local-shell",
        herdrPaneId: str(summary["herdrPaneId"]),
        envoySpaceId: str(summary["herdrWorkspaceId"]) ?? str(summary["envoySpaceId"]),
        ptySessionId: str(summary["ptySessionId"]),
      };
      return handle;
    },

    async sendInput(handle, text) {
      // The PTY display bridge is the shipped input route (for herdr tiles too,
      // the PTY bridges into the pane). Never terminal paste from the Conductor.
      if (handle.ptySessionId) {
        deps.ptyWrite(handle.ptySessionId, text);
      } else if (handle.herdrPaneId) {
        await deps.herdrSend(handle.herdrPaneId, text);
      }
    },

    async readStateCard(tileId) {
      return deps.getStateCard(tileId);
    },

    // No parallel receipt authority: receipts flow from the Kernel task/worker
    // lifecycle and are posted via kernel.receipt.post. The harness does not
    // scrape terminals for receipts, so there are no drafts to drain here.
    async drainReceipts(_handle): Promise<ReceiptDraft[]> {
      return [];
    },

    async stopRuntime(handle) {
      if (handle.ptySessionId) {
        // herdr panes persist beyond the PTY bridge; interrupt the agent first
        // (mirrors the manual Ctrl+C) so the pane actually stops, then detach.
        if (handle.herdrPaneId) {
          try { deps.ptyWrite(handle.ptySessionId, "\x03"); } catch { /* best effort */ }
        }
        try { await deps.ptyKill(handle.ptySessionId); } catch { /* best effort */ }
      }
      await deps.dispatchKernel("kernel.worker.stop", { tileId: handle.tileId });
    },
  };
}
