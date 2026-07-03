import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  EnvoyService,
  resetEnvoyServiceForTesting,
  setEnvoyCliRunnerForTesting,
} from "./envoy-service";
import {
  _resetObsidianMirrorsForTesting,
  ensureObsidianEnvoyMirror,
  setEnvoyRowSourceForTesting,
} from "./obsidian-envoy-mirror";

afterEach(() => {
  _resetObsidianMirrorsForTesting();
  resetEnvoyServiceForTesting();
});

describe("obsidian envoy mirror", () => {
  test("writes task-board and history under Projects/QuantFlow/Envoy", async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), "qf-vault-"));
    setEnvoyCliRunnerForTesting(async (args) => {
      if (args.includes("task") && args.includes("list")) {
        return { stdout: '{"tasks":[]}', stderr: "", exitCode: 0 };
      }
      if (args.includes("history")) {
        return { stdout: '{"events":[]}', stderr: "", exitCode: 0 };
      }
      if (args.includes("listen")) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "{}", stderr: "", exitCode: 0 };
    });
    new EnvoyService();
    setEnvoyRowSourceForTesting({
      listTasks: () => [],
      listReceipts: () => [],
    });

    await ensureObsidianEnvoyMirror({
      canvasId: "main",
      envoySpaceId: "space-test",
      vaultPath,
    });

    const dir = join(vaultPath, "Projects", "QuantFlow", "Envoy");
    const taskBoard = await readFile(join(dir, "task-board.md"), "utf-8");
    const history = await readFile(join(dir, "history.md"), "utf-8");
    expect(taskBoard).toContain("# Envoy Task Board");
    expect(taskBoard).toContain("space-test");
    expect(taskBoard).toContain("[]");
    expect(history).toContain("# Envoy Space History");
    expect(history).toContain('{"events":[]}');
  });
});
