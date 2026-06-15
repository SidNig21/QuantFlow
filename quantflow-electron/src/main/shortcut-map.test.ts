import { describe, expect, test } from "bun:test";
import { resolveShellShortcut } from "./shortcut-map";

function input(partial: Record<string, unknown>) {
  return {
    code: "",
    key: "",
    alt: false,
    control: false,
    meta: false,
    shift: false,
    ...partial,
  } as never;
}

describe("main shortcut map", () => {
  test("distinguishes files, tiles, and agent sidebar chords", () => {
    expect(resolveShellShortcut(input({ code: "KeyB", key: "b", control: true }))?.action).toBe("sidebar-files");
    expect(resolveShellShortcut(input({ code: "KeyB", key: "b", control: true, shift: true }))?.action).toBe("sidebar-tiles");
    expect(resolveShellShortcut(input({ code: "KeyB", key: "b", control: true, alt: true }))?.action).toBe("toggle-agent");
  });

  test("does not let shifted base chords shadow their explicit shifted action", () => {
    expect(resolveShellShortcut(input({ code: "KeyF", key: "f", control: true, shift: true }))).toBeUndefined();
    expect(resolveShellShortcut(input({ code: "KeyF", key: "f", shift: true }))?.action).toBe("flip-state-card");
  });

  test("resolves alternate navigator and arrow focus shortcuts", () => {
    expect(resolveShellShortcut(input({ code: "Backslash", key: "\\", control: true }))?.action).toBe("sidebar-files");
    expect(resolveShellShortcut(input({ code: "ArrowLeft", key: "ArrowLeft", alt: true }))?.action).toBe("focus-tile-left");
  });
});
