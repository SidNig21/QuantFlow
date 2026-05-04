import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { COLLAB_DIR, QUANTFLOW_HOME } from "./paths";

describe("QuantFlow app data paths", () => {
  test("uses a QuantFlow-namespaced home directory in packaged/test builds", () => {
    expect(QUANTFLOW_HOME).toBe(join(homedir(), ".quantflow"));
    expect(COLLAB_DIR).toBe(QUANTFLOW_HOME);
    expect(COLLAB_DIR).not.toContain(".collaborator");
  });
});
