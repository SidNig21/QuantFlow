/**
 * Shared shell harness implementation — v3 Goal 6.
 *
 * Both `local-shell` and `herdr-shell` are shell-style runtimes that differ only
 * in HOW the runtime starts/sends/stops — captured by the injected
 * HarnessRuntimeOps. This factory implements the WorkerHarness contract once,
 * parameterized by kind, so the adapters stay tiny and the differences live in
 * the ops (provided by the Electron layer live, faked in tests).
 *
 * Authority rules honored here:
 *  - role ≠ harness ≠ model: spawn passes them as separate fields.
 *  - Kernel owns truth: readState reads the Kernel State Card (no log scraping);
 *    spawn/stop go through ops that call kernel.worker.* ; receipts are returned
 *    as drafts for the caller to post via kernel.receipt.post.
 */

import type {
  HarnessKind,
  HarnessRuntimeOps,
  PartialStateCard,
  ReceiptDraft,
  SpawnWorkerInput,
  WorkerHandle,
  WorkerHarness,
  WorkerMessage,
} from './types';

export function createShellHarness(kind: HarnessKind, ops: HarnessRuntimeOps): WorkerHarness {
  return {
    kind,

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      // Force the adapter's kind; the approved path establishes Kernel identity
      // (role/harness/model separate) and returns runtime ids.
      const handle = await ops.startRuntime({ ...input, harnessKind: kind });
      return { ...handle, kind };
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      const text = message.appendNewline === false ? message.text : `${message.text}\n`;
      await ops.sendInput(handle, text);
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      // Kernel-owned truth, not terminal-log scraping.
      const card = await ops.readStateCard(handle.tileId);
      return card ?? {};
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      if (!ops.drainReceipts) return [];
      return ops.drainReceipts(handle);
    },

    async stop(handle: WorkerHandle): Promise<void> {
      await ops.stopRuntime(handle);
    },
  };
}
