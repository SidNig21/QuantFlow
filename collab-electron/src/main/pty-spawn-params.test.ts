import { describe, expect, test } from "bun:test";
import { buildSidecarSessionCreateParams } from "./pty-spawn-params";

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
