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
const agentosRole = {
  id: "hermes",
  name: "Hermes",
  color: "#06b6d4",
  runtimeTarget: "agentos",
  agentosSoftware: "pi",
  commandTemplate: "hermes",
  startupPrompt: "Review the current task context and wait for instructions.",
};

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

  test("workflowId is forwarded into kernel.worker.spawn", async () => {
    const sent: { method: string; payload: Record<string, unknown> }[] = [];
    setKernelApi((method, payload) => {
      sent.push({ method, payload: payload as Record<string, unknown> });
      return { ok: true };
    });
    const { deps } = makeDeps();

    await spawnRoleTileAt(deps, localRole, 0, 0, { workflowId: "wf-123" });

    const spawnCall = sent.find((c) => c.method === "kernel.worker.spawn");
    expect(spawnCall).toBeDefined();
    expect(spawnCall?.payload.workflowId).toBe("wf-123");
  });
});

// T004 (S1): roles with runtimeTarget "agentos" (canvas.roleSpawn — the path
// MCP quantflow_role_spawn rides) must route through the same seam the legend
// dock click uses, NEVER the legacy pty/local-shell or herdr paths.
describe("agentos roles never fall through to the legacy pty path", () => {
  test("routes through the agentos terminal seam, not pty/herdr", async () => {
    const sent: { method: string; payload: Record<string, unknown> }[] = [];
    setKernelApi((method, payload) => {
      sent.push({ method, payload: payload as Record<string, unknown> });
      return { ok: true };
    });
    const { deps, calls, tile } = makeDeps();
    const prepared: Record<string, unknown>[] = [];
    // deno-lint-ignore no-explicit-any
    (deps.shellApi as any).agentosTerminalPrepare = async (
      input: Record<string, unknown>,
    ) => {
      prepared.push(input);
      return { ok: true, terminalTarget: `agentos:${input.tileId}` };
    };

    await spawnRoleTileAt(deps, agentosRole, 0, 0, {});

    // AgentOS seam engaged; legacy runtimes untouched.
    expect(prepared.length).toBe(1);
    expect(calls.herdrSpawnRole).toBe(0);
    expect(tile.runtimeTarget).toBe("agentos");
    expect(tile.terminalTarget).toBe("agentos:tile-x");
    expect(tile.ptyStatus).toBe("running");
    // Startup prompt threads through as the AgentOS instruction.
    expect(prepared[0]?.instruction).toBe(agentosRole.startupPrompt);
    // Kernel worker row carries the agentos runtime, not local-shell.
    const spawnCall = sent.find((c) => c.method === "kernel.worker.spawn");
    expect(spawnCall?.payload.runtimeTarget).toBe("agentos");
    expect(spawnCall?.payload.harnessKind).toBe("agentos");
    expect(spawnCall?.payload.roleName).toBe("Hermes");
    expect(calls.spawnTerminalWebview).toBe(1);
  });

  test("Kernel rejection still prevents any runtime start", async () => {
    setKernelApi((method) =>
      method === "kernel.worker.spawn" ? { ok: false, error: "denied" } : { ok: true },
    );
    const { deps, calls, tile } = makeDeps();
    const prepared: unknown[] = [];
    // deno-lint-ignore no-explicit-any
    (deps.shellApi as any).agentosTerminalPrepare = async (input: unknown) => {
      prepared.push(input);
      return { ok: true, terminalTarget: "agentos:tile-x" };
    };

    await spawnRoleTileAt(deps, agentosRole, 0, 0, {});

    expect(prepared.length).toBe(0);
    expect(calls.herdrSpawnRole).toBe(0);
    expect(calls.onRoleSpawnFailed).toBe(1);
    expect(tile.ptyStatus).toBe("error");
  });

  test("bridge failure leaves an explicit error state — never a default pty session", async () => {
    setKernelApi(() => ({ ok: true }));
    const { deps, calls, tile } = makeDeps();
    // deno-lint-ignore no-explicit-any
    (deps.shellApi as any).agentosTerminalPrepare = async () => ({
      ok: false,
      error: "agentos unavailable: host not reachable",
    });

    await spawnRoleTileAt(deps, agentosRole, 0, 0, {});

    expect(calls.herdrSpawnRole).toBe(0);
    expect(calls.onRoleSpawnFailed).toBe(1);
    expect(tile.ptyStatus).toBe("error");
    expect(String(tile.ptyError)).toContain("agentos unavailable");
    // No terminal target means no pty session was ever attached.
    expect(tile.terminalTarget).toBeUndefined();
  });
});
