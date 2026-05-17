import { ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import { runHealth, runNamedProbe } from "./diagnostics/health-runner";
import { tailLogs } from "./diagnostics/log-tailer";
import { backupRuntimeDb } from "./diagnostics/db-backup";
import { listCrashReports } from "./diagnostics/crash-reports";
import { listLaunchTraces } from "./diagnostics/launch-traces";
import type { TailLogsRequest } from "./diagnostics/types";

function probeName(params: unknown): string {
  if (typeof params === "string") return params;
  const name = (params as { name?: unknown })?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  throw new Error("Probe name is required");
}

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle("qf:diagnostics:health", () => runHealth());
  ipcMain.handle(
    "qf:diagnostics:run-probe",
    (_event, name: string) => runNamedProbe(name),
  );
  ipcMain.handle(
    "qf:diagnostics:tail-logs",
    (_event, request: TailLogsRequest = {}) => tailLogs(request),
  );
  ipcMain.handle(
    "qf:diagnostics:backup-db",
    () => backupRuntimeDb(),
  );
  ipcMain.handle(
    "qf:diagnostics:list-crashes",
    () => listCrashReports(),
  );
  ipcMain.handle(
    "qf:diagnostics:list-launch-traces",
    () => listLaunchTraces(),
  );

  registerMethod(
    "controller.health",
    () => runHealth(),
    {
      description: "Run QuantFlow health probes and return an aggregated health report",
    },
  );

  registerMethod(
    "controller.health.runProbe",
    (params) => runNamedProbe(probeName(params)),
    {
      description: "Run a single QuantFlow health probe by name",
      params: { name: "Probe name, for example relay.socket" },
    },
  );

  registerMethod(
    "diagnostics.tailLogs",
    (params) => tailLogs((params ?? {}) as TailLogsRequest),
    {
      description: "Tail QuantFlow main or renderer logs",
      params: {
        file: "main or renderer",
        lines: "Number of lines, default 2000, max 20000",
      },
    },
  );

  registerMethod(
    "diagnostics.backupDb",
    () => backupRuntimeDb(),
    {
      description: "Copy runtime.db and WAL sidecars to a timestamped local backup directory",
    },
  );

  registerMethod(
    "diagnostics.listCrashes",
    () => listCrashReports(),
    {
      description: "List local QuantFlow crash report JSON files newest first",
    },
  );

  registerMethod(
    "diagnostics.listLaunchTraces",
    () => listLaunchTraces(),
    {
      description: "List local QuantFlow launch trace JSON files newest first",
    },
  );
}
