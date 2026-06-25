/**
 * Kernel Schema v1 — Canonical TypeScript types
 *
 * These interfaces are the authoritative v3 type surface.
 * Every field maps directly to src/kernel/migrations/001-v3-baseline.sql.
 * Kernel owns truth; all other components derive state from these types.
 *
 * See docs/v3/KERNEL_SCHEMA_V1.md for field descriptions.
 * See docs/v3/AUTHORITY_RULES.md for mutation/query rules.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Mission-level status. Use `suspended` (not legacy `paused`). See docs/v4/KERNEL_CONTRACT.md. */
export type WorkflowStatus = 'active' | 'suspended' | 'complete' | 'archived';

export type TileKind = 'worker' | 'conductor' | 'viewer' | 'region';

export type TileStatus = 'idle' | 'active' | 'blocked' | 'complete' | 'error';

export type WorkerInstanceStatus =
  | 'spawning'
  | 'active'
  | 'assigned'
  | 'idle'
  | 'stale'
  | 'stopped'
  | 'error'
  | 'failed';

export type WorkerAuthStatus = 'unknown' | 'ok' | 'missing' | 'expired' | 'error';

/**
 * Canonical v3 task states.
 * Enforced by the Kernel state machine.
 * Workers may not self-advance to 'complete' without the submitted→verifying gate.
 */
export type TaskStatus =
  | 'open'
  | 'claimed'
  | 'working'
  | 'submitted'
  | 'verifying'
  | 'complete'
  | 'blocked'
  | 'failed';

export type ApprovalLevel = 'none' | 'operator' | 'conductor';

export type TaskDependencyKind = 'blocks' | 'context_from';

/**
 * Canonical receipt types.
 * Every meaningful state transition produces a receipt.
 * Receipts are append-only — never deleted or modified.
 */
export type ReceiptType =
  | 'task_created'
  | 'task_claimed'
  | 'task_started'
  | 'progress'
  | 'artifact_created'
  | 'task_blocked'
  | 'task_submitted'
  | 'verification_started'
  | 'verification_passed'
  | 'verification_failed'
  | 'task_completed'
  | 'task_failed'
  | 'human_decision'
  // Conductor planning evidence (Goal 5A). The read-only Conductor records its
  // plan/reads/blockers/next-action as an append-only planning receipt. It is
  // not a task transition — it never advances a task.
  | 'planning';

export type ArtifactKind =
  | 'file'
  | 'code'
  | 'analysis'
  | 'test_output'
  | 'image'
  | 'evidence'
  | 'candidate'
  | 'skeptic_note'
  | 'thesis'
  | 'decision_log'
  | 'outcome'
  | 'lesson'
  | string;

export type StateCardStatus = 'idle' | 'active' | 'blocked' | 'complete' | 'error';

export type ConnectionStatus = 'active' | 'inactive';

export type ConnectionSemanticType =
  | 'delegation'
  | 'context_flow'
  | 'artifact_dependency'
  | 'verification'
  | 'blocker'
  | 'receipt_handoff'
  | 'manual_connection';

export type AccessLevel = 'read' | 'write' | 'execute' | 'deny';

export type CommandStatus = 'pending' | 'accepted' | 'rejected';

// ---------------------------------------------------------------------------
// Primitives — row types (flat, as stored in SQLite)
// ---------------------------------------------------------------------------

export interface WorkflowRow {
  id: string;
  name: string;
  objective: string;
  status: WorkflowStatus;
  active_correlation_id: string | null;
  vault_path: string | null;
  /** R3a run-instance fields (Workflow IS the run). mode/checkpoint_state nullable. */
  mode: string | null;
  budget_json: string;
  checkpoint_state: string | null;
  created_at: number;
  updated_at: number;
  metadata_json: string;
}

export interface TileRow {
  id: string;
  workflow_id: string | null;
  display_name: string;
  tile_kind: TileKind;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  status: TileStatus;
  created_at: number;
  updated_at: number;
  metadata_json: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  metadata_json: string;
}

export interface HarnessRow {
  id: string;
  kind: string; // 'local-shell' | 'herdr-shell' | 'pi' | 'codex' | 'claude-code'
  description: string | null;
  config_schema_json: string;
  created_at: number;
  metadata_json: string;
}

export interface ModelRow {
  id: string;
  provider: string; // 'minimax' | 'claude' | 'gpt' | 'local' | 'openrouter'
  name: string;
  description: string | null;
  created_at: number;
  metadata_json: string;
}

export interface WorkerInstanceRow {
  id: string;
  tile_id: string;
  workflow_id: string | null;
  role_id: string | null;
  harness_id: string | null;
  model_id: string | null;
  status: WorkerInstanceStatus;
  permissions_json: string;
  envoy_space_id: string | null;
  herdr_pane_id: string | null;
  assigned_task_id: string | null;
  auth_status: WorkerAuthStatus;
  last_seen: number | null;
  created_at: number;
  updated_at: number;
  metadata_json: string;
}

export interface TaskRow {
  id: string;
  workflow_id: string | null;
  parent_task_id: string | null;
  correlation_id: string;
  title: string;
  objective: string;
  status: TaskStatus;
  owner_worker_id: string | null;
  source_worker_id: string | null;
  target_worker_id: string | null;
  priority: number;
  approval_level: ApprovalLevel;
  created_at: number;
  updated_at: number;
  claimed_at: number | null;
  submitted_at: number | null;
  verified_at: number | null;
  completed_at: number | null;
  metadata_json: string;
}

export interface TaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  kind: TaskDependencyKind;
  created_at: number;
}

export interface ReceiptRow {
  id: string;
  workflow_id: string | null;
  task_id: string | null;
  worker_id: string | null;
  tile_id: string | null;
  type: ReceiptType;
  summary: string;
  artifact_refs_json: string;
  parent_receipt_id: string | null;
  correlation_id: string | null;
  created_at: number;
  metadata_json: string;
}

export interface StateCardRow {
  id: string;
  tile_id: string;
  worker_id: string | null;
  workflow_id: string | null;
  current_task_id: string | null;
  status: StateCardStatus;
  blocker: string | null;
  last_meaningful_update: string | null;
  next_action: string | null;
  artifacts_json: string;
  last_receipt_id: string | null;
  caveman_summary: string | null;
  updated_at: number;
  metadata_json: string;
}

export interface ArtifactRow {
  id: string;
  workflow_id: string | null;
  task_id: string | null;
  worker_id: string | null;
  tile_id: string | null;
  receipt_id: string | null;
  kind: ArtifactKind;
  uri: string | null;
  summary: string | null;
  content_hash: string | null;
  media_type: string | null;
  size_bytes: number | null;
  /** R2 lineage: JSON array of upstream artifact ids. */
  derived_from: string;
  /** R7 external provenance: JSON array of source ids/URLs/citations. */
  source_refs: string;
  observed_at: number | null;
  source_kind: string | null;
  confidence: number | null;
  quote_or_snapshot_ref: string | null;
  sensitivity: string;
  created_at: number;
  metadata_json: string;
}

export interface EventRow {
  id: string;
  workflow_id: string | null;
  task_id: string | null;
  tile_id: string | null;
  worker_id: string | null;
  kind: string;
  correlation_id: string | null;
  payload_json: string;
  created_at: number;
}

export interface ConnectionRow {
  id: string;
  workflow_id: string | null;
  tile_a_id: string;
  tile_b_id: string;
  from_tile_id: string | null;
  to_tile_id: string | null;
  semantic_type: ConnectionSemanticType;
  label: string | null;
  status: ConnectionStatus;
  created_at: number;
  updated_at: number;
  metadata_json: string;
}

export interface PermissionRow {
  id: string;
  worker_id: string | null;
  workflow_id: string | null;
  resource_kind: string;
  resource_pattern: string;
  access_level: AccessLevel;
  granted_by: string | null;
  created_at: number;
  expires_at: number | null;
  metadata_json: string;
}

export interface CommandRow {
  id: string;
  command_type: string;
  requested_by: string | null;
  workflow_id: string | null;
  payload_json: string;
  result_json: string | null;
  status: CommandStatus;
  rejection_reason: string | null;
  created_at: number;
  completed_at: number | null;
}

// ---------------------------------------------------------------------------
// Canonical command types (Goal 2 will implement handlers for these)
// ---------------------------------------------------------------------------

export type KernelCommandType =
  | 'kernel.workflow.create'
  | 'kernel.workflow.update'
  | 'kernel.tile.create'
  | 'kernel.tile.move'
  | 'kernel.tile.resize'
  | 'kernel.tile.rename'
  | 'kernel.tile.status_update'
  | 'kernel.tile.remove'
  | 'kernel.connection.create'
  | 'kernel.connection.delete'
  | 'kernel.worker.spawn'
  | 'kernel.worker.status_update'
  | 'kernel.worker.stop'
  | 'kernel.task.create'
  | 'kernel.task.depend'
  | 'kernel.task.claim'
  | 'kernel.task.start'
  | 'kernel.task.submit'
  | 'kernel.task.verify'
  | 'kernel.task.complete'
  | 'kernel.task.block'
  | 'kernel.task.fail'
  | 'kernel.task.recover'
  | 'kernel.receipt.post'
  | 'kernel.state_card.update'
  | 'kernel.artifact.create'
  | 'kernel.conductor.plan';

// ---------------------------------------------------------------------------
// Canonical query types (Goal 2 will implement handlers for these)
// ---------------------------------------------------------------------------

export type KernelQueryType =
  | 'kernel.workflow.snapshot'
  | 'kernel.canvas.snapshot'
  | 'kernel.tile.list'
  | 'kernel.tile.get'
  | 'kernel.task.list'
  | 'kernel.task.get'
  | 'kernel.receipt.list'
  | 'kernel.state_card.list'
  | 'kernel.state_card.get'
  | 'kernel.worker.list'
  | 'kernel.worker.get'
  | 'kernel.conductor.context';
