import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CANVAS_SKILL_RELATIVE_PATH,
  readCanvasSkill,
  truncateCanvasSkill,
} from "./workflow-service";

async function makeVaultWithSkill(content: string): Promise<string> {
  const vaultPath = await mkdtemp(join(tmpdir(), "qf-vault-"));
  const skillPath = join(vaultPath, CANVAS_SKILL_RELATIVE_PATH);
  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, content, "utf-8");
  return vaultPath;
}

describe("truncateCanvasSkill", () => {
  test("normalizes CRLF and trims without truncating short text", () => {
    const result = truncateCanvasSkill("# Skill\r\nline two\r\n");
    expect(result).toEqual({ text: "# Skill\nline two", truncated: false });
  });

  test("truncates long text and appends a marker within the limit", () => {
    const result = truncateCanvasSkill("x".repeat(500), 120);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(120);
    expect(result.text).toEndWith("[... truncated — read the full skill file in the vault ...]");
  });
});

describe("readCanvasSkill", () => {
  test("reads the skill file from the vault", async () => {
    const vaultPath = await makeVaultWithSkill("# QuantFlow Canvas Skill\n\nqf_task_list\n");
    const skill = await readCanvasSkill({ vaultPath });
    expect(skill.path).toBe(join(vaultPath, CANVAS_SKILL_RELATIVE_PATH));
    expect(skill.text).toContain("qf_task_list");
    expect(skill.truncated).toBe(false);
  });

  test("throws a readable error when the skill file is missing", async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), "qf-vault-empty-"));
    expect(readCanvasSkill({ vaultPath }))
      .rejects.toThrow("QUANTFLOW_CANVAS_SKILL.md is not readable");
  });

  test("throws when the skill file is blank", async () => {
    const vaultPath = await makeVaultWithSkill("   \n  \n");
    expect(readCanvasSkill({ vaultPath }))
      .rejects.toThrow("is empty");
  });
});
