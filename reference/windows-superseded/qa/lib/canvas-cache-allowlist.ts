/**
 * Allowlist for canvas-cache-discipline (Stage D3).
 * Each entry documents a file that may call cache mutators or touch tiles[]/connections[].
 */

export type CanvasCacheAllowlistEntry = {
  /** Repo-relative path with forward slashes */
  file: string;
  /** One-line justification for qa/run.ts canvas-cache-discipline */
  reason: string;
};

export const CANVAS_CACHE_MUTATION_ALLOWLIST: CanvasCacheAllowlistEntry[] = [
  {
    file: "quantflow-electron/src/windows/shell/src/canvas-state.js",
    reason: "Read-through cache write API — sole authorized mutator module",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/renderer.js",
    reason: "Kernel event reconcile, boot hydrate, and kernel-gated cable create/remove",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/tile-manager.js",
    reason: "Tile CRUD with kernel write gates; focus z-order; close teardown",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/canvas-rpc.js",
    reason: "MCP/RPC canvas mutations with kernel write gates",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/tile-interactions.js",
    reason: "Drag/resize preview ephemera on tile fields; commit gates via tile-manager",
  },
  {
    file: "quantflow-electron/src/windows/shell/src/canvas-grid.js",
    reason: "Snap/repack geometry helpers; tidy path syncs via kernel.tile.layout_sync when one-truth",
  },
];

export const CANVAS_CACHE_ALLOWLIST_FILES = new Set(
  CANVAS_CACHE_MUTATION_ALLOWLIST.map((e) => e.file),
);
