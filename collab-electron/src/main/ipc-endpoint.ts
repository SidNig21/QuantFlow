import * as crypto from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";

const NAMESPACE = `quantflow-${crypto
  .createHash("sha1")
  .update(QUANTFLOW_DIR)
  .digest("hex")
  .slice(0, 8)}`;

function pipePath(name: string): string {
  return `\\\\.\\pipe\\${NAMESPACE}-${name}`;
}

export function makeEndpointPath(name: string): string {
  if (process.platform === "win32") {
    return pipePath(name);
  }
  return join(QUANTFLOW_DIR, `${name}.sock`);
}

export function prepareEndpoint(endpoint: string): void {
  if (process.platform === "win32") return;
  mkdirSync(dirname(endpoint), { recursive: true });
  if (existsSync(endpoint)) {
    try {
      unlinkSync(endpoint);
    } catch {
      // Endpoint already gone.
    }
  }
}

export function cleanupEndpoint(endpoint: string): void {
  if (process.platform === "win32") return;
  if (!existsSync(endpoint)) return;
  try {
    unlinkSync(endpoint);
  } catch {
    // Endpoint already gone.
  }
}

export function ensureEndpointDir(): void {
  mkdirSync(QUANTFLOW_DIR, { recursive: true });
}
