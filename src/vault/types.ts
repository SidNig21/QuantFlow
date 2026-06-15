/**
 * Vault export data shapes — v3 Goal 8.
 *
 * These mirror the Kernel query snapshots (imported type-only so the vault layer
 * never pulls Kernel runtime/database code). The collector fills a bundle from
 * Kernel reads; the pure exporters format it. The vault is a mirror — it reads
 * Kernel truth and never writes it.
 */

import type { WorkflowSnapshot } from '../kernel/conductor/index';
import type { TaskSnapshot } from '../kernel/tasks/index';
import type { ReceiptSnapshot, ArtifactSnapshot } from '../kernel/receipts/index';
import type { StateCardSnapshot } from '../kernel/state-cards/index';
import type { WorkflowRegion } from '../kernel/workflows/index';

export type {
  WorkflowSnapshot,
  TaskSnapshot,
  ReceiptSnapshot,
  ArtifactSnapshot,
  StateCardSnapshot,
  WorkflowRegion,
};

export type VaultExportType =
  | 'workflow_summary'
  | 'task_summary'
  | 'artifact_index'
  | 'decision_log'
  | 'receipt_chain'
  | 'state_card_snapshot';

export const VAULT_EXPORT_TYPES: VaultExportType[] = [
  'workflow_summary',
  'task_summary',
  'artifact_index',
  'decision_log',
  'receipt_chain',
  'state_card_snapshot',
];

/**
 * Everything one workflow export needs, read once from the Kernel. All lists are
 * pre-sorted deterministically by the collector (receipts/artifacts oldest-first,
 * tasks by creation). Exporters treat this as immutable input.
 */
export interface VaultExportBundle {
  workflow: WorkflowSnapshot;
  region: WorkflowRegion;
  /** Workflow row timestamps (the snapshot omits them; the collector supplies them). */
  workflowCreatedAt: number;
  workflowUpdatedAt: number;
  tasks: TaskSnapshot[];
  receipts: ReceiptSnapshot[];
  artifacts: ArtifactSnapshot[];
  stateCards: StateCardSnapshot[];
}

/** One rendered file: a vault-relative path and its Markdown content. */
export interface VaultExportFile {
  /** Path relative to the export root, POSIX separators, e.g. "wf1/workflow_summary.md". */
  path: string;
  type: VaultExportType;
  content: string;
}
