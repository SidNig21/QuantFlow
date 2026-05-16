import { describe, expect, test } from "bun:test";
import {
  createEmptyProfileRegistry,
  findDeferredEnvRefs,
  parseProfile,
  parseProfileRegistry,
  ProfileValidationError,
  validateProfile,
  validateProfileRegistry,
  type AgentProfile,
  type Profile,
  type TerminalProfile,
  type ToolProfile,
} from "./profile-types";

const NOW = "2026-05-15T12:00:00.000Z";

function baseProfile(kind: Profile["kind"]) {
  return {
    id: `${kind}-main`,
    kind,
    name: `${kind} main`,
    description: "Test profile",
    tags: ["agent", "agent", "Goal 3"],
    workspaceScope: "/workspace",
    permissions: {
      network: "inherit",
      filesystem: "workspace-write",
      interactive: true,
    },
    env: [
      { name: "PLAIN", kind: "literal", value: "yes" },
      { name: "TOKEN", kind: "secret-ref", ref: "secret://token" },
      { name: "ROOT", kind: "workspace-ref", ref: "workspace.root" },
    ],
    vaultMemoryScope: { mode: "workspace" },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function terminalProfile(): TerminalProfile {
  return {
    ...baseProfile("terminal"),
    kind: "terminal",
    target: "wsl:Ubuntu",
    shell: {
      command: "bash",
      args: ["-l"],
      cwd: "/workspace",
    },
    startupInput: "pwd",
  };
}

function agentProfile(): AgentProfile {
  return {
    ...baseProfile("agent"),
    kind: "agent",
    runtime: "codex-cli",
    command: {
      command: "codex",
      args: ["--version"],
    },
    capabilities: ["code", "review"],
  };
}

function toolProfile(): ToolProfile {
  return {
    ...baseProfile("tool"),
    kind: "tool",
    toolKind: "mcp-stdio",
    command: {
      command: "node",
      args: ["server.js"],
    },
  };
}

describe("profile type validation", () => {
  test("accepts terminal, agent, and tool profiles", () => {
    const terminal = parseProfile(terminalProfile());
    const agent = parseProfile(agentProfile());
    const tool = parseProfile(toolProfile());

    expect(terminal.kind).toBe("terminal");
    expect(agent.kind).toBe("agent");
    expect(tool.kind).toBe("tool");
    expect(terminal.tags).toEqual(["agent", "Goal 3"]);
  });

  test("keeps deferred env refs distinct from literal values", () => {
    const profile = parseProfile(agentProfile());
    const deferred = findDeferredEnvRefs(profile);

    expect(deferred.map((entry) => entry.kind)).toEqual([
      "secret-ref",
      "workspace-ref",
    ]);
  });

  test("rejects invalid base fields and profile-specific fields", () => {
    const result = validateProfile({
      ...agentProfile(),
      id: "bad id",
      runtime: "unknown",
      env: [{ name: "BAD-NAME", kind: "literal", value: "x" }],
      command: { command: "", args: ["--ok"] },
      createdAt: "not-a-date",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("id");
      expect(result.issues.map((issue) => issue.path)).toContain("runtime");
      expect(result.issues.map((issue) => issue.path)).toContain("env.0.name");
      expect(result.issues.map((issue) => issue.path)).toContain("command.command");
      expect(result.issues.map((issue) => issue.path)).toContain("createdAt");
    }
  });

  test("requires paths memory scopes to declare at least one path", () => {
    const result = validateProfile({
      ...terminalProfile(),
      vaultMemoryScope: { mode: "paths", paths: [] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("empty_array");
    }
  });

  test("validates profile registry version and duplicate identities", () => {
    const duplicate = {
      ...terminalProfile(),
      id: "terminal-copy",
      name: "TERMINAL MAIN",
    };
    const result = validateProfileRegistry({
      version: 1,
      profiles: [terminalProfile(), duplicate],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain("duplicate_name");
    }
  });

  test("creates an empty v1 registry", () => {
    expect(createEmptyProfileRegistry()).toEqual({
      version: 1,
      profiles: [],
    });
  });

  test("throws with issue details for invalid registry input", () => {
    expect(() => parseProfileRegistry({ version: 2, profiles: [] }))
      .toThrow(ProfileValidationError);
  });
});
