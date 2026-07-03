/**
 * Renderer snapshot-refetch trigger policy (shell renderer.js ~3681–3699).
 * Shared by perf-baseline B4 capture and future P2 storm checks.
 */

/** Explicit kinds that trigger refreshWorkflowProjection (not prefix-matched). */
export const REFETCH_PROJECTION_KINDS = [
  "artifact.created",
  "checkpoint.awaiting-selection",
  "human_decision",
  "evaluation.created",
  "conductor.plan_posted",
  "worker.spawned",
  "worker.status_updated",
  "worker.stopped",
] as const;

/** Prefixes where any matching kind triggers refreshWorkflowProjection. */
export const REFETCH_KIND_PREFIXES = [
  "tile.",
  "task.",
  "connection.",
  "workflow.",
] as const;

/** Exact kind match (in addition to prefixes and projection kinds). */
export const REFETCH_EXACT_KINDS = ["receipt.posted"] as const;

export type RefetchProjectionKind = (typeof REFETCH_PROJECTION_KINDS)[number];

/** Flat list of all explicit trigger kinds (prefix rules documented separately). */
export const REFETCH_TRIGGER_KINDS: readonly string[] = [
  ...REFETCH_KIND_PREFIXES.map((p) => `${p}*`),
  ...REFETCH_EXACT_KINDS,
  ...REFETCH_PROJECTION_KINDS,
];

/**
 * Returns true when the renderer would call refreshWorkflowProjection for this event kind.
 */
export function shouldTriggerSnapshotRefetch(kind: string): boolean {
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
