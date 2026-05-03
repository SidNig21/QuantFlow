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
  previewForTile,
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
    expect(ctx.pinnedFiles).toContain("/vault/note.md");
    await unpinFile("/vault/note.md");
    const ctx2 = await getContext();
    expect(ctx2.pinnedFiles).not.toContain("/vault/note.md");
  });

  test("does not duplicate pinned files", async () => {
    await pinFile("/vault/a.md");
    await pinFile("/vault/a.md");
    const ctx = await getContext();
    expect(ctx.pinnedFiles.filter((p) => p === "/vault/a.md").length).toBe(1);
  });
});

describe("addDecision", () => {
  test("adds a decision with text and timestamp", async () => {
    await addDecision("Use bun instead of node");
    const ctx = await getContext();
    expect(ctx.decisions[0]!.text).toBe("Use bun instead of node");
    expect(typeof ctx.decisions[0]!.ts).toBe("number");
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
    }]);
    expect(preview.decisionsCount).toBe(1);
    expect(preview.injectedChars).toBeGreaterThan(0);
    expect(preview.text).toContain("hello world");
    expect(preview.text).toContain("Use bounded context");
  });

  test("marks oversized files as omitted", async () => {
    await pinFile("/vault/huge.md");

    const preview = await previewForTile(async () => "x".repeat(500), 120);

    expect(preview.files[0]?.omitted).toBe(true);
    expect(preview.files[0]?.includedCharCount).toBe(0);
    expect(preview.injectedChars).toBeLessThanOrEqual(120);
    expect(preview.text).toContain("omitted");
    expect(preview.text).not.toContain("x".repeat(500));
  });

  test("surfaces unreadable files before injection", async () => {
    await pinFile("/vault/missing.md");

    const preview = await previewForTile(async () => {
      throw new Error("missing");
    }, 200);

    expect(preview.files[0]?.ok).toBe(false);
    expect(preview.files[0]?.error).toBe("could not read file");
    expect(preview.text).toContain("could not read file");
  });
});
