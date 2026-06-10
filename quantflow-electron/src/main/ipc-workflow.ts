import { ipcMain } from "electron";
import {
  createWorkflowTask,
  type WorkflowSubmitInput,
} from "./workflow-service";

export function registerWorkflowHandlers(): void {
  ipcMain.handle("workflow:submit", (_event, params: WorkflowSubmitInput) =>
    createWorkflowTask(params),
  );
}
