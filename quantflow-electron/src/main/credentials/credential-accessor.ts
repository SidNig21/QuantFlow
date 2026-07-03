import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import electron from "electron";
import {
  getCredential as getEnvCredential,
  type KnownCredentialName,
} from "../../../../src/vault/credentials";
import { QUANTFLOW_HOME } from "../paths";

export type CredentialName = KnownCredentialName;

export interface CredentialStorage {
  isEncryptionAvailable: () => boolean;
  readEncrypted: (name: CredentialName) => Promise<Buffer | null>;
  decryptString: (encrypted: Buffer) => string;
}

const CREDENTIAL_DIR = join(QUANTFLOW_HOME, "credentials");

function fileName(name: CredentialName): string {
  return join(CREDENTIAL_DIR, `${name}.safe`);
}

export function createSafeStorageCredentialStorage(): CredentialStorage {
  return {
    isEncryptionAvailable: () =>
      electron.safeStorage?.isEncryptionAvailable?.() === true,
    readEncrypted: async (name) => {
      await mkdir(CREDENTIAL_DIR, { recursive: true });
      try {
        return await readFile(fileName(name));
      } catch {
        return null;
      }
    },
    decryptString: (encrypted) => electron.safeStorage.decryptString(encrypted),
  };
}

export async function getCredential(
  name: CredentialName,
  storage: CredentialStorage = createSafeStorageCredentialStorage(),
): Promise<string | null> {
  if (storage.isEncryptionAvailable()) {
    const encrypted = await storage.readEncrypted(name);
    if (encrypted) {
      const value = storage.decryptString(encrypted).trim();
      if (value.length > 0) return value;
    }
  }
  return getEnvCredential(name) ?? null;
}

export async function hasCredential(
  name: CredentialName,
  storage?: CredentialStorage,
): Promise<boolean> {
  return (await getCredential(name, storage)) != null;
}
