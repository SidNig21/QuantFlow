/**
 * P1.B3 — headless perf baseline capture (B1 cold bootstrap, B3 tile drag, B4 receipt storm).
 *
 * Run via: bun qa/run.ts perf-baseline
 */

import { cpus, platform } from "node:os";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dispatchKernelCommand } from "../src/kernel/commands/index";
import { handleTileCommand } from "../src/kernel/commands/tile-commands";
import {
  closeKernelDb,
  setKernelDbForTesting,
} from "../src/kernel/database";
import { onKernelEvent, type KernelEventPayload } from "../src/kernel/events/index";
import { seedHarnessRegistry } from "../src/kernel/worker-instances/index";
import { startStateCardWatcher } from "../src/kernel/watchers/index";

import { createFileKernelDb, createInMemoryKernelDb } from "./lib/kernel-memory-db";
import {
  percentile,
  PERF_BASELINE_PATH,
  type BenchmarkEntry,
  type B4BenchmarkEntry,
  type PerfBaseline,
} from "./lib/perf-baseline-schema";
import {
  REFETCH_TRIGGER_KINDS,
  shouldTriggerSnapshotRefetch,
} from "./lib/refetch-policy";

const TRIALS = 5;
const B1_MARKER = "__QF_B1_RESULT__";
const IS_B1_WORKER = process.env.QF_PERF_B1_WORKER === "1";

function getHostInfo(): PerfBaseline["host"] {
  return {
    platform: platform(),
    cpu_model: cpus()[0]?.model?.trim() ?? "unknown",
    bun_version: Bun.version,
  };
}

function makeBenchmarkEntry(
  description: string,
  method: string,
  trialsMs: number[],
): BenchmarkEntry {
  return {
    description,
    method,
    unit: "ms",
    p50_ms: percentile(trialsMs, 50),
    p95_ms: percentile(trialsMs, 95),
    trials_ms: trialsMs,
  };
}

/** B1 worker: fresh process cold bootstrap of kernel + watcher registry. */
function runB1Worker(): void {
  delete process.env.QUANTFLOW_TRACE;
  delete process.env.QF_PERF_TRACE;
  const dataDir = mkdtempSync(join(tmpdir(), "qf-perf-b1-"));
  const t0 = performance.now();
  let db: ReturnType<typeof createFileKernelDb>["db"] | undefined;
  try {
    const opened = createFileKernelDb(dataDir);
    db = opened.db;
    setKernelDbForTesting(opened.kdb);
    seedHarnessRegistry(opened.kdb);
    startStateCardWatcher(opened.kdb);
  } finally {
    const ms = performance.now() - t0;
    console.log(`${B1_MARKER}${JSON.stringify({ ms })}`);
    setKernelDbForTesting(null);
    closeKernelDb();
    db?.close();
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function runB1Trial(): Promise<number> {
  const proc = Bun.spawn({
    cmd: ["bun", join(import.meta.dir, "perf-baseline-capture.ts")],
    env: { ...process.env, QF_PERF_B1_WORKER: "1", QUANTFLOW_TRACE: "", QF_PERF_TRACE: "" },
    stdout: "pipe",
    stderr: "inherit",
    cwd: join(import.meta.dir, ".."),
  });
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(`B1 worker subprocess exit ${exitCode}`);
  const marker = text.indexOf(B1_MARKER);
  if (marker < 0) throw new Error(`B1 worker missing marker:\n${text}`);
  const payload = JSON.parse(text.slice(marker + B1_MARKER.length).trim()) as { ms: number };
  return payload.ms;
}

async function benchmarkB1(): Promise<BenchmarkEntry> {
  const trialsMs: number[] = [];
  for (let i = 0; i < TRIALS; i += 1) {
    trialsMs.push(await runB1Trial());
  }
  return makeBenchmarkEntry(
    "Cold-start proxy: headless kernel DB init, migrations, harness registry, state-card watcher",
    "headless kernel+watcher bootstrap via bun subprocess; bun:sqlite temp-file kernel.db with all v3 migration SQL, seedHarnessRegistry, startStateCardWatcher; excludes Electron window/renderer paint and better-sqlite3 initKernelDb native path",
    trialsMs,
  );
}

async function benchmarkB3(): Promise<BenchmarkEntry> {
  const trialsMs: number[] = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const { db, kdb } = createInMemoryKernelDb(`wf_b3_${t}`);
    setKernelDbForTesting(kdb);
    try {
      seedHarnessRegistry(kdb);
      const tileIds: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const id = `tile_b3_${t}_${i}`;
        tileIds.push(id);
        handleTileCommand(kdb, "kernel.tile.create", {
          id,
          workflowId: `wf_b3_${t}`,
          displayName: `Tile ${i}`,
          tileKind: "worker",
          x: i * 40,
          y: i * 30,
        });
      }
      const t0 = performance.now();
      for (let i = 0; i < tileIds.length; i += 1) {
        await dispatchKernelCommand(
          "kernel.tile.move",
          { id: tileIds[i], x: (i + 1) * 50, y: (i + 1) * 40 },
          "perf-baseline",
        );
      }
      trialsMs.push(performance.now() - t0);
    } finally {
      setKernelDbForTesting(null);
      db.close();
    }
  }
  return makeBenchmarkEntry(
    "10-tile multi-drag commit: sequential kernel.tile.move via dispatchKernelCommand",
    "in-memory kernel DB; workflow + 10 tiles pre-created; elapsed ms for 10 sequential dispatchKernelCommand('kernel.tile.move') calls (mirrors tile-manager.js commitTileMoves loop); excludes drag UI and IPC",
    trialsMs,
  );
}

async function benchmarkB4(): Promise<B4BenchmarkEntry> {
  const trialsMs: number[] = [];
  const refetchCounts: number[] = [];
  const triggerKinds = [...REFETCH_TRIGGER_KINDS];
  const methodKinds = triggerKinds.join(", ");

  for (let t = 0; t < TRIALS; t += 1) {
    const { db, kdb } = createInMemoryKernelDb(`wf_b4_${t}`);
    setKernelDbForTesting(kdb);
    let refetchCount = 0;
    const listener = (payload: KernelEventPayload) => {
      if (shouldTriggerSnapshotRefetch(String(payload.kind ?? ""))) {
        refetchCount += 1;
      }
    };
    onKernelEvent(listener);
    try {
      seedHarnessRegistry(kdb);
      startStateCardWatcher(kdb);

      const t0 = performance.now();
      for (let i = 0; i < 100; i += 1) {
        await dispatchKernelCommand(
          "kernel.receipt.post",
          {
            type: "progress",
            workflowId: `wf_b4_${t}`,
            summary: `storm receipt ${i}`,
            correlationId: `corr_b4_${t}`,
          },
          "perf-baseline",
        );
      }
      trialsMs.push(performance.now() - t0);
      refetchCounts.push(refetchCount);
    } finally {
      setKernelDbForTesting(null);
      db.close();
    }
  }

  const base = makeBenchmarkEntry(
    "Receipt event storm: 100 kernel.receipt.post commands with renderer refetch counting",
    `in-memory kernel DB; onKernelEvent listener counts snapshot refetch when kind matches renderer policy (prefixes: tile.*, task.*, connection.*, workflow.*; exact: receipt.posted; projection kinds: ${methodKinds}); 100 receipts posted via dispatchKernelCommand within storm window`,
    trialsMs,
  );
  return {
    ...base,
    refetch_count_per_trial: refetchCounts,
    refetch_trigger_kinds: triggerKinds,
  };
}

export async function capturePerfBaseline(): Promise<PerfBaseline> {
  delete process.env.QUANTFLOW_TRACE;
  delete process.env.QF_PERF_TRACE;
  delete process.env.QF_PERF_DIR;

  console.log("Capturing perf baseline (5 trials per benchmark)…\n");
  console.log("B1 — cold kernel bootstrap (subprocess)…");
  const B1 = await benchmarkB1();
  console.log(`  trials_ms: ${B1.trials_ms.map((m) => m.toFixed(1)).join(", ")}`);

  console.log("B3 — 10-tile drag commit…");
  const B3 = await benchmarkB3();
  console.log(`  trials_ms: ${B3.trials_ms.map((m) => m.toFixed(1)).join(", ")}`);

  console.log("B4 — receipt event storm…");
  const B4 = await benchmarkB4();
  console.log(
    `  trials_ms: ${B4.trials_ms.map((m) => m.toFixed(1)).join(", ")}; refetch counts: ${B4.refetch_count_per_trial.join(", ")}`,
  );

  return {
    version: 1,
    captured_at: new Date().toISOString(),
    host: getHostInfo(),
    trials: TRIALS,
    benchmarks: { B1, B3, B4 },
  };
}

export function writePerfBaseline(baseline: PerfBaseline): void {
  writeFileSync(PERF_BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf-8");
  console.log(`\nWrote ${PERF_BASELINE_PATH}`);
}

if (IS_B1_WORKER) {
  runB1Worker();
} else if (import.meta.main) {
  const baseline = await capturePerfBaseline();
  writePerfBaseline(baseline);
}
