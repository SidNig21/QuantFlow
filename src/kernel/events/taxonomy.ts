/**
 * Frozen v4 kernel event kind taxonomy (B4).
 * Every kind passed to emitKernelEvent — renames are contract changes.
 * Keep in sync with docs/v4/EVENT_TAXONOMY.md (qa check: taxonomy-sync).
 */
export const KERNEL_EVENT_KINDS = [
  'artifact.created',
  'checkpoint.awaiting-selection',
  'conductor.focus_requested',
  'conductor.plan_posted',
  'connection.created',
  'connection.deleted',
  'connection.updated',
  'evaluation.created',
  'human_decision',
  'receipt.posted',
  'state_card.updated',
  'task.blocked',
  'task.claimed',
  'task.completed',
  'task.created',
  'task.failed',
  'task.recovered',
  'task.started',
  'task.submitted',
  'task.verification_failed',
  'task.verification_passed',
  'task.verifying',
  'tile.created',
  'tile.moved',
  'tile.removed',
  'tile.renamed',
  'tile.resized',
  'tile.status_updated',
  'worker.spawned',
  'worker.status_updated',
  'worker.stopped',
  'workflow.created',
  'workflow.updated',
] as const;

export type KernelEventKind = (typeof KERNEL_EVENT_KINDS)[number];
