import { describe, expect, test } from "bun:test";
import {
  DEFAULT_VAULT_PATH,
  isStaleVaultPath,
  resolveVaultPath,
} from "./vault-paths";

describe("vault-paths", () => {
  test("default is QuantFlow Vault", () => {
    expect(DEFAULT_VAULT_PATH).toBe("C:\\Users\\rybow\\Obsidian\\QuantFlow Vault");
  });

  test("migrates stale Obsidian\\QuantFlow default", () => {
    expect(isStaleVaultPath("C:\\Users\\rybow\\Obsidian\\QuantFlow")).toBe(true);
    expect(resolveVaultPath("C:\\Users\\rybow\\Obsidian\\QuantFlow")).toBe(DEFAULT_VAULT_PATH);
  });

  test("keeps explicit non-stale paths", () => {
    const custom = "D:\\vaults\\custom";
    expect(resolveVaultPath(custom)).toBe(custom);
  });
});
