import { describe, expect, test } from "bun:test";
import {
  CLAUDE_NATIVE_TUI_ADAPTER,
  isNativeTuiAdapter,
  isServerClassifiedAdapter,
  resolveRoleLaunchFields,
} from "./agent-adapter";
// getAgentAdapterForRole now resolves from the actor roster (single source of truth).
import { getAgentAdapterForRole } from "./dock-actors";

describe("agent-adapter", () => {
  test("claude resolves native-tui adapter with launch claude", () => {
    const adapter = getAgentAdapterForRole("claude");
    expect(isNativeTuiAdapter(adapter)).toBe(true);
    expect(adapter?.launch).toBe("claude");
  });

  test("eve resolves as server — no terminal prompt injection", () => {
    const adapter = getAgentAdapterForRole("eve");
    expect(isServerClassifiedAdapter(adapter)).toBe(true);
    const fields = resolveRoleLaunchFields(adapter, "You are Eve...", "npm run dev");
    expect(fields.commandTemplate).toBe("npm run dev");
    expect(fields.startupPrompt).toBeUndefined();
  });

  test("promptArg folds startup prompt into launch command", () => {
    const fields = resolveRoleLaunchFields(
      CLAUDE_NATIVE_TUI_ADAPTER,
      "Act as worker.",
      "claude",
    );
    expect(fields.startupPrompt).toBeUndefined();
    expect(fields.commandTemplate).toBe('claude "Act as worker."');
  });
});
