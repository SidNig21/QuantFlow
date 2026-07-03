import { ipcMain } from "electron";
import {
  listPendingAgentOsApprovals,
  resolveAgentOsApproval,
} from "./agentos-approval";

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
}
