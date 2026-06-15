/**
 * local-shell harness — v3 Goal 6.
 *
 * Wraps the shipped local PTY shell runtime (node-pty / Windows shell fallback).
 * The descriptor is registry config; createLocalShellHarness builds the full
 * WorkerHarness over injected runtime ops (the live ops wrap the approved shell
 * role-spawn path; the actual PTY work stays in the Electron runtime).
 */

import type { HarnessDescriptor, HarnessRuntimeOps, WorkerHarness } from '../types';
import { createShellHarness } from '../shell-harness';

export const localShellHarness: HarnessDescriptor = {
  kind: 'local-shell',
  description: 'Local PTY shell (node-pty / Windows shell fallback)',
  configSchema: {},
};

export function createLocalShellHarness(ops: HarnessRuntimeOps): WorkerHarness {
  return createShellHarness('local-shell', ops);
}
