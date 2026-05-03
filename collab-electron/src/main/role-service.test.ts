import { describe, test, expect, mock } from "bun:test";

mock.module("node:fs/promises", () => ({
  mkdir: async () => {},
  readdir: async () => [],
  readFile: async () => { throw new Error("no file"); },
}));

import { getRoleCommandName, listRoles, getRole } from "./role-service";

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
