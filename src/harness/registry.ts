/**
 * Harness registry — v3 Goal 6A (configuration only).
 *
 * The list of shipped harness descriptors and the rule mapping a runtime target
 * to a harness kind. The Kernel seeds the `harnesses` table from this list and
 * resolves a worker's harness_id; it never imports harness execution code.
 */

import type { HarnessDescriptor, HarnessKind } from './types';
import { localShellHarness } from './local-shell/index';
import { herdrShellHarness } from './herdr-shell/index';

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
