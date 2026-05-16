import { describe, expect, test } from "bun:test";
import {
  checkVaultMemoryScope,
  isPathAllowedByVaultMemoryScope,
} from "./memory-scope";
import type { Profile } from "./profile-types";

const profileBase: Pick<Profile, "id" | "name" | "vaultMemoryScope"> = {
  id: "agent-main",
  name: "Agent Main",
  vaultMemoryScope: { mode: "workspace" },
};

describe("vault memory scope helpers", () => {
  test("allows all paths when scope is all", () => {
    expect(isPathAllowedByVaultMemoryScope(
      { mode: "all" },
      "/outside/file.md",
    )).toBe(true);
  });

  test("denies all paths when scope is none", () => {
    const result = checkVaultMemoryScope(
      { ...profileBase, vaultMemoryScope: { mode: "none" } },
      { action: "read", requestedPath: "/workspace/a.md" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("memory_scope_denied");
      expect(result.allowedScopes).toEqual([]);
      expect(result.requestedPath).toBe("/workspace/a.md");
    }
  });

  test("allows workspace descendants and denies paths outside workspace", () => {
    expect(isPathAllowedByVaultMemoryScope(
      { mode: "workspace" },
      "/workspace/notes/a.md",
      "/workspace",
    )).toBe(true);
    expect(isPathAllowedByVaultMemoryScope(
      { mode: "workspace" },
      "/workspace-other/a.md",
      "/workspace",
    )).toBe(false);
  });

  test("requires workspace path for workspace mode", () => {
    const result = checkVaultMemoryScope(
      profileBase,
      { action: "read", requestedPath: "/workspace/a.md" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.allowedScopes).toEqual(["workspace:<required>"]);
      expect(result.message).toContain("outside");
    }
  });

  test("allows configured path roots across Windows and WSL forms", () => {
    const scope = {
      mode: "paths" as const,
      paths: ["C:\\Users\\rybow\\Obsidian\\Cursor Collab"],
    };

    expect(isPathAllowedByVaultMemoryScope(
      scope,
      "/mnt/c/Users/rybow/Obsidian/Cursor Collab/GoalBuddy.md",
    )).toBe(true);
    expect(isPathAllowedByVaultMemoryScope(
      scope,
      "C:\\Users\\rybow\\Downloads\\other.md",
    )).toBe(false);
  });

  test("returns structured deny details", () => {
    const result = checkVaultMemoryScope(
      {
        ...profileBase,
        vaultMemoryScope: { mode: "paths", paths: ["/vault/allowed"] },
      },
      {
        action: "write",
        requestedPath: "/vault/other/spec.md",
        workspacePath: "/vault",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).toMatchObject({
        error: "memory_scope_denied",
        profileId: "agent-main",
        profileName: "Agent Main",
        action: "write",
        requestedPath: "/vault/other/spec.md",
        workspacePath: "/vault",
        allowedScopes: ["path:/vault/allowed"],
      });
    }
  });
});
