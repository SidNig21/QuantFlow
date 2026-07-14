import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { QUANTFLOW_HOME } from "./paths";

export const RELAY_TOKEN_FILE = join(QUANTFLOW_HOME, "relay-token");
export const RELAY_UNAUTHORIZED_CODE = -32001;

export function generateRelayToken(): string {
  return randomBytes(32).toString("base64url");
}

export function extractRelayToken(params: unknown): string | null {
  if (typeof params !== "object" || params === null) return null;
  const token = (params as Record<string, unknown>).token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function stripRelayToken(params: unknown): unknown {
  if (typeof params !== "object" || params === null) return params;
  const rec = { ...(params as Record<string, unknown>) };
  delete rec.token;
  return rec;
}

export function readRelayTokenFromFile(path = RELAY_TOKEN_FILE): string | null {
  try {
    const token = readFileSync(path, "utf-8").trim();
    return token || null;
  } catch {
    return null;
  }
}

export function ensureRelayToken(options: {
  relayToken?: string;
  tokenFile?: string;
} = {}): string {
  const tokenFile = options.tokenFile ?? RELAY_TOKEN_FILE;
  const provided = options.relayToken?.trim();
  if (provided) {
    mkdirSync(QUANTFLOW_HOME, { recursive: true });
    writeFileSync(tokenFile, provided, { mode: 0o600, encoding: "utf-8" });
    return provided;
  }

  const existing = readRelayTokenFromFile(tokenFile);
  if (existing) return existing;

  const token = generateRelayToken();
  mkdirSync(QUANTFLOW_HOME, { recursive: true });
  writeFileSync(tokenFile, token, { mode: 0o600, encoding: "utf-8" });
  return token;
}
