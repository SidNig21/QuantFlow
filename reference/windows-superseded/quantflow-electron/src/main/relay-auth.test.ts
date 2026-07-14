import { describe, expect, test } from "bun:test";
import {
  extractRelayToken,
  generateRelayToken,
  stripRelayToken,
} from "./relay-auth";

describe("relay-auth", () => {
  test("extractRelayToken reads token from params object", () => {
    expect(extractRelayToken({ token: "abc", other: 1 })).toBe("abc");
    expect(extractRelayToken({ other: 1 })).toBeNull();
    expect(extractRelayToken(null)).toBeNull();
  });

  test("stripRelayToken removes token without mutating input", () => {
    const params = { token: "secret", value: "keep" };
    expect(stripRelayToken(params)).toEqual({ value: "keep" });
    expect(params.token).toBe("secret");
  });

  test("generateRelayToken returns a non-empty string", () => {
    const token = generateRelayToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });
});
