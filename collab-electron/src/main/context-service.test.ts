import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync, mkdirSync } from "node:fs";

import {
  _setCtxDir,
  getContext,
  pinFile,
  unpinFile,
  addDecision,
  composeForTile,
  composeForVaultTile,
  pinVaultFile,
  previewForTile,
  previewForVaultTile,
  resolveVaultPinnedPath,
  setPinnedFileMode,
  toVaultRelativePath,
} from "./context-service";

const TEST_DIR = join(tmpdir(), `ctx-test-${Date.now()}`);

beforeEach(() => {
  try { rmSync(TEST_DIR, { recursive: true }); } catch { /* noop */ }
  mkdirSync(TEST_DIR, { recursive: true });
  _setCtxDir(TEST_DIR);
});

describe("getContext", () => {
  test("returns empty context when no file", async () => {
    const ctx = await getContext();
    expect(ctx.pinnedFiles).toEqual([]);
    expect(ctx.decisions).toEqual([]);
  });
});

describe("pinFile / unpinFile", () => {
  test("pins and unpins a file", async () => {
    await pinFile("/vault/note.md");
    const ctx = await getContext();
    expect(ctx.pinnedFiles.map((pin) => pin.path)).toContain("/vault/note.md");
    await unpinFile("/vault/note.md");
    const ctx2 = await getContext();
    expect(ctx2.pinnedFiles.map((pin) => pin.path)).not.toContain("/vault/note.md");
  });

  test("does not duplicate pinned files", async () => {
    await pinFile("/vault/a.md");
    await pinFile("/vault/a.md");
    const ctx = await getContext();
    expect(ctx.pinnedFiles.filter((pin) => pin.path === "/vault/a.md").length).toBe(1);
  });
});

describe("vault-relative context pins", () => {
  test("normalizes vault files to relative paths", async () => {
    expect(toVaultRelativePath("/vault/specs/a.md", "/vault")).toBe("specs/a.md");
  });

  test("rejects files outside the vault", () => {
    expect(() => toVaultRelativePath("/other/a.md", "/vault")).toThrow(
      "Path is outside vault directory",
    );
  });

  test("pins vault files as relative paths", async () => {
    await pinVaultFile("/vault/specs/a.md", "/vault");

    const ctx = await getContext();
    expect(ctx.pinnedFiles).toEqual([{ path: "specs/a.md", mode: "full" }]);
  });

  test("resolves relative pins under the vault", () => {
    expect(resolveVaultPinnedPath("specs/a.md", "/vault")).toBe("/vault/specs/a.md");
  });

  test("rejects relative traversal pins during preview resolution", () => {
    expect(() => resolveVaultPinnedPath("../outside.md", "/vault")).toThrow(
      "Path is outside vault directory",
    );
  });
});

describe("addDecision", () => {
  test("adds a decision with text and timestamp", async () => {
    await addDecision("Use bun instead of node");
    const ctx = await getContext();
    expect(ctx.decisions[0]!.text).toBe("Use bun instead of node");
    expect(typeof ctx.decisions[0]!.ts).toBe("number");
    expect(typeof ctx.decisions[0]!.timestamp).toBe("number");
    expect(ctx.decisions[0]!.author).toBe("user");
  });

  test("adds decision metadata", async () => {
    await addDecision("Use bounded context", {
      author: "codex",
      source: "cable",
      linkedFile: "spec.md",
      cableId: "conn-ab",
    });
    const ctx = await getContext();
    expect(ctx.decisions[0]).toMatchObject({
      text: "Use bounded context",
      author: "codex",
      source: "cable",
      linkedFile: "spec.md",
      cableId: "conn-ab",
    });
  });

  test("includes decision metadata in composed preview text", async () => {
    await addDecision("Use bounded context", {
      author: "codex",
      source: "cable",
      linkedFile: "spec.md",
      cableId: "conn-ab",
    });

    const preview = await previewForTile(undefined, 500);

    expect(preview.text).toContain("codex source=cable file=spec.md cable=conn-ab");
    expect(preview.text).toContain("Use bounded context");
  });

  test("caps at 50 decisions", async () => {
    for (let i = 0; i < 55; i++) {
      await addDecision(`decision ${i}`);
    }
    const ctx = await getContext();
    expect(ctx.decisions.length).toBe(50);
    expect(ctx.decisions[0]!.text).toBe("decision 5");
  });
});

describe("composeForTile", () => {
  test("includes pinned file path in output", async () => {
    await pinFile("/vault/spec.md");
    const text = await composeForTile();
    expect(text).toContain("/vault/spec.md");
  });

  test("includes decision text in output", async () => {
    await addDecision("Ship on Friday");
    const text = await composeForTile();
    expect(text).toContain("Ship on Friday");
  });

  test("returns empty string when context is empty", async () => {
    const text = await composeForTile();
    expect(text.trim()).toBe("");
  });
});

describe("previewForTile", () => {
  test("shows included files and injected size before injection", async () => {
    await pinFile("/vault/spec.md");
    await addDecision("Use bounded context");

    const preview = await previewForTile(async () => "hello world", 200);

    expect(preview.files).toEqual([{
      path: "/vault/spec.md",
      ok: true,
      charCount: 11,
      includedCharCount: 11,
      omitted: false,
      truncated: false,
      mode: "full",
    }]);
    expect(preview.decisionsCount).toBe(1);
    expect(preview.injectedChars).toBeGreaterThan(0);
    expect(preview.text).toContain("hello world");
    expect(preview.text).toContain("Use bounded context");
  });

  test("truncates oversized files with a visible indicator", async () => {
    await pinFile("/vault/huge.md");

    const preview = await previewForTile(async () => "x".repeat(500), 120);

    expect(preview.files[0]?.omitted).toBe(true);
    expect(preview.files[0]?.truncated).toBe(true);
    expect(preview.files[0]?.includedCharCount).toBeGreaterThan(0);
    expect(preview.truncated).toBe(true);
    expect(preview.injectedChars).toBeLessThanOrEqual(120);
    expect(preview.text).toContain("[truncated:");
    expect(preview.text).not.toContain("x".repeat(500));
  });

  test("surfaces unreadable files before injection", async () => {
    await pinFile("/vault/missing.md");

    const preview = await previewForTile(async () => {
      throw new Error("missing");
    }, 200);

    expect(preview.files[0]?.ok).toBe(false);
    expect(preview.files[0]?.error).toBe("missing");
    expect(preview.text).toContain("warning: missing");
  });

  test("supports per-file include modes", async () => {
    await pinFile("/vault/full.md");
    await pinFile("/vault/summary.md");
    await pinFile("/vault/excerpt.md");
    await setPinnedFileMode("/vault/summary.md", "summary-header");
    await setPinnedFileMode("/vault/excerpt.md", "excerpt", "selected excerpt");

    const preview = await previewForTile(async (p) => `${p} content body`, 1_000);

    expect(preview.files.map((file) => [file.path, file.mode])).toEqual([
      ["/vault/full.md", "full"],
      ["/vault/summary.md", "summary-header"],
      ["/vault/excerpt.md", "excerpt"],
    ]);
    expect(preview.text).toContain("/vault/full.md content body");
    expect(preview.text).toContain("summary-header-only");
    expect(preview.text).toContain("selected excerpt");
    expect(preview.text).not.toContain("/vault/excerpt.md content body");
  });

  test("truncates decisions within the configured context limit", async () => {
    await addDecision("x".repeat(500));

    const preview = await previewForTile(undefined, 80);

    expect(preview.truncated).toBe(true);
    expect(preview.omittedDecisionCount).toBe(1);
    expect(preview.injectedChars).toBeLessThanOrEqual(80);
    expect(preview.text).toContain("[truncated decisions]");
  });
});

describe("vault-relative preview and compose", () => {
  test("resolves pinned relative files under the vault root", async () => {
    await pinFile("specs/a.md");
    const reads: string[] = [];

    const preview = await previewForVaultTile("/vault", async (p) => {
      reads.push(p);
      return "vault file";
    }, 300);

    expect(reads).toEqual(["/vault/specs/a.md"]);
    expect(preview.text).toContain("vault file");

    const text = await composeForVaultTile("/vault", async (p) => {
      reads.push(p);
      return "again";
    }, 300);
    expect(text).toContain("again");
  });

  test("surfaces outside-vault pins as preview warnings", async () => {
    await pinFile("../outside.md");

    const preview = await previewForVaultTile("/vault", async () => "nope", 300);

    expect(preview.files[0]?.ok).toBe(false);
    expect(preview.files[0]?.error).toBe("Path is outside vault directory");
    expect(preview.text).toContain("Path is outside vault directory");
  });
});
