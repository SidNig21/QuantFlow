/**
 * Allowlist for qa/runtime-fence (Stage F2).
 * Canonical Kernel mutations must go through command handlers in src/kernel/**.
 */

export type RuntimeFenceAllowlistEntry = {
  file: string;
  symbol: string;
  reason: string;
};

/** Direct handle*Command calls outside src/kernel (tests/smokes only). */
export const HANDLE_COMMAND_ALLOWLIST: RuntimeFenceAllowlistEntry[] = [
  {
    file: 'quantflow-electron/src/main/canvas-one-truth.test.ts',
    symbol: 'handleTileCommand',
    reason: 'D1/D5 one-truth boot parity test — in-memory kernel fixture',
  },
  {
    file: 'quantflow-electron/scripts/smoke-context-flow.ts',
    symbol: 'handleTaskCommand',
    reason: 'Headless smoke — dispatches through same handlers as production commands',
  },
  {
    file: 'quantflow-electron/scripts/smoke-event-projection.ts',
    symbol: 'handleTaskCommand',
    reason: 'Headless smoke — kernel command handler parity',
  },
  {
    file: 'quantflow-electron/scripts/smoke-judgment.ts',
    symbol: 'handleTaskCommand',
    reason: 'R7 judgment smoke — in-memory kernel',
  },
  {
    file: 'quantflow-electron/scripts/smoke-perf-trace.ts',
    symbol: 'handleTaskCommand',
    reason: 'PF0 perf smoke — in-memory kernel',
  },
  {
    file: 'qa/lib/golden-task-atom.ts',
    symbol: 'handleTaskCommand',
    reason: 'Golden regression anchor — mock harness, in-memory kernel',
  },
  {
    file: 'qa/lib/divergence.ts',
    symbol: 'handleTileCommand',
    reason: 'D5 divergence capstone — in-memory kernel',
  },
  {
    file: 'qa/lib/one-truth-boot.ts',
    symbol: 'handleTileCommand',
    reason: 'D1 boot parity — in-memory kernel',
  },
  {
    file: 'qa/lib/one-truth-save.ts',
    symbol: 'handleTileCommand',
    reason: 'D2 save demotion — in-memory kernel',
  },
  {
    file: 'qa/lib/connection-round-trip.ts',
    symbol: 'handleTileCommand',
    reason: 'D4 connection round-trip — in-memory kernel',
  },
  {
    file: 'qa/lib/storm-check.ts',
    symbol: 'handleReceiptCommand',
    reason: 'E3 storm — in-memory kernel',
  },
  {
    file: 'qa/lib/pty-flood-check.ts',
    symbol: 'handleTileCommand',
    reason: 'E3 PTY flood — in-memory kernel',
  },
];

/** getKernelDb().prepare INSERT/UPDATE on canonical tables outside src/kernel. */
export const KERNEL_DB_WRITE_ALLOWLIST: RuntimeFenceAllowlistEntry[] = [
  {
    file: 'quantflow-electron/src/main/envoy-kernel-bridge.ts',
    symbol: 'getKernelDb',
    reason: 'Read-only tile existence check before dispatchKernelCommand bootstrap',
  },
  {
    file: 'quantflow-electron/src/main/connections-access.ts',
    symbol: 'getKernelDb',
    reason: 'Read path + dispatchKernelCommand writes only under one-truth',
  },
];

const HANDLE_COMMAND_SYMBOLS = [
  'handleReceiptCommand',
  'handleTaskCommand',
  'handleTileCommand',
  'handleWorkerCommand',
  'handleArtifactCommand',
  'handleWorkflowCommand',
  'handleConnectionCommand',
] as const;

export function isHandleCommandAllowed(relPath: string, symbol: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('src/kernel/')) return true;
  return HANDLE_COMMAND_ALLOWLIST.some(
    (e) => e.file === norm && e.symbol === symbol,
  );
}

export function isKernelDbWriteAllowed(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('src/kernel/')) return true;
  return KERNEL_DB_WRITE_ALLOWLIST.some((e) => e.file === norm);
}

export function detectHandleCommandSymbol(text: string): string | null {
  for (const sym of HANDLE_COMMAND_SYMBOLS) {
    if (new RegExp(`\\b${sym}\\s*\\(`).test(text)) return sym;
  }
  return null;
}

/** Kernel canonical table names — writes outside src/kernel are fence violations. */
export const KERNEL_CANONICAL_TABLES = [
  'receipts',
  'tasks',
  'tiles',
  'workers',
  'worker_instances',
  'connections',
  'workflows',
  'artifacts',
  'state_cards',
  'harnesses',
  'evaluations',
  'tile_extensions',
] as const;

export function hasKernelDbCanonicalWrite(text: string): boolean {
  const tableAlt = KERNEL_CANONICAL_TABLES.join('|');
  const insertRe = new RegExp(
    `\\.prepare\\s*\\(\\s*['"\`]INSERT\\s+INTO\\s+(${tableAlt})\\b`,
    'i',
  );
  const updateRe = new RegExp(
    `\\.prepare\\s*\\(\\s*['"\`]UPDATE\\s+(${tableAlt})\\b`,
    'i',
  );
  return insertRe.test(text) || updateRe.test(text);
}
