import { join } from "path";

const AGENTOS_HOST_DIR = join(import.meta.dir, "..", "..", "tools", "agentos-host");

export async function runAgentosToolkitEnvelopeCheck(): Promise<boolean> {
  const result = Bun.spawnSync(["bun", "run", "toolkit-envelope-probe.mjs"], {
    cwd: AGENTOS_HOST_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode === 0) {
    console.log(
      "agentos-toolkit-envelope: PASS (native actor still rejects toolKits — Eve HTTP bridge remains the path)",
    );
    return true;
  }

  if (result.exitCode === 1) {
    console.error(
      "agentos-toolkit-envelope: FAIL — native envelope now ACCEPTS toolKits; mount buildCableKit/buildDelegateKit per docs/plans/2026-07-12-002…",
    );
  }

  return false;
}
