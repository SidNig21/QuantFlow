import { afterEach, describe, expect, test } from "bun:test";
import { spawnRoleTileAt } from "./role-tile-spawn.js";

// Goal 6A: the shell must honor kernel.worker.spawn as the runtime authority
// gate — if the Kernel rejects worker.spawn, NO live runtime may start.

function setKernelApi(sendCommand: (method: string, payload: unknown) => unknown) {
  // role-tile-spawn reads window.kernelApi via a guarded ref.
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  if (typeof g.window === "undefined") g.window = {};
  g.window.kernelApi = { sendCommand };
}

afterEach(() => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  if (g.window) delete g.window.kernelApi;
});

interface Calls {
  herdrSpawnRole: number;
  spawnTerminalWebview: number;
  onRoleSpawnFailed: number;
  onRoleSpawned: number;
}

function makeDeps() {
  const calls: Calls = {
    herdrSpawnRole: 0,
    spawnTerminalWebview: 0,
    onRoleSpawnFailed: 0,
    onRoleSpawned: 0,
  };
  const tile: Record<string, unknown> = { id: "tile-x", type: "term" };
  const deps = {
    tileManager: {
      createCanvasTile: async () => tile,
      spawnTerminalWebview: () => { calls.spawnTerminalWebview += 1; },
      saveCanvasImmediate: () => {},
    },
    generateId: () => "tile-x",
    getTerminalCwd: () => "/tmp",
    getTerminalSize: () => ({ width: 300, height: 200 }),
    shellApi: {
      herdrSpawnRole: async () => {
        calls.herdrSpawnRole += 1;
        return { herdrPaneId: "p1", herdrWorkspaceId: "w1" };
      },
    },
    isMissingRoleCommand: () => false,
    createRoleSpawnFailureEvent: (_role: unknown, message: string) => ({ summary: message }),
    createRoleSpawnedEvent: () => ({}),
    onRoleSpawnFailed: () => { calls.onRoleSpawnFailed += 1; },
    onRoleSpawned: () => { calls.onRoleSpawned += 1; },
    toasts: { show: () => {} },
    updateRoleTileChrome: () => {},
  };
  return { deps, calls, tile };
}

const localRole = { id: "r1", name: "Coder", color: "#fff" };
const herdrRole = { id: "r2", name: "Agent", color: "#0ff", runtimeTarget: "herdr-wsl" };

describe("spawnRoleTileAt honors Kernel worker.spawn as the authority gate", () => {
  test("local-shell: Kernel rejection prevents spawnTerminalWebview", async () => {
    setKernelApi((method) =>
      method === "kernel.worker.spawn" ? { ok: false, error: "denied" } : { ok: true },
    );
    const { deps, calls, tile } = makeDeps();

    await spawnRoleTileAt(deps, localRole, 0, 0, {});

    expect(calls.spawnTerminalWebview).toBe(0);
    expect(calls.herdrSpawnRole).toBe(0);
    expect(calls.onRoleSpawnFailed).toBe(1);
    expect(calls.onRoleSpawned).toBe(0);
    expect(tile.ptyStatus).toBe("error");
  });

  test("herdr-shell: Kernel rejection prevents herdrSpawnRole", async () => {
    setKernelApi((method) =>
      method === "kernel.worker.spawn" ? { ok: false, error: "denied" } : { ok: true },
    );
    const { deps, calls } = makeDeps();

    await spawnRoleTileAt(deps, herdrRole, 0, 0, {});

    expect(calls.herdrSpawnRole).toBe(0);
    expect(calls.spawnTerminalWebview).toBe(0);
    expect(calls.onRoleSpawnFailed).toBe(1);
  });

  test("local-shell: Kernel acceptance allows the runtime to start", async () => {
    setKernelApi(() => ({ ok: true }));
    const { deps, calls } = makeDeps();

    await spawnRoleTileAt(deps, localRole, 0, 0, {});

    expect(calls.spawnTerminalWebview).toBe(1);
    expect(calls.onRoleSpawned).toBe(1);
    expect(calls.onRoleSpawnFailed).toBe(0);
  });
});
