import { setTimeout as delay } from "node:timers/promises";
import type { AgentAdapter } from "./agent-adapter";
import {
  DEFAULT_AGENT_MAX_WAIT_MS,
  DEFAULT_AGENT_SETTLE_MS,
} from "./agent-adapter";

export function stripAnsi(text: string): string {
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;]*[a-zA-Z]|\u001b\].*?(?:\u0007|\u001b\\)|\u001b[PX^_][^\u001b]*\u001b\\|\u001b.|\u009b[0-9;]*[a-zA-Z]/g,
    "",
  );
}

export const READINESS_TAIL_BYTES = 8 * 1024;

export function appendReadinessTail(
  current: string,
  chunk: string,
  maxBytes = READINESS_TAIL_BYTES,
): string {
  const next = current + chunk;
  if (next.length <= maxBytes) return next;
  return next.slice(-maxBytes);
}

export interface PtyReadinessOptions {
  readySignal?: RegExp;
  settleMs?: number;
  maxWaitMs?: number;
}

export type PtyOutputListener = (chunk: string) => void;

export type PtyOutputUnsubscribe = () => void;

/**
 * Wait for PTY output quiescence, optional readySignal, or timeout.
 * `subscribe` receives output chunks until unsubscribed.
 */
export async function waitForPtyReadiness(
  subscribe: (listener: PtyOutputListener) => PtyOutputUnsubscribe,
  options: PtyReadinessOptions = {},
): Promise<void> {
  const settleMs = options.settleMs ?? DEFAULT_AGENT_SETTLE_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_AGENT_MAX_WAIT_MS;
  const readySignal = options.readySignal;
  const deadline = Date.now() + maxWaitMs;

  let readinessTail = "";
  let sawOutput = false;
  let quiescenceTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  return new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      if (quiescenceTimer) {
        clearTimeout(quiescenceTimer);
        quiescenceTimer = null;
      }
      unsubscribe();
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };

    const scheduleQuiescence = () => {
      if (quiescenceTimer) clearTimeout(quiescenceTimer);
      quiescenceTimer = setTimeout(() => {
        if (sawOutput) succeed();
      }, settleMs);
    };

    const onChunk = (chunk: string) => {
      if (settled) return;
      sawOutput = true;
      readinessTail = appendReadinessTail(readinessTail, chunk);
      const plain = stripAnsi(readinessTail);
      if (readySignal?.test(plain)) {
        succeed();
        return;
      }
      scheduleQuiescence();
    };

    const unsubscribe = subscribe(onChunk);

    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      if (sawOutput && !readySignal) {
        succeed();
        return;
      }
      fail(`PTY readiness timed out after ${maxWaitMs}ms`);
    }, Math.max(0, deadline - Date.now()));
  });
}

export function adapterToReadinessOptions(
  adapter: AgentAdapter,
): PtyReadinessOptions {
  return {
    readySignal: adapter.readySignal,
    settleMs: adapter.settleMs ?? DEFAULT_AGENT_SETTLE_MS,
    maxWaitMs: adapter.maxWaitMs ?? DEFAULT_AGENT_MAX_WAIT_MS,
  };
}
