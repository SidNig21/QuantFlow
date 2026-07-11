import { describe, expect, test } from "bun:test";
import {
  parseTerminalTileLaunchParams,
  shouldEndRestoredAgentOsRun,
} from "./session-start";

describe("parseTerminalTileLaunchParams", () => {
  test("preserves herdr attach targets for ptyCreate", () => {
    expect(parseTerminalTileLaunchParams(
      "?tileId=tile-hermes&cwd=%2Frepo&target=herdr-wsl%3Aterminal-1",
    )).toEqual({
      existingSessionId: undefined,
      isRestored: false,
      isPending: false,
      cwd: "/repo",
      target: "herdr-wsl:terminal-1",
      tileId: "tile-hermes",
    });
  });

  test("parses restored sessions without inventing a target", () => {
    expect(parseTerminalTileLaunchParams(
      "?sessionId=session-1&restored=1&tileId=tile-hermes",
    )).toEqual({
      existingSessionId: "session-1",
      isRestored: true,
      isPending: false,
      cwd: undefined,
      target: undefined,
      tileId: "tile-hermes",
    });
  });

  test("parses pending terminal launches without inventing a target", () => {
    expect(parseTerminalTileLaunchParams(
      "?tileId=tile-hermes&cwd=%2Frepo&pending=1",
    )).toEqual({
      existingSessionId: undefined,
      isRestored: false,
      isPending: true,
      cwd: "/repo",
      target: undefined,
      tileId: "tile-hermes",
    });
  });

  test("ends restored AgentOS runs instead of silently replacing them", () => {
    expect(shouldEndRestoredAgentOsRun(parseTerminalTileLaunchParams(
      "?sessionId=agentos-pty-1&restored=1&target=agentos%3Av2%3Aworkspace%3Atile-1&tileId=tile-1",
    ))).toBe(true);
    expect(shouldEndRestoredAgentOsRun(parseTerminalTileLaunchParams(
      "?sessionId=pty-1&restored=1&target=herdr-wsl%3Aterminal-1&tileId=tile-1",
    ))).toBe(false);
  });
});
