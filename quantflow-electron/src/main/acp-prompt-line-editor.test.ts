import { describe, expect, test } from "bun:test";
import { createAcpPromptLineEditor, isAcpPromptSoftware } from "./acp-prompt-line-editor";

describe("acp-prompt-line-editor", () => {
  test("echoes characters and submits trimmed lines", () => {
    const echoed: string[] = [];
    const submitted: string[] = [];
    const editor = createAcpPromptLineEditor({
      onEcho: (text) => echoed.push(text),
      onSubmit: (line) => submitted.push(line),
    });
    editor.handleInput("hello\r");
    expect(echoed.join("")).toBe("hello\r\n");
    expect(submitted).toEqual(["hello"]);
  });

  test("recognizes ACP prompt software ids", () => {
    expect(isAcpPromptSoftware("pi")).toBe(true);
    expect(isAcpPromptSoftware("claude-code")).toBe(true);
    expect(isAcpPromptSoftware("bash")).toBe(false);
  });
});
