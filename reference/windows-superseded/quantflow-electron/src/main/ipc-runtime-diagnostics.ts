import { ipcMain } from "electron";
import { getRuntimeDiagnostics } from "./runtime-diagnostics";

export function registerRuntimeDiagnosticsHandlers(): void {
  ipcMain.handle("runtime:diagnostics", () => getRuntimeDiagnostics());
}
