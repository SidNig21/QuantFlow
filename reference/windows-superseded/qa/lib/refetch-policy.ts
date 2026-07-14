/**
 * Renderer snapshot-refetch trigger policy (shell renderer.js / renderer-event-router.js).
 * Shared by perf-baseline B4 capture (baseline policy) and PF1 storm checks.
 */

/** PF0 baseline — frozen for perf-baseline B4 capture (do not change). */
export const REFETCH_PROJECTION_KINDS_BASELINE = [
  "artifact.created",
  "checkpoint.awaiting-selection",
  "human_decision",
  "evaluation.created",
  "conductor.plan_posted",
  "worker.spawned",
  "worker.status_updated",
  "worker.stopped",
] as const;

export const REFETCH_KIND_PREFIXES_BASELINE = [
  "tile.",
  "task.",
  "connection.",
  "workflow.",
] as const;

export const REFETCH_EXACT_KINDS_BASELINE = ["receipt.posted"] as const;

/** PF1 — debounced full refresh kinds (targeted kinds excluded). */
export const REFETCH_PROJECTION_KINDS = [
  "artifact.created",
  "checkpoint.awaiting-selection",
  "human_decision",
  "evaluation.created",
  "conductor.plan_posted",
] as const;

export const REFETCH_KIND_PREFIXES = [
  "tile.",
  "connection.",
  "workflow.",
] as const;

export const REFETCH_EXACT_KINDS = [] as const;

export const TARGETED_RECEIPT_KIND = "receipt.posted";
export const TARGETED_KIND_PREFIXES = ["task.", "worker."] as const;

export type RefetchProjectionKind = (typeof REFETCH_PROJECTION_KINDS)[number];
export type RefetchProjectionKindBaseline =
  (typeof REFETCH_PROJECTION_KINDS_BASELINE)[number];

/** Flat list of all explicit baseline trigger kinds (prefix rules documented separately). */
export const REFETCH_TRIGGER_KINDS_BASELINE: readonly string[] = [
  ...REFETCH_KIND_PREFIXES_BASELINE.map((p) => `${p}*`),
  ...REFETCH_EXACT_KINDS_BASELINE,
  ...REFETCH_PROJECTION_KINDS_BASELINE,
];

/** Flat list of PF1 debounced full-refresh trigger kinds. */
export const REFETCH_TRIGGER_KINDS: readonly string[] = [
  ...REFETCH_KIND_PREFIXES.map((p) => `${p}*`),
  ...REFETCH_EXACT_KINDS,
  ...REFETCH_PROJECTION_KINDS,
];

/**
 * Pre-PF1 policy — used only by perf-baseline B4 capture for the frozen comparison number.
 */
export function shouldTriggerSnapshotRefetchBaseline(kind: string): boolean {
  if (REFETCH_EXACT_KINDS_BASELINE.includes(kind as (typeof REFETCH_EXACT_KINDS_BASELINE)[number])) {
    return true;
  }
  if (
    REFETCH_PROJECTION_KINDS_BASELINE.includes(
      kind as RefetchProjectionKindBaseline,
    )
  ) {
    return true;
  }
  for (const prefix of REFETCH_KIND_PREFIXES_BASELINE) {
    if (kind.startsWith(prefix)) return true;
  }
  return false;
}

export function isTargetedProjectionKind(kind: string): boolean {
  if (kind === TARGETED_RECEIPT_KIND) return true;
  for (const prefix of TARGETED_KIND_PREFIXES) {
    if (kind.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * PF1 policy — debounced full refresh; receipt/task/worker kinds are targeted instead.
 */
export function shouldTriggerSnapshotRefetch(kind: string): boolean {
  if (isTargetedProjectionKind(kind)) return false;
  if (REFETCH_EXACT_KINDS.includes(kind as (typeof REFETCH_EXACT_KINDS)[number])) {
    return true;
  }
  if (REFETCH_PROJECTION_KINDS.includes(kind as RefetchProjectionKind)) {
    return true;
  }
  for (const prefix of REFETCH_KIND_PREFIXES) {
    if (kind.startsWith(prefix)) return true;
  }
  return false;
}
