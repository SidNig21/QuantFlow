/**
 * Bounded PTY/herdr reply capture for cable A2A — mirrors quantflow_pty_expect
 * without routing through MCP/shell RPC.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { readPane } from './herdr-socket-ops';
import { captureSession } from './pty';

export const DEFAULT_RELAY_REPLY_TIMEOUT_MS = 120_000;
export const DEFAULT_RELAY_REPLY_INTERVAL_MS = 400;
export const DEFAULT_RELAY_REPLY_LINES = 80;
const STABLE_POLLS_REQUIRED = 2;

export interface RelayReplyCaptureInput {
  afterMarker: string;
  timeoutMs?: number;
  intervalMs?: number;
  lines?: number;
}

export interface RelayReplyCaptureResult {
  ok: boolean;
  reply?: string;
  message?: string;
  timedOut?: boolean;
}

function stripAnsi(text: string): string {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;]*[a-zA-Z]|\u001b\].*?(?:\u0007|\u001b\\)|\u001b[PX^_][^\u001b]*\u001b\\|\u001b.|\u009b[0-9;]*[a-zA-Z]/g,
    '',
  );
}

function textAfterMarker(text: string, marker: string): string {
  if (!marker) return text;
  const idx = text.indexOf(marker);
  if (idx < 0) return text;
  return text.slice(idx + marker.length);
}

function normalizeReply(raw: string): string {
  return stripAnsi(raw).replace(/\r\n/g, '\n').trim();
}

function extractReply(fullText: string, afterMarker: string): string {
  const searchable = normalizeReply(textAfterMarker(fullText, afterMarker));
  return searchable.trim();
}

export type PtyCaptureFn = (sessionId: string, lines: number) => Promise<string>;
export type HerdrReadFn = (paneId: string, lines: number) => Promise<string>;

async function pollForReply(
  readOutput: () => Promise<string>,
  afterMarker: string,
  options: RelayReplyCaptureInput,
): Promise<RelayReplyCaptureResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RELAY_REPLY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_RELAY_REPLY_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let stablePolls = 0;
  let lastReply = '';

  while (Date.now() < deadline) {
    let output = '';
    try {
      output = await readOutput();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `capture failed: ${message}` };
    }

    const reply = extractReply(output, afterMarker);
    if (reply && reply === lastReply) {
      stablePolls += 1;
      if (stablePolls >= STABLE_POLLS_REQUIRED) {
        return { ok: true, reply: lastReply };
      }
    } else if (reply) {
      lastReply = reply;
      stablePolls = 0;
    } else {
      lastReply = '';
      stablePolls = 0;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(intervalMs, remaining));
  }

  if (lastReply) {
    return { ok: true, reply: lastReply };
  }
  return {
    ok: false,
    timedOut: true,
    message: `relay reply not captured within ${timeoutMs}ms`,
  };
}

export async function waitForPtySessionReply(
  sessionId: string,
  input: RelayReplyCaptureInput,
  capture: PtyCaptureFn = captureSession,
): Promise<RelayReplyCaptureResult> {
  const lines = input.lines ?? DEFAULT_RELAY_REPLY_LINES;
  return pollForReply(
    () => capture(sessionId, lines),
    input.afterMarker,
    input,
  );
}

export async function waitForHerdrPaneReply(
  paneId: string,
  input: RelayReplyCaptureInput,
  read: HerdrReadFn = readPane,
): Promise<RelayReplyCaptureResult> {
  const lines = input.lines ?? DEFAULT_RELAY_REPLY_LINES;
  return pollForReply(
    () => read(paneId, lines),
    input.afterMarker,
    input,
  );
}
