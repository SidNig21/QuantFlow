import { describe, expect, test } from "bun:test";
import {
  getCredential,
  hasCredential,
  type CredentialStorage,
} from "./credential-accessor";

function storage(options: {
  available?: boolean;
  value?: string | null;
}): CredentialStorage {
  return {
    isEncryptionAvailable: () => options.available ?? true,
    readEncrypted: async () =>
      options.value == null ? null : Buffer.from(options.value, "utf-8"),
    decryptString: (encrypted) => encrypted.toString("utf-8"),
  };
}

describe("credential accessor", () => {
  test("returns a trimmed decrypted credential from injected storage", async () => {
    await expect(getCredential(
      "OPENROUTER_API_KEY",
      storage({ value: "  sk-or-test  " }),
    )).resolves.toBe("sk-or-test");
  });

  test("hasCredential is false when storage has no key", async () => {
    await expect(hasCredential(
      "OPENROUTER_API_KEY",
      storage({ value: null }),
    )).resolves.toBe(false);
  });

  test('falls back to env when safeStorage is unavailable', async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'env-fallback-key';
    try {
      await expect(getCredential(
        "OPENROUTER_API_KEY",
        storage({ available: false, value: null }),
      )).resolves.toBe("env-fallback-key");
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });

  test('returns null when storage and env both absent', async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(getCredential(
        "OPENROUTER_API_KEY",
        storage({ available: false, value: null }),
      )).resolves.toBeNull();
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});
