import { describe, expect, test } from "bun:test";
import {
  appendReadinessTail,
  READINESS_TAIL_BYTES,
  waitForPtyReadiness,
} from "./pty-readiness";

function fakeSubscribe(chunks: string[], intervalMs = 10) {
  return (listener: (chunk: string) => void) => {
    let index = 0;
    const timer = setInterval(() => {
      if (index >= chunks.length) return;
      listener(chunks[index]!);
      index += 1;
    }, intervalMs);
    return () => clearInterval(timer);
  };
}

describe("waitForPtyReadiness", () => {
  test("resolves on output quiescence after first chunk", async () => {
    await waitForPtyReadiness(
      fakeSubscribe(["booting agent...\n", "ready prompt> "]),
      { settleMs: 30, maxWaitMs: 2000 },
    );
  });

  test("resolves when readySignal matches stripped output", async () => {
    await waitForPtyReadiness(
      fakeSubscribe(["\u001b[32mClaude Code\u001b[0m\nType a message"]),
      {
        readySignal: /Type a message/,
        settleMs: 500,
        maxWaitMs: 2000,
      },
    );
  });

  test("keeps only a bounded output tail for readiness scans", () => {
    const oversized = "x".repeat(READINESS_TAIL_BYTES * 2);
    const tail = appendReadinessTail("", oversized + "ready>");
    expect(tail.length).toBe(READINESS_TAIL_BYTES);
    expect(tail.endsWith("ready>")).toBe(true);
  });

  test("rejects on timeout when no output arrives", async () => {
    await expect(
      waitForPtyReadiness(
        (listener) => {
          void listener;
          return () => {};
        },
        { settleMs: 50, maxWaitMs: 80 },
      ),
    ).rejects.toThrow(/timed out/i);
  });
});
