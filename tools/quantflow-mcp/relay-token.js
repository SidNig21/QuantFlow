import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";

export function resolveQuantflowHome() {
  if (process.env.QUANTFLOW_HOME?.trim()) {
    return process.env.QUANTFLOW_HOME.trim();
  }
  return join(os.homedir(), ".quantflow");
}

export function relayTokenCandidates() {
  const home = resolveQuantflowHome();
  const candidates = [join(home, "relay-token")];
  if (process.platform === "linux") {
    const user = process.env.USER || process.env.LOGNAME;
    if (user) {
      candidates.push(`/mnt/c/Users/${user}/.quantflow/relay-token`);
    }
  }
  return candidates;
}

export function readRelayToken() {
  const envToken = process.env.QUANTFLOW_RELAY_TOKEN?.trim();
  if (envToken) return envToken;

  const tokenFile = process.env.QUANTFLOW_RELAY_TOKEN_FILE?.trim();
  if (tokenFile) {
    try {
      return fs.readFileSync(tokenFile, "utf8").trim() || null;
    } catch {
      return null;
    }
  }

  for (const path of relayTokenCandidates()) {
    try {
      const token = fs.readFileSync(path, "utf8").trim();
      if (token) return token;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function withRelayToken(params = {}) {
  const token = readRelayToken();
  if (!token) return params;
  return { ...params, token };
}
