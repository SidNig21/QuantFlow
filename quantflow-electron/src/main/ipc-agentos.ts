import { ipcMain } from "electron";
import {
  listPendingAgentOsApprovals,
  resolveAgentOsApproval,
} from "./agentos-approval";
import { startAgentOsTask } from "./agentos-run";
import { prepareAgentOsTerminalAttach } from "./agentos-terminal-bridge";

export function registerAgentOsHandlers(): void {
  ipcMain.handle("agentos:approvals", () => listPendingAgentOsApprovals());

  ipcMain.handle(
    "agentos:approve",
    (_event, payload: { requestId?: string; approved?: boolean } = {}) => {
      const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
      if (!requestId) return { ok: false, error: "requestId required" };
      const approved = payload.approved === true;
      const resolved = resolveAgentOsApproval(requestId, approved);
      if (!resolved) return { ok: false, error: `unknown requestId: ${requestId}` };
      return { ok: true, requestId, approved };
    },
  );

  ipcMain.handle(
    "agentos:terminal:prepare",
    async (_event, payload: {
      tileId?: string;
      cols?: number;
      rows?: number;
      instruction?: string;
      software?: string;
      actorName?: string;
    } = {}) => {
      const tileId = typeof payload.tileId === "string" ? payload.tileId.trim() : "";
      if (!tileId) return { ok: false, error: "tileId required" };
      try {
        const result = await prepareAgentOsTerminalAttach({
          tileId,
          cols: typeof payload.cols === "number" ? payload.cols : undefined,
          rows: typeof payload.rows === "number" ? payload.rows : undefined,
          instruction: typeof payload.instruction === "string" ? payload.instruction : undefined,
          software: typeof payload.software === "string" ? payload.software : undefined,
          actorName: typeof payload.actorName === "string" ? payload.actorName : undefined,
        });
        return { ok: true, ...result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    "agentos:run",
    (_event, payload: { tileId?: string; instruction?: string; workflowId?: string } = {}) => {
      const tileId = typeof payload.tileId === "string" ? payload.tileId.trim() : "";
      const instruction = typeof payload.instruction === "string" ? payload.instruction.trim() : "";
      if (!tileId) return { ok: false, error: "tileId required" };
      if (!instruction) return { ok: false, error: "instruction required" };
      const workflowId = typeof payload.workflowId === "string" ? payload.workflowId : undefined;
      return startAgentOsTask({ tileId, instruction, workflowId });
    },
  );
}
