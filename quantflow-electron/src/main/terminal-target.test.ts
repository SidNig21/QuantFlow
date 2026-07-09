import { describe, expect, test } from "bun:test";
import { listTerminalTargets, resolveTerminalTarget } from "./terminal-target";

describe("terminal-target", () => {
  test("Windows terminal target listing is passive by default", () => {
    const previous = process.env.QF_DISCOVER_WSL_DISTROS;
    try {
      delete process.env.QF_DISCOVER_WSL_DISTROS;
      const options = listTerminalTargets();
      if (process.platform === "win32") {
        expect(options.map((option) => option.id)).toEqual(["auto", "powershell"]);
      }
    } finally {
      if (previous == null) delete process.env.QF_DISCOVER_WSL_DISTROS;
      else process.env.QF_DISCOVER_WSL_DISTROS = previous;
    }
  });

  test("Windows auto target resolves without WSL discovery by default", () => {
    const previous = process.env.QF_DISCOVER_WSL_DISTROS;
    try {
      delete process.env.QF_DISCOVER_WSL_DISTROS;
      const resolved = resolveTerminalTarget("auto");
      if (process.platform === "win32") {
        expect(resolved.target).toBe("powershell");
        expect(resolved.command).toMatch(/powershell|pwsh/i);
      }
    } finally {
      if (previous == null) delete process.env.QF_DISCOVER_WSL_DISTROS;
      else process.env.QF_DISCOVER_WSL_DISTROS = previous;
    }
  });
});
