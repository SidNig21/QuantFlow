import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _setProfilesDir,
  deleteProfile,
  duplicateProfile,
  getProfile,
  getProfilesFilePath,
  listProfiles,
  loadProfileRegistry,
  ProfilesRepoError,
  saveProfile,
  saveProfileRegistry,
} from "./profiles-repo";
import { ProfileValidationError, type AgentProfile } from "./profile-types";

const TEST_ROOT = join(tmpdir(), `quantflow-profiles-${Date.now()}`);
const NOW = "2026-05-15T12:00:00.000Z";

function profile(id = "agent-main", name = "Agent Main"): AgentProfile {
  return {
    id,
    kind: "agent",
    name,
    tags: ["goal3"],
    workspaceScope: "/workspace",
    permissions: {
      network: "inherit",
      filesystem: "workspace-write",
      interactive: true,
    },
    env: [],
    vaultMemoryScope: { mode: "workspace" },
    createdAt: NOW,
    updatedAt: NOW,
    runtime: "codex-cli",
    command: {
      command: "codex",
      args: [],
    },
    capabilities: ["code"],
  };
}

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  _setProfilesDir(TEST_ROOT);
});

describe("profiles repository", () => {
  test("creates profiles.json with an empty v1 registry on first load", async () => {
    const registry = await loadProfileRegistry({ reload: true });

    expect(registry).toEqual({ version: 1, profiles: [] });
    expect(existsSync(getProfilesFilePath())).toBe(true);
    expect(JSON.parse(await readFile(getProfilesFilePath(), "utf-8"))).toEqual(
      registry,
    );
  });

  test("saves and reloads a registry", async () => {
    await saveProfileRegistry({
      version: 1,
      profiles: [profile()],
    });

    const loaded = await loadProfileRegistry({ reload: true });
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0]?.id).toBe("agent-main");
  });

  test("lists, gets, updates, and deletes profiles", async () => {
    await saveProfile(profile());

    expect(await listProfiles()).toHaveLength(1);
    expect((await getProfile("agent-main"))?.name).toBe("Agent Main");

    const updated = await saveProfile({
      ...profile(),
      name: "Agent Renamed",
    });
    expect(updated.name).toBe("Agent Renamed");
    expect(updated.createdAt).toBe(NOW);
    expect(updated.updatedAt).not.toBe(NOW);

    expect(await deleteProfile("agent-main")).toBe(true);
    expect(await deleteProfile("agent-main")).toBe(false);
    expect(await listProfiles()).toEqual([]);
  });

  test("duplicates profiles with new identity", async () => {
    await saveProfile(profile());

    const copy = await duplicateProfile("agent-main", {
      id: "agent-copy",
      name: "Agent Copy",
    });

    expect(copy.id).toBe("agent-copy");
    expect(copy.name).toBe("Agent Copy");
    expect(await listProfiles()).toHaveLength(2);
  });

  test("rejects duplicate names inside one workspace scope", async () => {
    await saveProfileRegistry({
      version: 1,
      profiles: [
        profile("agent-a", "Shared Name"),
        profile("agent-b", "shared name"),
      ],
    }).catch((error) => {
      expect(error).toBeInstanceOf(ProfileValidationError);
      expect(error.issues.map((issue: { code: string }) => issue.code))
        .toContain("duplicate_name");
    });
  });

  test("throws a repo error for malformed profile JSON", async () => {
    await writeFile(getProfilesFilePath(), "{", "utf-8");

    await expect(loadProfileRegistry({ reload: true })).rejects.toThrow(
      ProfilesRepoError,
    );
  });
});
