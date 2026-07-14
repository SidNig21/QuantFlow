import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "../paths";
import {
  createEmptyProfileRegistry,
  parseProfile,
  parseProfileRegistry,
  type Profile,
  type ProfileKind,
  type ProfileRegistry,
} from "./profile-types";

const PROFILE_FILE_NAME = "profiles.json";

let profilesDir = QUANTFLOW_DIR;
let cachedRegistry: ProfileRegistry | null = null;

export class ProfilesRepoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProfilesRepoError";
    this.code = code;
  }
}

export function _setProfilesDir(dir: string): void {
  profilesDir = dir;
  cachedRegistry = null;
}

export function getProfilesFilePath(): string {
  return join(profilesDir, PROFILE_FILE_NAME);
}

export function createProfileId(kind: ProfileKind): string {
  return `${kind}-${randomUUID()}`;
}

function cloneRegistry(registry: ProfileRegistry): ProfileRegistry {
  return parseProfileRegistry(JSON.parse(JSON.stringify(registry)));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeRegistryFile(registry: ProfileRegistry): Promise<void> {
  await mkdir(profilesDir, { recursive: true });
  const tmpPath = join(profilesDir, `.profiles-${randomUUID()}.tmp`);
  await writeFile(
    tmpPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf-8",
  );
  await rename(tmpPath, getProfilesFilePath());
}

export async function loadProfileRegistry(
  options?: { reload?: boolean },
): Promise<ProfileRegistry> {
  if (cachedRegistry && !options?.reload) {
    return cloneRegistry(cachedRegistry);
  }

  await mkdir(profilesDir, { recursive: true });
  if (!(await exists(getProfilesFilePath()))) {
    const empty = createEmptyProfileRegistry();
    await writeRegistryFile(empty);
    cachedRegistry = empty;
    return cloneRegistry(empty);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(getProfilesFilePath(), "utf-8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProfilesRepoError(
        "invalid_json",
        "profiles.json contains invalid JSON",
      );
    }
    throw error;
  }

  cachedRegistry = parseProfileRegistry(parsed);
  return cloneRegistry(cachedRegistry);
}

export async function saveProfileRegistry(
  registry: ProfileRegistry,
): Promise<ProfileRegistry> {
  const parsed = parseProfileRegistry(registry);
  await writeRegistryFile(parsed);
  cachedRegistry = parsed;
  return cloneRegistry(parsed);
}

export async function listProfiles(): Promise<Profile[]> {
  const registry = await loadProfileRegistry();
  return registry.profiles;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const registry = await loadProfileRegistry();
  return registry.profiles.find((profile) => profile.id === id) ?? null;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const registry = await loadProfileRegistry();
  const parsed = parseProfile(profile);
  const now = new Date().toISOString();
  const existingIndex = registry.profiles.findIndex((entry) =>
    entry.id === parsed.id
  );
  const existing = existingIndex >= 0
    ? registry.profiles[existingIndex]
    : null;
  const nextProfile: Profile = {
    ...parsed,
    createdAt: existing?.createdAt ?? parsed.createdAt,
    updatedAt: now,
  };
  const profiles = [...registry.profiles];
  if (existingIndex >= 0) {
    profiles[existingIndex] = nextProfile;
  } else {
    profiles.push(nextProfile);
  }
  await saveProfileRegistry({
    version: registry.version,
    profiles,
  });
  return parseProfile(nextProfile);
}

export async function deleteProfile(id: string): Promise<boolean> {
  const registry = await loadProfileRegistry();
  const profiles = registry.profiles.filter((profile) => profile.id !== id);
  if (profiles.length === registry.profiles.length) {
    return false;
  }
  await saveProfileRegistry({
    version: registry.version,
    profiles,
  });
  return true;
}

export async function duplicateProfile(
  id: string,
  options?: {
    id?: string;
    name?: string;
    workspaceScope?: string;
  },
): Promise<Profile> {
  const source = await getProfile(id);
  if (!source) {
    throw new ProfilesRepoError("not_found", `Profile ${id} was not found`);
  }
  const now = new Date().toISOString();
  const nextProfile: Profile = {
    ...source,
    id: options?.id ?? createProfileId(source.kind),
    name: options?.name ?? `${source.name} Copy`,
    createdAt: now,
    updatedAt: now,
  };
  if (options?.workspaceScope !== undefined) {
    nextProfile.workspaceScope = options.workspaceScope;
  }
  return saveProfile(nextProfile);
}
