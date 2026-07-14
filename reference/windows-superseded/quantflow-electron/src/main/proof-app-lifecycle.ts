import { readFileSync } from "node:fs";
import { app } from "electron";
import { SIDECAR_PID_PATH } from "./sidecar/protocol";

export function killProofSidecar(): void {
  try {
    const data = JSON.parse(readFileSync(SIDECAR_PID_PATH, "utf-8")) as { pid?: unknown };
    const pid = typeof data.pid === "number" ? data.pid : NaN;
    if (Number.isInteger(pid) && pid > 0) process.kill(pid);
  } catch {
    // No sidecar.
  }
}

export function exitProofApp(code: number): void {
  killProofSidecar();
  app.exit(code);
  setTimeout(() => process.exit(code), 2000);
}
