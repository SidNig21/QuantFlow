import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import electron from "electron";
import { QUANTFLOW_HOME } from "../paths";

export type CredentialName = "OPENROUTER_API_KEY";

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
  if (!storage.isEncryptionAvailable()) return null;
  const encrypted = await storage.readEncrypted(name);
  if (!encrypted) return null;
  const value = storage.decryptString(encrypted).trim();
  return value.length > 0 ? value : null;
}

export async function hasCredential(
  name: CredentialName,
  storage?: CredentialStorage,
): Promise<boolean> {
  return (await getCredential(name, storage)) != null;
}
