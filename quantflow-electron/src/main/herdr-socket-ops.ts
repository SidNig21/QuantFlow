/**
 * Socket-backed herdr pane operations for ipc-herdr handlers.
 * DEBUG ONLY for pane reads — never use as tile display (PTY attach owns display).
 */

import {
  callHerdrSocket,
  HerdrSocketError,
  pingHerdrSocket,
} from "./herdr-socket-bridge";

export type HerdrAgentStatus =
  | "idle"
  | "working"
  | "blocked"
  | "done"
  | "unknown";

export interface HerdrPane {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  cwd: string;
  agent_status: HerdrAgentStatus;
  focused: boolean;
  revision: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function coerceAgentStatus(value: unknown): HerdrAgentStatus {
  const statuses: HerdrAgentStatus[] = [
    "idle", "working", "blocked", "done", "unknown",
  ];
  return typeof value === "string" && statuses.includes(value as HerdrAgentStatus)
    ? value as HerdrAgentStatus
    : "unknown";
}

function normalizePane(value: unknown): HerdrPane | null {
  const record = asRecord(value);
  if (!record) return null;
  const paneId =
    (typeof record.pane_id === "string" && record.pane_id)
    || (typeof record.paneId === "string" && record.paneId);
  if (!paneId) return null;
  return {
    pane_id: paneId,
    workspace_id: String(record.workspace_id ?? record.workspaceId ?? ""),
    tab_id: String(record.tab_id ?? record.tabId ?? ""),
    cwd: String(record.cwd ?? ""),
    agent_status: coerceAgentStatus(record.agent_status ?? record.agentStatus),
    focused: Boolean(record.focused),
    revision: typeof record.revision === "number" ? record.revision : 0,
  };
}

export async function isHerdrAvailable(): Promise<boolean> {
  try {
    await pingHerdrSocket({ timeoutMs: 5_000 });
    return true;
  } catch (err) {
    if (err instanceof HerdrSocketError && err.code === "server_down") {
      return false;
    }
    return false;
  }
}

export async function listPanes(): Promise<HerdrPane[]> {
  const result = await callHerdrSocket<Record<string, unknown>>("pane.list", {});
  const panes = Array.isArray(result.panes)
    ? result.panes
    : asRecord(result.pane_list)?.panes;
  const list = Array.isArray(panes) ? panes : [];
  return list
    .map((pane) => normalizePane(pane))
    .filter((pane): pane is HerdrPane => pane !== null);
}

/** DEBUG ONLY — not tile display. */
export async function readPane(paneId: string, lines = 50): Promise<string> {
  const result = await callHerdrSocket<Record<string, unknown>>("pane.read", {
    pane_id: paneId,
    source: "visible",
    lines,
  });
  if (typeof result.text === "string") return result.text;
  if (Array.isArray(result.lines)) {
    return result.lines.map(String).join("\n");
  }
  const nested = asRecord(result.content);
  if (nested && typeof nested.text === "string") return nested.text;
  return "";
}

export async function sendToPane(paneId: string, text: string): Promise<void> {
  await callHerdrSocket("pane.send_text", {
    pane_id: paneId,
    text,
  });
  await callHerdrSocket("pane.send_keys", {
    pane_id: paneId,
    keys: ["Enter"],
  });
}

/** Thin debug/one-shot status read. Gate 3 tile badges use events.subscribe. */
export async function getPaneStatus(paneId: string): Promise<HerdrAgentStatus> {
  try {
    const result = await callHerdrSocket<Record<string, unknown>>("pane.get", {
      pane_id: paneId,
    });
    const pane = asRecord(result.pane) ?? result;
    return coerceAgentStatus(pane.agent_status ?? pane.agentStatus);
  } catch {
    return "unknown";
  }
}
