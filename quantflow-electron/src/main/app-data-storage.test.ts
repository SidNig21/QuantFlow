import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_ROOT = join(tmpdir(), `quantflow-app-data-${Date.now()}`);
const APP_DATA_DIR = join(TEST_ROOT, ".quantflow");

const { _setCanvasStateDir, saveState } = await import("./canvas-persistence");
const { _setRolesDir, listRoles } = await import("./role-service");
const { _setCtxDir, pinFile } = await import("./context-service");
const { _setSessionDir, writeSessionMeta } = await import("./tmux");
const { _setProfilesDir, loadProfileRegistry } = await import("./profiles/profiles-repo");

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(APP_DATA_DIR, { recursive: true });
  _setCanvasStateDir(APP_DATA_DIR);
  _setRolesDir(join(APP_DATA_DIR, "roles"));
  _setCtxDir(APP_DATA_DIR);
  _setSessionDir(join(APP_DATA_DIR, "terminal-sessions"));
  _setProfilesDir(APP_DATA_DIR);
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("QuantFlow app-data storage", () => {
  test("writes canvas state under QuantFlow app data", async () => {
    await saveState({
      version: 1,
      tiles: [],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });

    expect(existsSync(join(APP_DATA_DIR, "canvas-state.json"))).toBe(true);
  });

  test("creates the roles directory under QuantFlow app data", async () => {
    await listRoles();

    expect(existsSync(join(APP_DATA_DIR, "roles"))).toBe(true);
  });

  test("writes shared context under QuantFlow app data", async () => {
    await pinFile("/vault/spec.md");

    const contextPath = join(APP_DATA_DIR, "context.json");
    expect(existsSync(contextPath)).toBe(true);
    const saved = JSON.parse(await readFile(contextPath, "utf-8"));
    expect(saved.pinnedFiles).toEqual([
      { path: "/vault/spec.md", mode: "full" },
    ]);
  });

  test("writes terminal session metadata under QuantFlow app data", () => {
    writeSessionMeta("session-a", {
      shell: "powershell.exe",
      cwd: "C:\\Users\\rybow\\QuantFlow",
      createdAt: "2026-05-03T00:00:00.000Z",
      target: "powershell",
      backend: "sidecar",
    });

    expect(existsSync(join(
      APP_DATA_DIR,
      "terminal-sessions",
      "session-a.json",
    ))).toBe(true);
  });

  test("creates profiles registry under QuantFlow app data", async () => {
    const registry = await loadProfileRegistry({ reload: true });

    expect(registry).toEqual({ version: 1, profiles: [] });
    expect(existsSync(join(APP_DATA_DIR, "profiles.json"))).toBe(true);
  });
});
