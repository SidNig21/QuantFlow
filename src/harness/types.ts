/**
 * Harness contract — v3 Goal 6A (minimal).
 *
 * role ≠ harness ≠ model. A Harness is the runtime adapter type that starts and
 * stops a worker's runtime (local PTY shell, herdr/WSL shell, …). Goal 6A ships
 * ONLY the configuration/contract needed to wrap the two shipped runtimes —
 * `local-shell` and `herdr-shell`. Harness *implementations* (the spawn/stop
 * mechanics) live in the Electron main/shell runtime and must not leak into the
 * Kernel; the Kernel only references these descriptors as registry config.
 *
 * Pi/Codex/Claude-code adapters and the full WorkerHarness execution interface
 * are later Goal 6 work.
 */

export type HarnessKind = 'local-shell' | 'herdr-shell';

export interface HarnessDescriptor {
  kind: HarnessKind;
  description: string;
  /** JSON-shaped config schema; empty for the shipped wrappers in 6A. */
  configSchema: Record<string, unknown>;
}

/** Runtime identifiers recorded back onto the worker_instances row. */
export interface WorkerRuntimeIds {
  herdrPaneId?: string | null;
  envoySpaceId?: string | null;
  ptySessionId?: string | null;
}

/** Input to kernel.worker.spawn. role/harness/model are populated when known. */
export interface SpawnWorkerInput {
  tileId: string;
  workflowId?: string | null;
  roleName?: string | null;
  harnessKind?: HarnessKind;
  modelProvider?: string | null;
  modelName?: string | null;
  runtimeTarget?: string | null;
}
