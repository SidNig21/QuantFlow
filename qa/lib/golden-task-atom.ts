import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { handleTileCommand } from "../../src/kernel/commands/tile-commands";
import { handleWorkerCommand } from "../../src/kernel/commands/worker-commands";
import { handleTaskCommand, queryTaskGet } from "../../src/kernel/tasks/index";
import {
  handleArtifactCommand,
  handleReceiptCommand,
  queryReceiptList,
  type ReceiptSnapshot,
} from "../../src/kernel/receipts/index";
import {
  queryWorkerForTile,
  queryWorkerGet,
  seedHarnessRegistry,
} from "../../src/kernel/worker-instances/index";
import { setKernelDbForTesting } from "../../src/kernel/database";
import type { KernelDB } from "../../src/kernel/database";
import { startStateCardWatcher } from "../../src/kernel/watchers/index";
import { createConductorActions } from "../../src/main/conductor/conductor-actions";
import { createMockHarness } from "../../src/harness/mock/index";
import { runKernelMigrations } from "./kernel-memory-db";

const REPO_ROOT = join(import.meta.dir, "..", "..");
export const GOLDEN_RECEIPTS_PATH = join(
  REPO_ROOT,
  "qa",
  "golden",
  "task-atom.receipts.golden.jsonl",
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

type IdKind =
  | "receipt"
  | "task"
  | "worker"
  | "tile"
  | "correlation"
  | "artifact"
  | "workflow";

interface NormalizeContext {
  baseTime: number;
  artifactRoot: string;
  repoRoot: string;
  maps: Record<IdKind, Map<string, string>>;
  counters: Record<IdKind, number>;
}

function assignPlaceholder(
  ctx: NormalizeContext,
  kind: IdKind,
  value: string,
): string {
  const map = ctx.maps[kind];
  let placeholder = map.get(value);
  if (!placeholder) {
    ctx.counters[kind] += 1;
    placeholder = `<${kind}-${ctx.counters[kind]}>`;
    map.set(value, placeholder);
  }
  return placeholder;
}

function registerId(
  ctx: NormalizeContext,
  kind: IdKind,
  value: string | null | undefined,
): void {
  if (value == null || value === "") return;
  assignPlaceholder(ctx, kind, value);
}

function registerReceiptIds(
  ctx: NormalizeContext,
  receipts: ReceiptSnapshot[],
): void {
  for (const receipt of receipts) {
    registerId(ctx, "receipt", receipt.id);
    registerId(ctx, "task", receipt.taskId);
    registerId(ctx, "worker", receipt.workerId);
    registerId(ctx, "tile", receipt.tileId);
    registerId(ctx, "correlation", receipt.correlationId);
    registerId(ctx, "workflow", receipt.workflowId);
    registerId(ctx, "receipt", receipt.parentReceiptId);
    for (const ref of receipt.artifactRefs) {
      if (typeof ref === "string") registerId(ctx, "artifact", ref);
    }
    registerMetadataIds(ctx, receipt.metadata);
  }
}

function registerMetadataIds(
  ctx: NormalizeContext,
  value: unknown,
  key: string | null = null,
): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (UUID_RE.test(value)) {
      const kind =
        key === "artifactId" || key === "artifactRefs"
          ? "artifact"
          : key === "workerId"
            ? "worker"
            : key === "taskId"
              ? "task"
              : key === "tileId"
                ? "tile"
                : key === "correlationId"
                  ? "correlation"
                  : key === "id" && key !== null
                    ? "receipt"
                    : null;
      if (kind) {
        registerId(ctx, kind, value);
        return;
      }
      registerId(ctx, "receipt", value);
      registerId(ctx, "artifact", value);
      registerId(ctx, "worker", value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) registerMetadataIds(ctx, item, key);
    return;
  }
  if (typeof value === "object") {
    for (const [childKey, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      registerMetadataIds(ctx, nested, childKey);
    }
  }
}

function normalizePath(ctx: NormalizeContext, value: string): string {
  const normalizedRoot = resolve(ctx.artifactRoot);
  if (value === normalizedRoot || value === ctx.artifactRoot) {
    return "<artifact-root>";
  }
  if (value.startsWith(normalizedRoot)) {
    const suffix = value.slice(normalizedRoot.length).replace(/^[/\\]/, "");
    return suffix ? `<artifact-root>/${suffix.replace(/\\/g, "/")}` : "<artifact-root>";
  }
  if (value.startsWith(ctx.repoRoot)) {
    return relative(ctx.repoRoot, value).replace(/\\/g, "/");
  }
  return value;
}

function lookupId(
  ctx: NormalizeContext,
  value: string,
  key: string | null,
): string | null {
  const preferred: IdKind[] =
    key === "artifactId" || key === "artifactRefs"
      ? ["artifact", "receipt"]
      : key === "workerId"
        ? ["worker"]
        : key === "taskId"
          ? ["task"]
          : key === "tileId"
            ? ["tile"]
            : key === "correlationId"
              ? ["correlation"]
              : key === "id"
                ? ["receipt"]
                : key === "parentReceiptId"
                  ? ["receipt"]
                  : [
                      "receipt",
                      "artifact",
                      "task",
                      "worker",
                      "tile",
                      "correlation",
                      "workflow",
                    ];
  for (const kind of preferred) {
    const mapped = ctx.maps[kind].get(value);
    if (mapped) return mapped;
  }
  return null;
}

function normalizeValue(
  ctx: NormalizeContext,
  key: string | null,
  value: unknown,
): unknown {
  if (value == null) return value;

  if (typeof value === "number") {
    if (key === "createdAt" || (key != null && key.endsWith("At"))) {
      return `<T+${value - ctx.baseTime}>`;
    }
    return value;
  }

  if (typeof value === "string") {
    if (key === "sha256" || key === "contentHash") {
      if (SHA256_RE.test(value)) return "<sha256>";
    }

    if (key === "createdAt" || (key != null && key.endsWith("At"))) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric) && String(numeric) === value.trim()) {
        return `<T+${numeric - ctx.baseTime}>`;
      }
    }

    const mapped = lookupId(ctx, value, key);
    if (mapped) return mapped;

    if (
      value.includes("\\") ||
      value.includes("/") ||
      value.includes(ctx.artifactRoot)
    ) {
      return normalizePath(ctx, value);
    }

    return value;
  }

  if (Array.isArray(value)) {
    const arrayKey = key === "artifactRefs" ? "artifactRefs" : key;
    return value.map((item) => normalizeValue(ctx, arrayKey, item));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const childKey of Object.keys(value as Record<string, unknown>).sort()) {
      out[childKey] = normalizeValue(
        ctx,
        childKey,
        (value as Record<string, unknown>)[childKey],
      );
    }
    return out;
  }

  return value;
}

function normalizeReceipt(
  ctx: NormalizeContext,
  receipt: ReceiptSnapshot,
  receiptIndex: number,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = [
    ["id", receipt.id],
    ["type", receipt.type],
    ["taskId", receipt.taskId],
    ["workflowId", receipt.workflowId],
    ["workerId", receipt.workerId],
    ["tileId", receipt.tileId],
    ["summary", receipt.summary],
    ["artifactRefs", receipt.artifactRefs],
    ["parentReceiptId", receipt.parentReceiptId],
    ["correlationId", receipt.correlationId],
    ["metadata", receipt.metadata],
  ];
  normalized["createdAt"] = `<T+${receiptIndex}>`;
  for (const [key, value] of entries) {
    normalized[key] = normalizeValue(ctx, key, value);
  }
  return normalized;
}

export function normalizeReceiptChain(
  receipts: ReceiptSnapshot[],
  artifactRoot: string,
  repoRoot = REPO_ROOT,
): string[] {
  const baseTime = receipts[0]?.createdAt ?? 0;
  const ctx: NormalizeContext = {
    baseTime,
    artifactRoot,
    repoRoot,
    maps: {
      receipt: new Map(),
      task: new Map(),
      worker: new Map(),
      tile: new Map(),
      correlation: new Map(),
      artifact: new Map(),
      workflow: new Map(),
    },
    counters: {
      receipt: 0,
      task: 0,
      worker: 0,
      tile: 0,
      correlation: 0,
      artifact: 0,
      workflow: 0,
    },
  };

  registerReceiptIds(ctx, receipts);
  return receipts.map((receipt, index) =>
    JSON.stringify(normalizeReceipt(ctx, receipt, index)),
  );
}

export function receiptsToJsonl(
  receipts: ReceiptSnapshot[],
  artifactRoot: string,
): string {
  return `${normalizeReceiptChain(receipts, artifactRoot).join("\n")}\n`;
}

function queryAllReceiptsOrdered(db: KernelDB): ReceiptSnapshot[] {
  return queryReceiptList(db, { workflowId: "wf1", limit: 10_000 }).reverse();
}

function setupGoldenDb(): { db: Database; artifactRoot: string; kdb: KernelDB } {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  runKernelMigrations(db);
  const artifactRoot = mkdtempSync(join(tmpdir(), "qf-golden-task-atom-"));
  const now = Date.now();
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf1', 'Golden Atom', 'QA golden task atom', 'active', ?, ?, ?)`,
  ).run(artifactRoot, now, now);
  return { db, artifactRoot, kdb: db as unknown as KernelDB };
}

/**
 * Drive the happy-path task atom (trace off). Returns all workflow receipts oldest-first.
 */
export async function runGoldenTaskAtom(): Promise<{
  receipts: ReceiptSnapshot[];
  artifactRoot: string;
}> {
  delete process.env.QUANTFLOW_TRACE;
  delete process.env.QF_PERF_TRACE;

  const { db, artifactRoot, kdb } = setupGoldenDb();
  setKernelDbForTesting(kdb);
  try {
    seedHarnessRegistry(kdb);
    startStateCardWatcher(kdb);

    handleTileCommand(kdb, "kernel.tile.create", {
      id: "tile_w",
      workflowId: "wf1",
      displayName: "Worker",
      tileKind: "worker",
    });
    handleTileCommand(kdb, "kernel.tile.create", {
      id: "tile_v",
      workflowId: "wf1",
      displayName: "Verifier",
      tileKind: "worker",
    });
    handleWorkerCommand(kdb, "kernel.worker.spawn", {
      tileId: "tile_w",
      workflowId: "wf1",
      harnessKind: "mock",
      roleName: "Coder",
    });
    handleWorkerCommand(kdb, "kernel.worker.status_update", {
      tileId: "tile_w",
      status: "active",
    });
    handleWorkerCommand(kdb, "kernel.worker.spawn", {
      tileId: "tile_v",
      workflowId: "wf1",
      harnessKind: "mock",
      roleName: "Verifier",
    });
    handleWorkerCommand(kdb, "kernel.worker.status_update", {
      tileId: "tile_v",
      status: "active",
    });
    const verifierWorkerId = queryWorkerForTile(kdb, "tile_v")!;
    const mock = createMockHarness({ artifactRoot });

    const dispatch = async (type: string, payload: Record<string, unknown>) => {
      if (type.startsWith("kernel.task.")) return handleTaskCommand(kdb, type, payload);
      if (type.startsWith("kernel.artifact.")) {
        return handleArtifactCommand(kdb, type, payload);
      }
      if (type.startsWith("kernel.receipt.")) {
        return handleReceiptCommand(kdb, type, payload);
      }
      if (type.startsWith("kernel.worker.")) {
        return handleWorkerCommand(kdb, type, payload);
      }
      return { ok: false, error: `unhandled ${type}` };
    };

    const actions = createConductorActions(dispatch, {
      getTask: (taskId) => queryTaskGet(kdb, taskId),
      getWorker: (workerId) => queryWorkerGet(kdb, workerId),
      getWorkerHarness: (kind) => {
        if (kind !== "mock") throw new Error(`unexpected harness in golden atom: ${kind}`);
        return mock;
      },
    });

    const createResult = handleTaskCommand(kdb, "kernel.task.create", {
      id: "task_atom",
      workflowId: "wf1",
      correlationId: "corr_atom",
      title: "Write proof",
      objective: "Write the R1 proof artifact.",
    });
    if (!createResult.ok) {
      throw new Error(`task create failed: ${createResult.error}`);
    }

    const delivered = await actions.runAction("assign_task", {
      taskId: "task_atom",
      tileId: "tile_w",
      deliver: true,
      harnessKind: "mock",
      artifactRoot,
      attemptId: "attempt-1",
    });
    if (!delivered.ok) {
      throw new Error(`assign_task failed: ${delivered.error}`);
    }

    const verified = await actions.runAction("verify_task", {
      taskId: "task_atom",
      verifierWorkerId,
      verdict: "pass",
      artifactRoot,
      attemptId: "attempt-1",
    });
    if (!verified.ok) {
      throw new Error(`verify_task failed: ${verified.error}`);
    }

    const task = queryTaskGet(kdb, "task_atom");
    if (task?.status !== "complete") {
      throw new Error(`expected task complete, got ${task?.status ?? "missing"}`);
    }

    return { receipts: queryAllReceiptsOrdered(kdb), artifactRoot };
  } finally {
    setKernelDbForTesting(null);
    db.close();
  }
}

/** Subprocess isolation — startStateCardWatcher is process-global and binds the first db. */
async function captureGoldenReceiptsJsonlInSubprocess(): Promise<string> {
  const proc = Bun.spawn({
    cmd: ["bun", import.meta.path],
    env: {
      ...process.env,
      QF_GOLDEN_WORKER: "1",
      QUANTFLOW_TRACE: "",
      QF_PERF_TRACE: "",
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  const text = (await new Response(proc.stdout).text()).trim();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`golden task-atom worker exited ${exitCode}`);
  }
  const marker = "__QF_GOLDEN_JSONL__";
  const idx = text.lastIndexOf(marker);
  if (idx < 0) {
    throw new Error("golden worker missing __QF_GOLDEN_JSONL__ marker");
  }
  return `${text.slice(idx + marker.length).trim()}\n`;
}

export async function captureGoldenReceiptsJsonl(): Promise<string> {
  return captureGoldenReceiptsJsonlInSubprocess();
}

async function goldenWorkerMain(): Promise<void> {
  const { receipts, artifactRoot } = await runGoldenTaskAtom();
  const jsonl = receiptsToJsonl(receipts, artifactRoot);
  console.log(`__QF_GOLDEN_JSONL__${jsonl}`);
}

if (process.env.QF_GOLDEN_WORKER === "1") {
  void goldenWorkerMain();
}

export function writeGoldenReceipts(jsonl: string): void {
  mkdirSync(join(REPO_ROOT, "qa", "golden"), { recursive: true });
  writeFileSync(GOLDEN_RECEIPTS_PATH, jsonl, "utf-8");
}

export function readGoldenReceipts(): string {
  return readFileSync(GOLDEN_RECEIPTS_PATH, "utf-8");
}

function firstDiffLine(a: string, b: string): number {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i += 1) {
    if (aLines[i] !== bLines[i]) return i + 1;
  }
  return -1;
}

export function diffGoldenJsonl(expected: string, actual: string): string {
  const expLines = expected.split("\n");
  const actLines = actual.split("\n");
  const line = firstDiffLine(expected, actual);
  if (line < 0) return "";

  const start = Math.max(0, line - 3);
  const end = line + 2;
  const chunks: string[] = [`First difference at line ${line}:`];
  chunks.push("--- golden");
  for (let i = start; i < end && i < expLines.length; i += 1) {
    const prefix = i + 1 === line ? "-" : " ";
    chunks.push(`${prefix} ${i + 1}: ${expLines[i] ?? ""}`);
  }
  chunks.push("+++ actual");
  for (let i = start; i < end && i < actLines.length; i += 1) {
    const prefix = i + 1 === line ? "+" : " ";
    chunks.push(`${prefix} ${i + 1}: ${actLines[i] ?? ""}`);
  }
  if (expLines.length !== actLines.length) {
    chunks.push(
      `Line counts: golden=${expLines.filter((l) => l.length > 0).length} actual=${actLines.filter((l) => l.length > 0).length}`,
    );
  }
  return chunks.join("\n");
}

export async function compareGoldenReceipts(): Promise<boolean> {
  const expected = readGoldenReceipts();
  const actual = await captureGoldenReceiptsJsonl();
  if (expected === actual) return true;
  console.error(diffGoldenJsonl(expected, actual));
  return false;
}
