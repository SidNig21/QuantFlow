/**
 * PF1 storm check — drives synthetic events through the real routeKernelEvent seam.
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  createDebouncedProjectionRefresh,
  DEFAULT_PROJECTION_DEBOUNCE_MS,
  routeKernelEvent,
} from "../../quantflow-electron/src/windows/shell/src/renderer-event-router.js";
import { PERF_BASELINE_PATH } from "./perf-baseline-schema";

type FakeTimerScheduler = {
  setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;
  advance: (ms: number) => void;
};

function createFakeTimerScheduler(): FakeTimerScheduler {
  let now = 0;
  const timers = new Map<
    number,
    { at: number; fn: () => void; id: ReturnType<typeof setTimeout> }
  >();
  let nextId = 1;

  function runDue() {
    for (const [id, timer] of [...timers.entries()].sort(
      (a, b) => a[1].at - b[1].at,
    )) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
      }
    }
  }

  return {
    setTimeoutFn(fn, ms) {
      const id = nextId++ as ReturnType<typeof setTimeout>;
      timers.set(id, { at: now + ms, fn, id });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      runDue();
    },
  };
}

function readBaselineRefetchCount(): number {
  const raw = JSON.parse(readFileSync(PERF_BASELINE_PATH, "utf-8")) as {
    benchmarks?: { B4?: { refetch_count_per_trial?: number[] } };
  };
  const counts = raw.benchmarks?.B4?.refetch_count_per_trial;
  if (!counts?.length) {
    throw new Error("perf-baseline.json missing B4 refetch_count_per_trial");
  }
  return counts[0]!;
}

export function runStormCheck(): boolean {
  let fullRefreshCount = 0;
  let receiptHandlerCount = 0;

  const debouncedRefresh = createDebouncedProjectionRefresh(
    () => {
      fullRefreshCount += 1;
    },
  );

  const handlers = {
    recordEvent: () => null,
    resolveTile: () => null,
    onReceiptPosted: () => {
      receiptHandlerCount += 1;
    },
    refreshProjection: () => {
      debouncedRefresh.schedule();
    },
    shouldRefreshWatchtower: () => false,
  };

  for (let i = 0; i < 100; i += 1) {
    routeKernelEvent(
      {
        kind: "receipt.posted",
        workflowId: "wf_storm",
        taskId: `task_${i}`,
        data: { id: `rcpt_${i}`, type: "progress", summary: `storm ${i}` },
      },
      handlers,
    );
  }

  debouncedRefresh.flush();

  const baseline = readBaselineRefetchCount();
  const okReceiptStorm =
    fullRefreshCount === 0 && receiptHandlerCount === 100;

  console.log(
    `B4 receipt storm: baseline refetches=${baseline}, PF1 full refetches=${fullRefreshCount}, targeted receipt handlers=${receiptHandlerCount}`,
  );

  if (!okReceiptStorm) {
    console.error(
      `Expected 0 full refetches and 100 onReceiptPosted calls; got full=${fullRefreshCount}, receipt=${receiptHandlerCount}`,
    );
    return false;
  }

  // Debounce proof: 10 tile.moved within 50ms → exactly 1 full refresh.
  fullRefreshCount = 0;
  const fake = createFakeTimerScheduler();
  const debouncedTileRefresh = createDebouncedProjectionRefresh(
    () => {
      fullRefreshCount += 1;
    },
    {
      delayMs: DEFAULT_PROJECTION_DEBOUNCE_MS,
      setTimeoutFn: fake.setTimeoutFn,
      clearTimeoutFn: fake.clearTimeoutFn,
    },
  );

  const tileHandlers = {
    recordEvent: () => null,
    resolveTile: (tileId: string) => ({ id: tileId }),
    onTileMoved: () => {},
    refreshProjection: () => {
      debouncedTileRefresh.schedule();
    },
    shouldRefreshWatchtower: () => false,
  };

  for (let i = 0; i < 10; i += 1) {
    routeKernelEvent(
      {
        kind: "tile.moved",
        tileId: "tile-1",
        data: { x: i, y: i },
      },
      tileHandlers,
    );
  }

  fake.advance(DEFAULT_PROJECTION_DEBOUNCE_MS);

  console.log(
    `Debounce burst: 10 tile.moved within ${DEFAULT_PROJECTION_DEBOUNCE_MS}ms → full refetches=${fullRefreshCount}`,
  );

  if (fullRefreshCount !== 1) {
    console.error(`Expected 1 coalesced full refresh; got ${fullRefreshCount}`);
    return false;
  }

  return true;
}
