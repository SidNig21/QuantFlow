import { describe, expect, test } from "bun:test";
import { normalizeHerdrSpawnInput } from "./herdr-spawn-input";

describe("normalizeHerdrSpawnInput", () => {
  test("trims required and optional herdr spawn fields", () => {
    expect(normalizeHerdrSpawnInput({
      tileId: " tile-hermes ",
      roleId: " hermes ",
      roleName: " Hermes ",
      cwd: " /repo ",
      commandTemplate: " hermes ",
      startupPrompt: " Coordinate the canvas. ",
      canvasId: " canvas-1 ",
      workspaceId: " QuantFlow V2 ",
    })).toEqual({
      tileId: "tile-hermes",
      roleId: "hermes",
      roleName: "Hermes",
      cwd: "/repo",
      commandTemplate: "hermes",
      startupPrompt: "Coordinate the canvas.",
      canvasId: "canvas-1",
      workspaceId: "QuantFlow V2",
    });
  });

  test("drops blank optional fields", () => {
    expect(normalizeHerdrSpawnInput({
      tileId: "tile-hermes",
      roleId: "hermes",
      roleName: "Hermes",
      cwd: " ",
      commandTemplate: "",
      startupPrompt: null,
      canvasId: undefined,
      workspaceId: 42,
    })).toEqual({
      tileId: "tile-hermes",
      roleId: "hermes",
      roleName: "Hermes",
      cwd: undefined,
      commandTemplate: undefined,
      startupPrompt: undefined,
      canvasId: undefined,
      workspaceId: undefined,
    });
  });

  test("rejects missing required identity fields", () => {
    expect(() => normalizeHerdrSpawnInput(null))
      .toThrow("herdr:spawn-role requires tileId");
    expect(() => normalizeHerdrSpawnInput({
      tileId: "tile-hermes",
      roleName: "Hermes",
    })).toThrow("herdr:spawn-role requires roleId");
    expect(() => normalizeHerdrSpawnInput({
      tileId: "tile-hermes",
      roleId: "hermes",
    })).toThrow("herdr:spawn-role requires roleName");
  });
});
