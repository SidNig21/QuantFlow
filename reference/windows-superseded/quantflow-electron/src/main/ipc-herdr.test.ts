import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ipc-herdr", () => {
  test("uses socket ops instead of the retired CLI bridge", () => {
    const source = readFileSync(
      join(import.meta.dir, "ipc-herdr.ts"),
      "utf8",
    );
    expect(source).toContain("./herdr-socket-ops");
    expect(source).not.toContain("./herdr-bridge");
    expect(source).toContain("DEBUG ONLY");
  });
});
