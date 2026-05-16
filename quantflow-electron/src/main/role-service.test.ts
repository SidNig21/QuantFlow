import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getRoleCommandName, listRoles, getRole, _setRolesDir } from "./role-service";

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
    expect(ids).toContain("shell");
    expect(ids).toContain("codex");
    expect(ids).toContain("claude-worker");
    expect(ids).toContain("claude-reviewer");
    expect(ids).toContain("opencode");
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
