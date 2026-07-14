import { ipcMain } from "electron";
import {
  createWorkflowTask,
  injectWorkflowContext,
  type WorkflowInjectInput,
  type WorkflowSubmitInput,
} from "./workflow-service";

export function registerWorkflowHandlers(): void {
  ipcMain.handle("workflow:submit", (_event, params: WorkflowSubmitInput) =>
    createWorkflowTask(params),
  );
  ipcMain.handle("workflow:inject", (_event, params: WorkflowInjectInput) =>
    injectWorkflowContext(params),
  );
}
