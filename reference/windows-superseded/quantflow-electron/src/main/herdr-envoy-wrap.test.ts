import { describe, expect, test } from "bun:test";
import { buildEnvoyWrappedCommand } from "./herdr-envoy-wrap";

describe("herdr envoy wrap", () => {
  test("wraps command with envoy-run and profile env vars", () => {
    const wrapped = buildEnvoyWrappedCommand({
      command: "python train.py",
      envoySpaceId: "space-1",
      envoyProfile: "python-script",
    });
    expect(wrapped).toContain("ENVOY_SPACE='space-1'");
    expect(wrapped).toContain("ENVOY_PROFILE='python-script'");
    expect(wrapped).toContain("bash /mnt/c/Users/rybow/QuantFlow/quantflow-electron/scripts/envoy-run.sh");
    expect(wrapped).toContain("bash -lc 'python train.py'");
  });
});
