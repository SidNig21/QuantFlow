import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildHerdrAgentName,
  extractHerdrPaneId,
  extractHerdrTerminalId,
  extractHerdrWorkspaceId,
  shouldSpawnRoleViaHerdr,
  spawnHerdrRoleSession,
} from "./herdr-session-spawn";

describe("herdr role spawn planning", () => {
  test("keeps the 2B spawn flow off the legacy herdr CLI bridge", () => {
    const files = [
      "herdr-session-spawn.ts",
      "herdr-spawn-input.ts",
      "ipc-herdr-spawn.ts",
    ];

    for (const file of files) {
      const source = readFileSync(
        path.join(import.meta.dir, file),
        "utf8",
      );
      expect(source).not.toContain("./herdr-bridge");
      expect(source).not.toContain("from \"./herdr-bridge\"");
      expect(source).not.toContain("from './herdr-bridge'");
    }
  });

  test("uses deterministic agent names from workspace, role, and tile", () => {
    expect(buildHerdrAgentName({
      workspaceId: "QuantFlow V2",
      roleId: "Hermes",
      tileId: "tile-123",
    })).toBe("qf.quantflow-v2.hermes.tile-123");
  });

  test("routes only Hermes through 2B herdr spawn initially", () => {
    expect(shouldSpawnRoleViaHerdr({ id: "hermes" })).toBe(true);
    expect(shouldSpawnRoleViaHerdr({ id: "codex" })).toBe(false);
    expect(shouldSpawnRoleViaHerdr(null)).toBe(false);
  });

  test("extracts pane and terminal identity from permissive response shapes", () => {
    expect(extractHerdrPaneId(
      { root_pane: { pane_id: "root-pane" } },
      { pane: { id: "split-pane" } },
    )).toBe("split-pane");
    expect(extractHerdrPaneId(
      { root_pane: { pane_id: "root-pane" } },
      {},
    )).toBe("root-pane");
    expect(extractHerdrWorkspaceId({
      workspace: { workspace_id: "workspace-1" },
    })).toBe("workspace-1");
    expect(extractHerdrTerminalId({
      pane: { terminal_id: "terminal-1" },
    })).toBe("terminal-1");
    expect(extractHerdrTerminalId({})).toBeNull();
  });

  test("creates a workspace, splits an agent pane, verifies pane.get terminal id, and returns identity", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const result = await spawnHerdrRoleSession({
      tileId: "tile-1",
      roleId: "hermes",
      roleName: "Hermes",
      cwd: "/repo",
      commandTemplate: "hermes",
      startupPrompt: "Coordinate this canvas.",
      workspaceId: "QuantFlow V2",
    }, async (method, params) => {
      calls.push({ method, params });
      if (method === "workspace.create") {
        return {
          workspace: { workspace_id: "workspace-1" },
          root_pane: { pane_id: "root-pane" },
        };
      }
      if (method === "pane.split") {
        return {
          pane: {
            pane_id: "pane-1",
            terminal_id: "management-terminal",
          },
        };
      }
      if (method === "pane.get") {
        return {
          pane: {
            pane_id: "pane-1",
            terminal_id: "agent-terminal-1",
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    expect(calls.map((call) => call.method)).toEqual([
      "workspace.create",
      "pane.split",
      "pane.get",
    ]);
    expect(calls[0]?.params).toMatchObject({
      label: "qf.quantflow-v2.hermes.tile-1",
      cwd: "/repo",
      no_focus: true,
    });
    expect(calls[1]?.params).toMatchObject({
      target_pane_id: "root-pane",
      direction: "right",
      cwd: "/repo",
      no_focus: true,
      tile_id: "tile-1",
    });
    expect(calls[2]?.params).toEqual({
      pane_id: "pane-1",
    });
    expect(result).toMatchObject({
      runtimeTarget: "herdr-wsl",
      herdrAgentName: "qf.quantflow-v2.hermes.tile-1",
      herdrWorkspaceId: "workspace-1",
      herdrPaneId: "pane-1",
      herdrTerminalId: "agent-terminal-1",
      terminalTarget: "herdr-wsl:agent-terminal-1",
    });
  });

  test("does not type startup prompts into a blank herdr pane", async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const result = await spawnHerdrRoleSession({
      tileId: "tile-hermes",
      roleId: "hermes",
      roleName: "Hermes",
      cwd: "/repo",
      startupPrompt: "Act as Hermes, the run orchestrator.",
      workspaceId: "QuantFlow V2",
    }, async (method, params) => {
      calls.push({ method, params });
      if (method === "workspace.create") {
        return {
          workspace: { workspace_id: "workspace-1" },
          root_pane: { pane_id: "root-pane" },
        };
      }
      if (method === "pane.split") {
        return {
          pane: {
            pane_id: "pane-1",
            terminal_id: "terminal-1",
          },
        };
      }
      if (method === "pane.get") {
        return {
          pane: {
            pane_id: "pane-1",
            terminal_id: "terminal-1",
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    expect(calls.map((call) => call.method)).toEqual([
      "workspace.create",
      "pane.split",
      "pane.get",
    ]);
    expect(result).toMatchObject({
      runtimeTarget: "herdr-wsl",
      herdrPaneId: "pane-1",
      herdrTerminalId: "terminal-1",
      terminalTarget: "herdr-wsl:terminal-1",
    });
  });

  test("does not use the workspace root pane as the agent pane", async () => {
    await expect(spawnHerdrRoleSession({
      tileId: "tile-1",
      roleId: "hermes",
      roleName: "Hermes",
    }, async (method) => {
      if (method === "workspace.create") {
        return {
          workspace: { workspace_id: "workspace-1" },
          root_pane: { pane_id: "root-pane" },
        };
      }
      if (method === "pane.split") {
        return {};
      }
      throw new Error(`unexpected method ${method}`);
    })).rejects.toThrow("agent pane id");
  });

  test("fails if pane.get does not return the split agent terminal id", async () => {
    await expect(spawnHerdrRoleSession({
      tileId: "tile-1",
      roleId: "hermes",
      roleName: "Hermes",
    }, async (method) => {
      if (method === "workspace.create") {
        return {
          workspace: { workspace_id: "workspace-1" },
          root_pane: { pane_id: "root-pane" },
        };
      }
      if (method === "pane.split") {
        return { pane: { pane_id: "pane-1", terminal_id: "terminal-from-split" } };
      }
      if (method === "pane.get") {
        return { pane: { pane_id: "pane-1" } };
      }
      throw new Error(`unexpected method ${method}`);
    })).rejects.toThrow("agent terminal id");
  });

  test("fails when herdr spawn returns no pane identity", async () => {
    await expect(spawnHerdrRoleSession({
      tileId: "tile-1",
      roleId: "hermes",
      roleName: "Hermes",
    }, async () => ({}))).rejects.toThrow("pane id");
  });
});
