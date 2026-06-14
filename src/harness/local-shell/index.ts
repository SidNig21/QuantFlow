/**
 * local-shell harness descriptor — v3 Goal 6A.
 *
 * Wraps the shipped local PTY shell runtime (node-pty / Windows shell fallback).
 * Descriptor/config only — the actual PTY spawn stays in the Electron runtime.
 */

import type { HarnessDescriptor } from '../types';

export const localShellHarness: HarnessDescriptor = {
  kind: 'local-shell',
  description: 'Local PTY shell (node-pty / Windows shell fallback)',
  configSchema: {},
};
