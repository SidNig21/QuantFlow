import { describe, test, expect } from "bun:test";
import {
  formatContextPreviewDetail,
  formatContextPinMenuLabel,
  getCablePortMetadata,
  formatRelaySyntax,
  getTileLabel,
  getTileRoleBadge,
  getTileShellBadge,
  getTileStatusBadge,
  splitFilepath,
  positionTile,
} from "./tile-renderer.js";

// -- splitFilepath --

describe("splitFilepath", () => {
  test("splits a typical absolute path", () => {
    expect(splitFilepath("/Users/me/projects/app/index.ts")).toEqual({
      parent: "/Users/me/projects/app/",
      name: "index.ts",
    });
  });

  test("handles a single filename with no directory", () => {
    expect(splitFilepath("file.txt")).toEqual({
      parent: "",
      name: "file.txt",
    });
  });

  test("handles a path with one directory level", () => {
    expect(splitFilepath("src/file.ts")).toEqual({
      parent: "src/",
      name: "file.ts",
    });
  });

  test("handles trailing slash (directory path)", () => {
    // pop returns "" which is falsy, so fallback to full path as name
    const result = splitFilepath("/Users/me/projects/");
    expect(result.name).toBe("/Users/me/projects/");
    expect(result.parent).toBe("/Users/me/projects/");
  });

  test("handles root path", () => {
    const result = splitFilepath("/");
    expect(result.name).toBe("/");
  });
});

describe("formatContextPreviewDetail", () => {
  test("summarizes included and omitted preview files", () => {
    const detail = formatContextPreviewDetail({
      maxChars: 20_000,
      injectedChars: 1_200,
      decisionsCount: 2,
      files: [
        { path: "/vault/a.md", ok: true, omitted: false },
        { path: "/vault/b.md", ok: true, omitted: true, mode: "summary-header" },
        { path: "/vault/c.md", ok: false, omitted: false, error: "missing" },
      ],
    });

    expect(detail).toContain("3 pinned files, 2 decisions");
    expect(detail).toContain("1200 chars injected of 20000 max");
    expect(detail).toContain("2 files partial, truncated, omitted, or unreadable");
    expect(detail).toContain("included: /vault/a.md");
    expect(detail).toContain("partial (summary-header): /vault/b.md");
    expect(detail).toContain("unreadable: /vault/c.md - missing");
  });

  test("surfaces context truncation and omitted decisions", () => {
    const detail = formatContextPreviewDetail({
      maxChars: 100,
      injectedChars: 100,
      decisionsCount: 4,
      omittedDecisionCount: 2,
      truncated: true,
      files: [
        { path: "/vault/huge.md", ok: true, omitted: true, truncated: true },
      ],
    });

    expect(detail).toContain("context truncated to fit the configured limit");
    expect(detail).toContain("2 decisions omitted or truncated");
    expect(detail).toContain("truncated: /vault/huge.md");
  });

  test("labels pinned file include modes and warning states", () => {
    expect(formatContextPinMenuLabel(
      { path: "/vault/full.md", mode: "full" },
      { path: "/vault/full.md", ok: true, omitted: false },
    )).toBe("Full file - /vault/full.md (ready)");

    expect(formatContextPinMenuLabel(
      { path: "/vault/summary.md", mode: "summary-header" },
      { path: "/vault/summary.md", ok: true, omitted: true },
    )).toBe("Summary header - /vault/summary.md (partial)");

    expect(formatContextPinMenuLabel(
      { path: "/vault/missing.md", mode: "excerpt" },
      { path: "/vault/missing.md", ok: false, error: "missing" },
    )).toBe("Excerpt - /vault/missing.md (unreadable)");
  });
});

describe("formatRelaySyntax", () => {
  test("formats a stable route handle for agent relay", () => {
    expect(formatRelaySyntax("codex-reviewer")).toBe(">>@codex-reviewer: ");
  });

  test("normalizes a handle that already includes @", () => {
    expect(formatRelaySyntax("@claude-worker")).toBe(">>@claude-worker: ");
  });

  test("returns empty string without a handle", () => {
    expect(formatRelaySyntax("   ")).toBe("");
  });
});

describe("getCablePortMetadata", () => {
  test("returns discoverable cable port metadata for terminals", () => {
    expect(getCablePortMetadata({
      type: "term",
      id: "tile-a",
      userTitle: "Reviewer",
    })).toEqual({
      title: "Drag cable to another terminal",
      tooltip: "Drag cable",
      shortcut: "C",
      ariaLabel: "Drag cable from Reviewer to another terminal",
    });
  });

  test("skips non-terminal tiles", () => {
    expect(getCablePortMetadata({ type: "note", id: "tile-a" })).toBeNull();
  });
});

describe("getTileStatusBadge", () => {
  test("returns terminal status badge text", () => {
    expect(getTileStatusBadge({ type: "term", ptyStatus: "blocked" }))
      .toBe("blocked");
    expect(getTileStatusBadge({ type: "term", ptySessionId: "session-a" }))
      .toBe("running");
    expect(getTileStatusBadge({ type: "term" })).toBe("idle");
  });

  test("skips non-terminal tiles", () => {
    expect(getTileStatusBadge({ type: "note" })).toBeNull();
  });
});

describe("getTileRoleBadge", () => {
  test("returns terminal role name before role id", () => {
    expect(getTileRoleBadge({
      type: "term",
      roleId: "codex-reviewer",
      roleName: " Codex Reviewer ",
    })).toBe("Codex Reviewer");
  });

  test("skips terminals without roles and non-terminal tiles", () => {
    expect(getTileRoleBadge({ type: "term", roleId: "   " })).toBeNull();
    expect(getTileRoleBadge({ type: "note", roleId: "planner" })).toBeNull();
  });
});

describe("getTileShellBadge", () => {
  test("returns explicit shell kind before command template", () => {
    expect(getTileShellBadge({
      type: "term",
      roleShellKind: "wsl",
      roleCommandTemplate: "codex",
    })).toBe("wsl");
  });

  test("falls back to command executable", () => {
    expect(getTileShellBadge({
      type: "term",
      roleCommandTemplate: "claude --dangerously-skip-permissions",
    })).toBe("claude");
  });

  test("skips terminals without shell metadata and non-terminal tiles", () => {
    expect(getTileShellBadge({ type: "term" })).toBeNull();
    expect(getTileShellBadge({ type: "note", roleShellKind: "shell" }))
      .toBeNull();
  });
});

// -- getTileLabel --

describe("getTileLabel", () => {
  test("returns cwd basename for term tiles with cwd", () => {
    const label = getTileLabel({
      type: "term", id: "t1", cwd: "/Users/me/projects/collab",
    });
    expect(label.name).toBe("collab");
    expect(label.parent).toBe("/Users/me/projects/");
  });

  test("returns 'Terminal' for term tiles without session info", () => {
    const label = getTileLabel({ type: "term", id: "t1" });
    expect(label.name).toBe("Terminal");
    expect(label.parent).toBe("");
  });

  test("userTitle wins over autoTitle and cwd", () => {
    const label = getTileLabel({
      type: "term", id: "t1",
      userTitle: "My Server",
      autoTitle: "/Users/me/projects/app",
      cwd: "/Users/me/projects/app",
    });
    expect(label.name).toBe("My Server");
    expect(label.parent).toBe("");
  });

  test("returns autoTitle split when no userTitle", () => {
    const label = getTileLabel({
      type: "term", id: "t1",
      autoTitle: "/Users/me/projects/app",
    });
    expect(label.name).toBe("app");
    expect(label.parent).toBe("/Users/me/projects/");
  });

  test("falls back to cwd when no userTitle or autoTitle", () => {
    const label = getTileLabel({
      type: "term", id: "t1",
      cwd: "/Users/me/projects/fallback",
    });
    expect(label.name).toBe("fallback");
    expect(label.parent).toBe("/Users/me/projects/");
  });

  test("empty userTitle falls through to autoTitle", () => {
    const label = getTileLabel({
      type: "term", id: "t1",
      userTitle: "",
      autoTitle: "/Users/me/projects/app",
    });
    expect(label.name).toBe("app");
    expect(label.parent).toBe("/Users/me/projects/");
  });

  test("returns hostname for browser tiles with URL", () => {
    const label = getTileLabel({
      type: "browser", id: "t1",
      url: "https://example.com/page",
    });
    expect(label.name).toBe("example.com");
  });

  test("returns raw URL for browser tiles with invalid URL", () => {
    const label = getTileLabel({
      type: "browser", id: "t1",
      url: "not-a-url",
    });
    expect(label.name).toBe("not-a-url");
  });

  test("returns 'Browser' for browser tiles without URL", () => {
    const label = getTileLabel({ type: "browser", id: "t1" });
    expect(label.name).toBe("Browser");
  });

  test("returns folder name for graph tiles with folderPath", () => {
    const label = getTileLabel({
      type: "graph", id: "t1",
      folderPath: "/Users/me/projects/myapp",
    });
    expect(label.name).toBe("myapp");
    expect(label.parent).toBe("/Users/me/projects/");
  });

  test("returns 'Graph' for graph tiles without folderPath", () => {
    const label = getTileLabel({ type: "graph", id: "t1" });
    expect(label.name).toBe("Graph");
  });

  test("returns filename for file-based tiles", () => {
    const label = getTileLabel({
      type: "note", id: "t1",
      filePath: "/Users/me/docs/readme.md",
    });
    expect(label.name).toBe("readme.md");
    expect(label.parent).toBe("/Users/me/docs/");
  });

  test("returns tile type for tiles without filePath", () => {
    const label = getTileLabel({ type: "code", id: "t1" });
    expect(label.name).toBe("code");
  });

  test("returns filename for image tiles", () => {
    const label = getTileLabel({
      type: "image", id: "t1",
      filePath: "/photos/cat.png",
    });
    expect(label.name).toBe("cat.png");
    expect(label.parent).toBe("/photos/");
  });
});

// -- positionTile --

describe("positionTile", () => {
  function mockContainer() {
    const style: Record<string, string> = {};
    return { style };
  }

  test("sets position from tile coords + pan offset", () => {
    const container = mockContainer();
    const tile = { x: 100, y: 200, width: 400, height: 500, zIndex: 5 };
    positionTile(container, tile, 50, 30, 1);
    expect(container.style.left).toBe("150px");
    expect(container.style.top).toBe("230px");
  });

  test("applies zoom to screen position", () => {
    const container = mockContainer();
    const tile = { x: 100, y: 200, width: 400, height: 500, zIndex: 1 };
    positionTile(container, tile, 0, 0, 0.5);
    // screen x = 100 * 0.5 + 0 = 50
    // screen y = 200 * 0.5 + 0 = 100
    expect(container.style.left).toBe("50px");
    expect(container.style.top).toBe("100px");
    expect(container.style.transform).toBe("scale(0.5)");
  });

  test("sets width, height, and zIndex", () => {
    const container = mockContainer();
    const tile = { x: 0, y: 0, width: 400, height: 500, zIndex: 7 };
    positionTile(container, tile, 0, 0, 1);
    expect(container.style.width).toBe("400px");
    expect(container.style.height).toBe("500px");
    expect(container.style.zIndex).toBe("7");
  });

  test("sets transformOrigin to top left", () => {
    const container = mockContainer();
    const tile = { x: 0, y: 0, width: 100, height: 100, zIndex: 1 };
    positionTile(container, tile, 0, 0, 1);
    expect(container.style.transformOrigin).toBe("top left");
  });

  test("handles negative pan offset", () => {
    const container = mockContainer();
    const tile = { x: 100, y: 100, width: 100, height: 100, zIndex: 1 };
    positionTile(container, tile, -50, -50, 1);
    expect(container.style.left).toBe("50px");
    expect(container.style.top).toBe("50px");
  });

  test("handles negative tile coordinates", () => {
    const container = mockContainer();
    const tile = { x: -100, y: -200, width: 100, height: 100, zIndex: 1 };
    positionTile(container, tile, 500, 400, 1);
    expect(container.style.left).toBe("400px");
    expect(container.style.top).toBe("200px");
  });

  test("zoom and pan combine correctly", () => {
    const container = mockContainer();
    const tile = { x: 200, y: 300, width: 100, height: 100, zIndex: 1 };
    positionTile(container, tile, 10, 20, 0.75);
    // screen x = 200 * 0.75 + 10 = 160
    // screen y = 300 * 0.75 + 20 = 245
    expect(container.style.left).toBe("160px");
    expect(container.style.top).toBe("245px");
  });
});
