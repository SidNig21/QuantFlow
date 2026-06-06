import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getRoleCommandName,
  listRoles,
  getRole,
  requiresHerdrSpawn,
  _setRolesDir,
} from "./role-service";

const TEST_ROOT = join(tmpdir(), `quantflow-roles-${Date.now()}`);

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  _setRolesDir(TEST_ROOT);
});

describe("listRoles", () => {
  test("returns 5 built-in roles when no custom roles exist", async () => {
    const roles = await listRoles();
    expect(roles.length).toBeGreaterThanOrEqual(5);
  });

  test("includes practical orchestration roles", async () => {
    const roles = await listRoles();
    const ids = roles.map((r) => r.id);
    expect(ids).toContain("hermes");
    expect(ids).toContain("shell");
    expect(ids).toContain("codex");
    expect(ids).toContain("claude-worker");
    expect(ids).toContain("claude-reviewer");
    expect(ids).toContain("opencode");
    expect(ids).toContain("puffer");
    expect(ids).toContain("python");
  });

  test("agent roles use legend-canonical display names", async () => {
    const roles = await listRoles();
    expect(roles.find((role) => role.id === "codex")?.name).toBe("Codex CLI");
    expect(roles.find((role) => role.id === "claude-worker")?.name)
      .toBe("Claude Code");
  });

  test("codex is available when installed in WSL on Windows", async () => {
    if (process.platform !== "win32") return;
    const roles = await listRoles();
    expect(roles.find((role) => role.id === "codex")?.commandAvailable).toBe(true);
  });

  test("includes Legend v1 recipe roles", async () => {
    const roles = await listRoles();
    expect(Object.fromEntries(
      roles
        .filter((role) => ["hermes", "puffer", "python"].includes(role.id))
        .map((role) => [role.id, {
          name: role.name,
          description: role.description,
          color: role.color,
        }]),
    )).toEqual({
      hermes: {
        name: "Hermes",
        description: "Sync · gossip rooms",
        color: "#06b6d4",
      },
      puffer: {
        name: "PufferLib worker",
        description: "RL training · dumb",
        color: "#f59e0b",
      },
      python: {
        name: "Python script",
        description: "One-shot script",
        color: "#6366f1",
      },
    });
  });

  test("Hermes launches by running hermes, not by typing a startup prompt", async () => {
    const role = await getRole("hermes");

    expect(role?.commandTemplate).toBe("hermes");
    expect(role?.startupPrompt).toBeUndefined();
    expect(role?.systemPrompt).toContain("Act as Hermes");
  });

  test("each role has identity and launch metadata", async () => {
    const roles = await listRoles();
    for (const role of roles) {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(typeof role.description).toBe("string");
      expect(typeof role.color).toBe("string");
      expect(role.cwdPolicy === undefined || typeof role.cwdPolicy === "string")
        .toBe(true);
      expect(role.defaultShell === undefined || typeof role.defaultShell === "string")
        .toBe(true);
      expect(role.statusParser === undefined || typeof role.statusParser === "object")
        .toBe(true);
    }
  });

  test("WSL legend agents use herdr-wsl runtimeTarget", async () => {
    const roles = await listRoles();
    const herdrIds = ["hermes", "codex", "claude-worker", "opencode", "python", "puffer"];
    for (const id of herdrIds) {
      const role = roles.find((entry) => entry.id === id);
      expect(role?.runtimeTarget).toBe("herdr-wsl");
      expect(requiresHerdrSpawn(role)).toBe(true);
    }
    expect(roles.find((role) => role.id === "shell")?.runtimeTarget)
      .toBe("windows-pty");
    expect(requiresHerdrSpawn(roles.find((role) => role.id === "shell"))).toBe(false);
  });

  test("agent roles include status parser hints", async () => {
    const roles = await listRoles();
    const agentRoles = roles.filter((role) =>
      ["codex", "claude-worker", "claude-reviewer", "opencode"].includes(role.id),
    );

    expect(agentRoles).toHaveLength(4);
    for (const role of agentRoles) {
      expect(role.statusParser?.waiting?.length).toBeGreaterThan(0);
      expect(role.statusParser?.blocked?.length).toBeGreaterThan(0);
    }
  });
});

describe("getRole", () => {
  test("returns role by id", async () => {
    const role = await getRole("coder");
    expect(role?.id).toBe("coder");
    expect(role?.name).toBe("Coder");
  });

  test("returns null for unknown id", async () => {
    const role = await getRole("nonexistent");
    expect(role).toBeNull();
  });
});

describe("getRoleCommandName", () => {
  test("extracts the executable from a command template", () => {
    expect(getRoleCommandName({ commandTemplate: "codex --dangerously" }))
      .toBe("codex");
    expect(getRoleCommandName({ commandTemplate: "\"claude code\"" }))
      .toBe("claude code");
    expect(getRoleCommandName({ commandTemplate: "   " })).toBeNull();
  });
});
