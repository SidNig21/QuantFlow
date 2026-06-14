/**
 * herdr-shell harness descriptor — v3 Goal 6A.
 *
 * Wraps the shipped herdr-backed WSL pane runtime. Descriptor/config only — the
 * actual herdr spawn stays in the Electron runtime (herdrSpawnRole). The Kernel
 * records the resulting herdr_pane_id / envoy_space_id on the worker row.
 */

import type { HarnessDescriptor } from '../types';

export const herdrShellHarness: HarnessDescriptor = {
  kind: 'herdr-shell',
  description: 'herdr-backed WSL pane runtime',
  configSchema: {},
};
