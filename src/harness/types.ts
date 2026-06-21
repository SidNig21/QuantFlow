/**
 * Harness contract — v3 Goal 6.
 *
 * role ≠ harness ≠ model. A Harness is the runtime adapter that spawns, drives,
 * reads, and stops a worker's runtime (local PTY shell, herdr/WSL shell, …).
 *
 * Goal 6A shipped the minimal registry/config. Goal 6 adds the full
 * `WorkerHarness` execution interface. Adapters are implemented over INJECTED
 * runtime ops (HarnessRuntimeOps) so this layer never imports Electron/renderer
 * code: the live ops wrap the approved shell role-spawn path (gated by
 * kernel.worker.spawn), PTY/herdr send, and Kernel queries/commands; tests
 * inject fakes. Harness-specific assumptions must not leak into the Kernel.
 */

export type HarnessKind = 'local-shell' | 'herdr-shell' | 'mock' | 'eve-harness';

export interface HarnessDescriptor {
  kind: HarnessKind;
  description: string;
  /** JSON-shaped config schema; empty for the shipped shell wrappers. */
  configSchema: Record<string, unknown>;
}

/** Runtime identifiers recorded on the worker_instances row. */
export interface WorkerRuntimeIds {
  herdrPaneId?: string | null;
  envoySpaceId?: string | null;
  ptySessionId?: string | null;
  eveSessionId?: string | null;
  workspacePath?: string | null;
}

/**
 * Worker config — the full spawn input. role/harness/model stay SEPARATE fields
 * (never fused). Mirrors the worker config shape in BUILD_PLAN_V3.
 */
export interface SpawnWorkerInput {
  roleId?: string | null;
  roleName?: string | null;
  harnessKind?: HarnessKind;
  modelProvider?: string | null;
  modelName?: string | null;
  workflowId?: string | null;
  tileId?: string | null;
  permissions?: Record<string, unknown>;
  skills?: string[];
  env?: Record<string, string>;
  cwd?: string | null;
  activationPrompt?: string | null;
  runtimeTarget?: string | null;
}

/** Opaque handle returned by spawn; identifies the running worker. */
export interface WorkerHandle {
  workerId: string; // kernel worker_instances id
  tileId: string;
  kind: HarnessKind;
  herdrPaneId?: string | null;
  envoySpaceId?: string | null;
  ptySessionId?: string | null;
  eveSessionId?: string | null;
  workspacePath?: string | null;
}

export interface WorkerMessage {
  text: string;
  /** Append a newline (submit the line). Defaults true. */
  appendNewline?: boolean;
  taskId?: string | null;
  workflowId?: string | null;
  artifactRoot?: string | null;
  artifactFileName?: string | null;
  contextEnvelope?: unknown;
}

/** A partial State Card projection read from Kernel truth (never log scraping). */
export interface PartialStateCard {
  status?: string;
  blocker?: string | null;
  lastMeaningfulUpdate?: string | null;
  nextAction?: string | null;
}

/** A receipt the harness surfaces; the caller posts it via kernel.receipt.post. */
export interface ReceiptDraft {
  type: string;
  summary: string;
  taskId?: string | null;
  artifactRefs?: unknown[];
  artifactFilePath?: string | null;
  artifactKind?: string | null;
  contentHash?: string | null;
  mediaType?: string | null;
  sizeBytes?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * The full worker harness contract. All adapters implement this; the Kernel does
 * not know which adapter is in use.
 */
export interface WorkerHarness {
  readonly kind: HarnessKind;
  spawn(input: SpawnWorkerInput): Promise<WorkerHandle>;
  send(handle: WorkerHandle, message: WorkerMessage): Promise<void>;
  readState(handle: WorkerHandle): Promise<PartialStateCard>;
  collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]>;
  stop(handle: WorkerHandle): Promise<void>;
}

/**
 * Runtime ops injected into a shell harness. The live implementation wraps the
 * approved Electron paths; tests inject fakes. This is the ONLY seam to the
 * runtime — adapters contain no Electron/renderer imports.
 */
export interface HarnessRuntimeOps {
  /**
   * Start the runtime through the approved shell role-spawn path (gated by
   * kernel.worker.spawn). Returns the Kernel worker id + runtime ids.
   */
  startRuntime(input: SpawnWorkerInput): Promise<WorkerHandle>;
  /** Send input to the running worker (PTY write / herdr send). */
  sendInput(handle: WorkerHandle, text: string): Promise<void>;
  /** Stop the runtime and mark the Kernel worker stopped. */
  stopRuntime(handle: WorkerHandle): Promise<void>;
  /** Read the Kernel-owned State Card for the worker's tile. */
  readStateCard(tileId: string): Promise<PartialStateCard | null>;
  /** Drain any receipt drafts the runtime has surfaced (default: none). */
  drainReceipts?(handle: WorkerHandle): Promise<ReceiptDraft[]>;
}
