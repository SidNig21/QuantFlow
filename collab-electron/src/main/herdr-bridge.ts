/**
 * herdr-bridge.ts
 *
 * Async wrapper around the herdr CLI.  All calls are non-blocking (execFile,
 * not execFileSync) so the Electron event loop is never stalled.
 *
 * Platform:
 *   - Windows (packaged or dev via WSL GUI): invokes `wsl.exe -e herdr …`
 *   - Linux / WSL (bun run dev from inside WSL): invokes `herdr …` directly
 *
 * Every successful herdr command returns a JSON envelope:
 *   { "id": "cli:…", "result": { … } }
 * Errors come back on stderr or as a non-zero exit code.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HERDR_TIMEOUT_MS = 15_000;

// ── platform dispatch ─────────────────────────────────────────────────────────

function buildArgs(userArgs: string[]): { cmd: string; argv: string[] } {
  if (process.platform === "win32") {
    // Electron main process running as a Windows process — reach into WSL
    return { cmd: "wsl.exe", argv: ["-e", "herdr", ...userArgs] };
  }
  return { cmd: "herdr", argv: userArgs };
}

async function run<T = unknown>(args: string[]): Promise<T> {
  const { cmd, argv } = buildArgs(args);
  const { stdout } = await execFileAsync(cmd, argv, {
    timeout: HERDR_TIMEOUT_MS,
    windowsHide: true,
    encoding: "utf8",
  });
  return JSON.parse(stdout.trim()) as T;
}

// ── availability check ────────────────────────────────────────────────────────

export async function isHerdrAvailable(): Promise<boolean> {
  try {
    await run(["status", "server"]);
    return true;
  } catch {
    return false;
  }
}

// ── public types ──────────────────────────────────────────────────────────────

export interface HerdrPane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  cwd: string;
  agent_status: "idle" | "working" | "blocked" | "done" | "unknown";
  focused: boolean;
  revision: number;
}

interface PaneListResult {
  id: string;
  result: { panes: HerdrPane[]; type: string };
}

interface PaneReadResult {
  id: string;
  result: {
    /** herdr 0.5.x returns the visible text here */
    text?: string;
    /** older builds return lines array */
    lines?: string[];
  };
}

interface PaneStatusResult {
  id: string;
  result: {
    agent_status: HerdrPane["agent_status"];
    pane_id: string;
    revision: number;
  };
}

// ── pane operations ───────────────────────────────────────────────────────────

/**
 * Returns all panes currently known to the herdr server.
 */
export async function listPanes(): Promise<HerdrPane[]> {
  const envelope = await run<PaneListResult>(["pane", "list"]);
  return envelope.result.panes ?? [];
}

/**
 * Reads visible text from a pane.  Always uses --source visible (the only
 * reliable source — recent/recent-unwrapped are broken in herdr 0.5.5).
 */
export async function readPane(
  paneId: string,
  lines = 50,
): Promise<string> {
  const envelope = await run<PaneReadResult>([
    "pane", "read", paneId,
    "--source", "visible",
    "--lines", String(lines),
  ]);
  if (typeof envelope.result.text === "string") return envelope.result.text;
  if (Array.isArray(envelope.result.lines)) {
    return envelope.result.lines.join("\n");
  }
  return "";
}

/**
 * Sends a command to a pane using the verified two-step pattern:
 *   1. send-text  (types the characters without submitting)
 *   2. send-keys Enter  (submits the command)
 *
 * Do NOT embed \n in the text argument — herdr passes it as a literal
 * backslash-n to the PTY.
 */
export async function sendToPane(paneId: string, text: string): Promise<void> {
  await run(["pane", "send-text", paneId, text]);
  await run(["pane", "send-keys", paneId, "Enter"]);
}

/**
 * Returns the agent_status for a single pane.
 * Useful for polling tile header badges.
 */
export async function getPaneStatus(
  paneId: string,
): Promise<HerdrPane["agent_status"]> {
  try {
    const envelope = await run<PaneStatusResult>([
      "pane", "get", paneId,
    ]);
    return envelope.result.agent_status ?? "unknown";
  } catch {
    return "unknown";
  }
}
