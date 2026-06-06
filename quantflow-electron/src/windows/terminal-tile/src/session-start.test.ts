import { describe, expect, test } from "bun:test";
import { parseTerminalTileLaunchParams } from "./session-start";

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
});
