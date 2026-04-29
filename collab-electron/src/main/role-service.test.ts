import { describe, test, expect, mock } from "bun:test";

mock.module("node:fs/promises", () => ({
  mkdir: async () => {},
  readdir: async () => [],
  readFile: async () => { throw new Error("no file"); },
}));

import { listRoles, getRole } from "./role-service";

describe("listRoles", () => {
  test("returns 5 built-in roles when no custom roles exist", async () => {
    const roles = await listRoles();
    expect(roles.length).toBeGreaterThanOrEqual(5);
  });

  test("includes coder, reviewer, planner, researcher, writer", async () => {
    const roles = await listRoles();
    const ids = roles.map((r) => r.id);
    expect(ids).toContain("coder");
    expect(ids).toContain("reviewer");
    expect(ids).toContain("planner");
    expect(ids).toContain("researcher");
    expect(ids).toContain("writer");
  });

  test("each role has id, name, description, color", async () => {
    const roles = await listRoles();
    for (const role of roles) {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(typeof role.description).toBe("string");
      expect(typeof role.color).toBe("string");
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
