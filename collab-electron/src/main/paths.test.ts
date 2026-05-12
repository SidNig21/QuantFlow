import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { QUANTFLOW_DIR, QUANTFLOW_HOME } from "./paths";

describe("QuantFlow app data paths", () => {
  test("uses a QuantFlow-namespaced home directory in packaged/test builds", () => {
    expect(QUANTFLOW_HOME).toBe(join(homedir(), ".quantflow"));
    expect(QUANTFLOW_DIR).toBe(QUANTFLOW_HOME);
    expect(QUANTFLOW_DIR).not.toContain(".collaborator");
  });
});
