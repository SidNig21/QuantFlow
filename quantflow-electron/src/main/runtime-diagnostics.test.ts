import { describe, expect, test } from "bun:test";
import { buildRuntimeDiagnostics } from "./runtime-diagnostics";

describe("buildRuntimeDiagnostics", () => {
  test("reports missing bun, shell, and role commands with actions", () => {
    const diagnostics = buildRuntimeDiagnostics({
      bunAvailable: false,
      shellCommand: "missing-shell",
      shellAvailable: false,
      roles: [
        {
          id: "codex",
          name: "Codex",
          description: "Codex",
          color: "#fff",
          commandTemplate: "codex",
          commandAvailable: false,
        },
      ],
    });

    expect(diagnostics.map((item) => item.id)).toEqual([
      "missing-bun",
      "missing-shell",
      "missing-role-command:codex",
    ]);
    expect(diagnostics[0]?.actionLabel).toBe("Copy install command");
    expect(diagnostics[1]?.action).toBe("settings");
    expect(diagnostics[2]?.fixCommand).toContain("codex");
  });

  test("returns no diagnostics when runtime checks pass", () => {
    expect(buildRuntimeDiagnostics({
      bunAvailable: true,
      shellCommand: "/bin/bash",
      shellAvailable: true,
      roles: [],
    })).toEqual([]);
  });
});
