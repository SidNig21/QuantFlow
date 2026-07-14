import { describe, expect, test } from "bun:test";
import {
  extractPaneReadText,
  isHermesPromptReady,
  waitForWorkflowAgentPrompt,
} from "./workflow-agent-ready";

describe("extractPaneReadText", () => {
  test("reads nested pane.read text", () => {
    expect(extractPaneReadText({
      read: { text: "Welcome to Hermes Agent!\n❯" },
    })).toBe("Welcome to Hermes Agent!\n❯");
  });
});

describe("isHermesPromptReady", () => {
  test("detects the Hermes welcome banner and prompt", () => {
    expect(isHermesPromptReady("Welcome to Hermes Agent! Type your message")).toBe(true);
    expect(isHermesPromptReady("rybowen21@DESKTOP$ hermes")).toBe(false);
  });
});

describe("waitForWorkflowAgentPrompt", () => {
  test("polls until Hermes shows an interactive prompt", async () => {
    let reads = 0;
    const rpc = async (method: string) => {
      if (method !== "pane.read") return {};
      reads += 1;
      if (reads < 3) {
        return { read: { text: "rybowen21@DESKTOP$ hermes" } };
      }
      return { read: { text: "Welcome to Hermes Agent! Type your message or /help.\n❯" } };
    };

    await waitForWorkflowAgentPrompt(rpc, "pane-1", "hermes", {
      timeoutMs: 5000,
      pollMs: 10,
      settleMs: 0,
    });
    expect(reads).toBeGreaterThanOrEqual(3);
  });
});
