/**
 * herdr-shell harness — v3 Goal 6.
 *
 * Wraps the shipped herdr-backed WSL pane runtime. The descriptor is registry
 * config; createHerdrShellHarness builds the full WorkerHarness over injected
 * runtime ops (live ops wrap the approved herdr role-spawn path; the actual
 * herdr spawn/send/stop stays in the Electron runtime). The Kernel records the
 * herdr_pane_id / envoy_space_id on the worker row.
 */

import type { HarnessDescriptor, HarnessRuntimeOps, WorkerHarness } from '../types';
import { createShellHarness } from '../shell-harness';

export const herdrShellHarness: HarnessDescriptor = {
  kind: 'herdr-shell',
  description: 'herdr-backed WSL pane runtime',
  configSchema: {},
};

export function createHerdrShellHarness(ops: HarnessRuntimeOps): WorkerHarness {
  return createShellHarness('herdr-shell', ops);
}
