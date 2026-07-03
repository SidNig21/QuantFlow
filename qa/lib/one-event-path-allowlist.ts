/**
 * Allowlist for one-event-path (Stage E1).
 * Renderer files may listen to deprecated buses only when documented here.
 */

export type OneEventPathAllowlistEntry = {
  /** Repo-relative path with forward slashes */
  file: string;
  /** Deprecated listener API or bus name */
  bus: string;
  /** One-line justification for qa/run.ts one-event-path */
  reason: string;
};

export const DEPRECATED_BUS_LISTENER_ALLOWLIST: OneEventPathAllowlistEntry[] = [
  {
    file: "quantflow-electron/src/windows/shell/src/renderer.js",
    bus: "herdr:status-changed",
    reason:
      "Harness adapter: herdr badge ephemera + kernel.worker.status_update write; projection via worker.* kernel:event only",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/renderer.js",
    bus: "pty:exit",
    reason:
      "Harness lifecycle: close term tile on session exit (E2 milestone fence deferred)",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/renderer.js",
    bus: "shell:forward",
    reason:
      "Shell routing to embedded webviews; not Kernel canonical facts",
  },
];

/** Map file → allowed bus names for deprecated listener checks */
export function allowedDeprecatedBusesForFile(relPath: string): Set<string> {
  const buses = new Set<string>();
  for (const entry of DEPRECATED_BUS_LISTENER_ALLOWLIST) {
    if (entry.file === relPath) buses.add(entry.bus);
  }
  return buses;
}

export const EMIT_KERNEL_EVENT_ALLOWLIST = [
  "src/kernel/",
  "src/main/conductor/conductor-loop.ts",
  "src/main/conductor/conductor-tools-readonly.ts",
  "quantflow-electron/scripts/smoke-perf-trace.ts",
];

export function isEmitKernelEventAllowed(relPath: string): boolean {
  return EMIT_KERNEL_EVENT_ALLOWLIST.some((prefix) =>
    relPath.startsWith(prefix.replace(/\\/g, "/")),
  );
}
