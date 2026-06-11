/**
 * Start herdr server alongside QuantFlow when it is not already running.
 * Does not stop herdr on app quit — panes should survive QuantFlow restarts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  HerdrSocketError,
  pingHerdrSocket,
} from "./herdr-socket-bridge";

const execFileAsync = promisify(execFile);

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 10_000;

export type HerdrBootstrapState =
  | "skipped"
  | "already_running"
  | "started"
  | "failed";

export interface HerdrBootstrapResult {
  state: HerdrBootstrapState;
  message: string;
  socketPath?: string;
  durationMs: number;
}

let lastBootstrapResult: HerdrBootstrapResult | null = null;

export function getHerdrBootstrapResult(): HerdrBootstrapResult | null {
  return lastBootstrapResult;
}

export function shouldSkipHerdrBootstrap(): boolean {
  const flag = process.env.QUANTFLOW_SKIP_HERDR_BOOTSTRAP?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

async function runShellScript(
  script: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32") {
    return execFileAsync(
      "wsl.exe",
      ["-e", "bash", "-lc", script],
      { timeout: timeoutMs, windowsHide: true, encoding: "utf8" },
    );
  }
  return execFileAsync(
    "bash",
    ["-lc", script],
    { timeout: timeoutMs, encoding: "utf8" },
  );
}

function parseStatusServer(stdout: string): {
  running: boolean;
  socketPath?: string;
} {
  const running = /^\s*status:\s*running\s*$/im.test(stdout);
  const socketMatch = stdout.match(/^\s*socket:\s*(.+)\s*$/im);
  return {
    running,
    socketPath: socketMatch?.[1]?.trim() || undefined,
  };
}

async function readHerdrStatusServer(): Promise<{
  running: boolean;
  socketPath?: string;
}> {
  try {
    const { stdout } = await runShellScript(
      "command -v herdr >/dev/null 2>&1 && herdr status server 2>/dev/null || true",
      STATUS_TIMEOUT_MS,
    );
    return parseStatusServer(stdout);
  } catch {
    return { running: false };
  }
}

async function startHerdrServerProcess(): Promise<void> {
  const script = [
    "command -v herdr >/dev/null 2>&1 || { echo 'herdr not found on PATH' >&2; exit 127; }",
    "mkdir -p ~/.quantflow",
    "if herdr status server 2>/dev/null | grep -q '^status: running'; then exit 0; fi",
    "nohup herdr server >> ~/.quantflow/herdr-server.log 2>&1 &",
  ].join("\n");
  await runShellScript(script, STATUS_TIMEOUT_MS);
}

async function waitForHerdrPing(
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await pingHerdrSocket({ timeoutMs: 2_000 });
      return true;
    } catch (err) {
      if (
        err instanceof HerdrSocketError
        && err.code !== "server_down"
        && err.code !== "timeout"
      ) {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

function recordResult(result: HerdrBootstrapResult): HerdrBootstrapResult {
  lastBootstrapResult = result;
  return result;
}

/**
 * Ensure herdr server is reachable. Starts `herdr server` in the background when needed.
 */
export async function ensureHerdrServer(options?: {
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<HerdrBootstrapResult> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (shouldSkipHerdrBootstrap()) {
    return recordResult({
      state: "skipped",
      message: "Herdr bootstrap skipped (QUANTFLOW_SKIP_HERDR_BOOTSTRAP).",
      durationMs: Date.now() - startedAt,
    });
  }

  try {
    if (await waitForHerdrPing(2_000, 200)) {
      const status = await readHerdrStatusServer();
      return recordResult({
        state: "already_running",
        message: "Herdr server already running.",
        socketPath: status.socketPath,
        durationMs: Date.now() - startedAt,
      });
    }

    await startHerdrServerProcess();

    const ready = await waitForHerdrPing(timeoutMs, pollIntervalMs);
    if (!ready) {
      return recordResult({
        state: "failed",
        message:
          "Herdr server did not become ready within " +
          `${timeoutMs}ms. Check ~/.quantflow/herdr-server.log in WSL.`,
        durationMs: Date.now() - startedAt,
      });
    }

    const status = await readHerdrStatusServer();
    return recordResult({
      state: "started",
      message: "Herdr server started for QuantFlow.",
      socketPath: status.socketPath,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("herdr not found")) {
      return recordResult({
        state: "failed",
        message:
          "herdr is not installed or not on PATH in WSL. Install herdr before using WSL agent tiles.",
        durationMs: Date.now() - startedAt,
      });
    }
    return recordResult({
      state: "failed",
      message: `Herdr bootstrap failed: ${message}`,
      durationMs: Date.now() - startedAt,
    });
  }
}
