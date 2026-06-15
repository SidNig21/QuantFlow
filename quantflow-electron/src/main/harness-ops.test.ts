import { describe, expect, test } from "bun:test";
import { createLiveHarnessOps, type LiveHarnessDeps } from "./harness-ops";
import { createHarness } from "@qf-harness/registry";
import type { HarnessKind } from "@qf-harness/types";

// Goal 6: prove the live HarnessRuntimeOps binding routes the WorkerHarness
// contract through the expected app/Kernel seams (spies; no real herdr/PTY).

interface Calls {
  resolveRole: string[];
  spawnViaShell: Record<string, unknown>[];
  ptyWrite: { sessionId: string; text: string }[];
  ptyKill: string[];
  herdrSend: { paneId: string; text: string }[];
  dispatchKernel: { type: string; payload: Record<string, unknown> }[];
  getStateCard: string[];
  getWorkerForTile: string[];
}

function makeDeps(kind: HarnessKind): { deps: LiveHarnessDeps; calls: Calls } {
  const calls: Calls = {
    resolveRole: [], spawnViaShell: [], ptyWrite: [], ptyKill: [],
    herdrSend: [], dispatchKernel: [], getStateCard: [], getWorkerForTile: [],
  };
  const deps: LiveHarnessDeps = {
    resolveRole: async (roleId) => { calls.resolveRole.push(roleId); return { id: roleId, name: "Coder" }; },
    spawnViaShell: async (params) => {
      calls.spawnViaShell.push(params);
      return {
        tileId: "tile-1",
        ptySessionId: "pty-1",
        ...(kind === "herdr-shell"
          ? { herdrPaneId: "pane-1", herdrWorkspaceId: "space-1" }
          : {}),
      };
    },
    ptyWrite: (sessionId, text) => { calls.ptyWrite.push({ sessionId, text }); },
    ptyKill: (sessionId) => { calls.ptyKill.push(sessionId); },
    herdrSend: async (paneId, text) => { calls.herdrSend.push({ paneId, text }); },
    dispatchKernel: async (type, payload) => { calls.dispatchKernel.push({ type, payload }); return { ok: true }; },
    getStateCard: (tileId) => { calls.getStateCard.push(tileId); return { status: "active" }; },
    getWorkerForTile: (tileId) => { calls.getWorkerForTile.push(tileId); return "worker-1"; },
  };
  return { deps, calls };
}

for (const kind of ["local-shell", "herdr-shell"] as const) {
  describe(`live harness ops routing — ${kind}`, () => {
    test("spawn routes through resolveRole + approved shell role-spawn", async () => {
      const { deps, calls } = makeDeps(kind);
      const harness = createHarness(kind, createLiveHarnessOps(deps));

      const handle = await harness.spawn({
        roleId: "coder",
        harnessKind: kind,
        workflowId: "wf1",
        activationPrompt: "go",
      });

      expect(calls.resolveRole).toEqual(["coder"]);
      expect(calls.spawnViaShell.length).toBe(1);
      expect(calls.spawnViaShell[0]!.workflowId).toBe("wf1");
      expect(calls.spawnViaShell[0]!.activationPrompt).toBe("go");
      expect((calls.spawnViaShell[0]!.role as { id: string }).id).toBe("coder");
      expect(calls.getWorkerForTile).toEqual(["tile-1"]);
      expect(handle.workerId).toBe("worker-1");
      expect(handle.tileId).toBe("tile-1");
      expect(handle.kind).toBe(kind);
      if (kind === "herdr-shell") {
        expect(handle.herdrPaneId).toBe("pane-1");
        expect(handle.envoySpaceId).toBe("space-1");
      }
    });

    test("send routes through the PTY input route", async () => {
      const { deps, calls } = makeDeps(kind);
      const harness = createHarness(kind, createLiveHarnessOps(deps));
      const handle = await harness.spawn({ roleId: "coder", harnessKind: kind });

      await harness.send(handle, { text: "run tests" });
      expect(calls.ptyWrite.at(-1)).toEqual({ sessionId: "pty-1", text: "run tests\n" });
    });

    test("readState reads the Kernel State Card", async () => {
      const { deps, calls } = makeDeps(kind);
      const harness = createHarness(kind, createLiveHarnessOps(deps));
      const handle = await harness.spawn({ roleId: "coder", harnessKind: kind });

      const state = await harness.readState(handle);
      expect(calls.getStateCard).toContain("tile-1");
      expect(state.status).toBe("active");
    });

    test("collectReceipts returns no parallel-authority drafts", async () => {
      const { deps } = makeDeps(kind);
      const harness = createHarness(kind, createLiveHarnessOps(deps));
      const handle = await harness.spawn({ roleId: "coder", harnessKind: kind });
      expect(await harness.collectReceipts(handle)).toEqual([]);
    });

    test("stop detaches runtime + updates Kernel worker status", async () => {
      const { deps, calls } = makeDeps(kind);
      const harness = createHarness(kind, createLiveHarnessOps(deps));
      const handle = await harness.spawn({ roleId: "coder", harnessKind: kind });

      await harness.stop(handle);
      expect(calls.ptyKill).toContain("pty-1");
      const stopCmd = calls.dispatchKernel.find((c) => c.type === "kernel.worker.stop");
      expect(stopCmd?.payload.tileId).toBe("tile-1");
      if (kind === "herdr-shell") {
        // interrupt (Ctrl+C) sent through the PTY before detach
        expect(calls.ptyWrite.some((w) => w.text === "\x03")).toBe(true);
      }
    });
  });
}
