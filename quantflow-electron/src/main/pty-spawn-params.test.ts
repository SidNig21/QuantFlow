import { describe, expect, test } from "bun:test";
import {
  buildHerdrAttachSessionCreateParams,
  buildHerdrDisplayTarget,
  buildSidecarSessionCreateParams,
  parseHerdrAttachTarget,
} from "./pty-spawn-params";

describe("buildSidecarSessionCreateParams", () => {
  test("builds a PowerShell sidecar spawn request", () => {
    const params = buildSidecarSessionCreateParams({
      target: "powershell",
      command: "powershell.exe",
      args: [],
      displayName: "PowerShell",
      cwd: "C:\\Users\\rybow\\QuantFlow",
      cwdHostPath: "C:\\Users\\rybow\\QuantFlow",
    }, 120, 32, { LANG: "en_US.UTF-8" });

    expect(params).toEqual({
      command: "powershell.exe",
      args: [],
      shell: "powershell.exe",
      displayName: "PowerShell",
      target: "powershell",
      cwd: "C:\\Users\\rybow\\QuantFlow",
      cwdHostPath: "C:\\Users\\rybow\\QuantFlow",
      cols: 120,
      rows: 32,
      env: { LANG: "en_US.UTF-8" },
    });
  });

  test("builds a WSL sidecar spawn request with guest cwd", () => {
    const params = buildSidecarSessionCreateParams({
      target: "wsl:Ubuntu",
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--cd", "/mnt/c/Users/rybow/QuantFlow"],
      displayName: "Ubuntu",
      cwd: "C:\\Users\\rybow",
      cwdHostPath: "C:\\Users\\rybow\\QuantFlow",
      cwdGuestPath: "/mnt/c/Users/rybow/QuantFlow",
    }, 100, 28, { LANG: "en_US.UTF-8" });

    expect(params).toEqual({
      command: "wsl.exe",
      args: ["-d", "Ubuntu", "--cd", "/mnt/c/Users/rybow/QuantFlow"],
      shell: "wsl.exe",
      displayName: "Ubuntu",
      target: "wsl:Ubuntu",
      cwd: "C:\\Users\\rybow",
      cwdHostPath: "C:\\Users\\rybow\\QuantFlow",
      cwdGuestPath: "/mnt/c/Users/rybow/QuantFlow",
      cols: 100,
      rows: 28,
      env: { LANG: "en_US.UTF-8" },
    });
  });
});

describe("herdr attach target helpers", () => {
  test("round-trips a herdr terminal attach target", () => {
    const target = buildHerdrDisplayTarget("terminal/with spaces");

    expect(target).toBe("herdr-wsl:terminal%2Fwith%20spaces");
    expect(parseHerdrAttachTarget(target)).toEqual({
      terminalId: "terminal/with spaces",
    });
  });

  test("rejects non-herdr display targets", () => {
    expect(parseHerdrAttachTarget("powershell")).toBeNull();
    expect(parseHerdrAttachTarget("herdr-wsl:")).toBeNull();
    expect(parseHerdrAttachTarget(undefined)).toBeNull();
  });

  test("builds a Linux/WSL herdr attach sidecar request", () => {
    const params = buildHerdrAttachSessionCreateParams(
      "terminal-1",
      "/repo",
      100,
      30,
      { LANG: "en_US.UTF-8" },
      "linux",
    );

    expect(params).toMatchObject({
      command: "bash",
      shell: "bash",
      displayName: "herdr terminal attach",
      target: "herdr-wsl:terminal-1",
      cwd: "/repo",
      cwdHostPath: "/repo",
      cols: 100,
      rows: 30,
      env: { LANG: "en_US.UTF-8" },
    });
    expect(params.args).toEqual([
      "-lc",
      "exec herdr terminal attach 'terminal-1'",
    ]);
  });

  test("builds a Windows WSL herdr attach sidecar request", () => {
    expect(buildHerdrAttachSessionCreateParams(
      "terminal-1",
      "C:\\Users\\rybow\\QuantFlow",
      120,
      40,
      { LANG: "en_US.UTF-8" },
      "win32",
    )).toMatchObject({
      command: "wsl.exe",
      args: [
        "-e",
        "bash",
        "-lc",
        "exec herdr terminal attach 'terminal-1'",
      ],
      target: "herdr-wsl:terminal-1",
      cwdHostPath: "C:\\Users\\rybow\\QuantFlow",
    });
  });
});
