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
    expect(ids).toContain("claude");
    expect(ids).toContain("eve");
    expect(ids).toContain("shell");
    expect(ids).toContain("codex");
    expect(ids).toContain("claude-reviewer");
    expect(ids).toContain("opencode");
    expect(ids).toContain("puffer");
    expect(ids).toContain("python");
  });

  test("agent roles use legend-canonical display names", async () => {
    const roles = await listRoles();
    expect(roles.find((role) => role.id === "codex")?.name).toBe("Codex");
    expect(roles.find((role) => role.id === "claude")?.name)
      .toBe("Claude Code");
  });

  test("codex on windows-pty rail launches native CLI via adapter", async () => {
    const roles = await listRoles();
    const codex = roles.find((role) => role.id === "codex");
    expect(codex?.runtimeTarget).toBe("windows-pty");
    expect(codex?.agentAdapter?.launch).toBe("codex");
    expect(codex?.commandTemplate).toContain("codex");
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
        description: "Hermes orchestrator lead (AgentOS claude-code session)",
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

  test("Hermes uses AgentOS claude-code with an orchestrator startup prompt", async () => {
    const role = await getRole("hermes");

    expect(role?.agentosSoftware).toBe("claude-code");
    expect(role?.runtimeTarget).toBe("agentos");
    expect(role?.startupPrompt).toContain("QuantFlow");
    expect(role?.startupPrompt?.toLowerCase()).not.toContain("coordinate via cables");
    expect(role?.systemPrompt).toBeUndefined();
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

  test("native-tui chat agents use windows-pty rail with adapters", async () => {
    const roles = await listRoles();
    for (const id of ["codex", "claude"] as const) {
      const role = roles.find((entry) => entry.id === id);
      expect(role?.runtimeTarget).toBe("windows-pty");
      expect(role?.agentAdapter?.integrationMode).toBe("native-tui");
      expect(role?.agentAdapter?.launch).toBe(id);
      expect(requiresHerdrSpawn(role)).toBe(false);
    }
    const claudeReviewer = roles.find((entry) => entry.id === "claude-reviewer");
    expect(claudeReviewer?.runtimeTarget).toBe("agentos");
    expect(claudeReviewer?.harnessKind).toBe("agentos");
    expect(claudeReviewer?.agentosSoftware).toBe("claude-code");
    const hermes = roles.find((entry) => entry.id === "hermes");
    expect(hermes?.agentosSoftware).toBe("claude-code");
    expect(hermes?.runtimeTarget).toBe("agentos");
    for (const role of roles) {
      if (role.id === "pi-stick") continue;
      expect(role.agentosSoftware).not.toBe("pi");
    }
  });

  test("claude-worker id resolves to the claude dock actor", async () => {
    const role = await getRole("claude-worker");
    expect(role?.id).toBe("claude-worker");
    expect(role?.agentAdapter?.launch).toBe("claude");
    expect(role?.runtimeTarget).toBe("windows-pty");
  });

  test("script lanes and reserved roles keep their rails (roster policy)", async () => {
    const roles = await listRoles();
    for (const id of ["opencode", "python", "puffer"]) {
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
      ["codex", "claude", "claude-reviewer", "opencode"].includes(role.id),
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
