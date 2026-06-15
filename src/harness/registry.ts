/**
 * Harness registry — v3 Goal 6.
 *
 * The shipped harness descriptors, the runtime-target → kind rule, and the
 * factory that builds a live WorkerHarness for a kind given injected runtime ops.
 * The Kernel seeds the `harnesses` table from HARNESS_DESCRIPTORS and resolves a
 * worker's harness_id; it never imports harness execution code.
 *
 * Pi is intentionally NOT registered: a stable, approved Pi programmatic
 * spawn/send/read contract is not available in this goal, so it is deferred to a
 * later Goal 6 increment (see src/harness/AGENTS.md). role ≠ harness ≠ model and
 * no single harness is mandatory for the core app.
 */

import type { HarnessDescriptor, HarnessKind, HarnessRuntimeOps, WorkerHarness } from './types';
import { localShellHarness, createLocalShellHarness } from './local-shell/index';
import { herdrShellHarness, createHerdrShellHarness } from './herdr-shell/index';

export const HARNESS_DESCRIPTORS: readonly HarnessDescriptor[] = [
  localShellHarness,
  herdrShellHarness,
];

/** Map a tile/role runtime target to a harness kind. herdr-wsl → herdr-shell. */
export function resolveHarnessKind(runtimeTarget?: string | null): HarnessKind {
  return runtimeTarget === 'herdr-wsl' || runtimeTarget === 'herdr-shell'
    ? 'herdr-shell'
    : 'local-shell';
}

export function getHarnessDescriptor(kind: HarnessKind): HarnessDescriptor | undefined {
  return HARNESS_DESCRIPTORS.find((d) => d.kind === kind);
}

/**
 * Build a live WorkerHarness for a kind, given the runtime ops that wrap the
 * shipped runtime + Kernel boundary. Throws for an unknown kind so a missing
 * adapter fails loudly rather than silently.
 */
export function createHarness(kind: HarnessKind, ops: HarnessRuntimeOps): WorkerHarness {
  switch (kind) {
    case 'local-shell':
      return createLocalShellHarness(ops);
    case 'herdr-shell':
      return createHerdrShellHarness(ops);
    default:
      throw new Error(`Unknown harness kind: ${kind as string}`);
  }
}
