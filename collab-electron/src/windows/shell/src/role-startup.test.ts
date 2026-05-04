import { describe, expect, test } from "bun:test";
import {
	ROLE_STARTUP_PROMPT_DELAY_MS,
	getRoleStartupWrites,
} from "./role-startup.js";

describe("getRoleStartupWrites", () => {
	test("sends command first and delays startup prompt for a fresh role session", () => {
		expect(getRoleStartupWrites({
			type: "term",
			ptySessionId: "session-1",
			roleCommandTemplate: "codex",
			roleStartupPrompt: "Review context and wait.",
		})).toEqual([
			{
				kind: "command",
				data: "codex\r",
				delayMs: 0,
			},
			{
				kind: "prompt",
				data: "Review context and wait.\r",
				delayMs: ROLE_STARTUP_PROMPT_DELAY_MS,
			},
		]);
	});

	test("does not duplicate command or prompt for the same PTY session", () => {
		expect(getRoleStartupWrites({
			type: "term",
			ptySessionId: "session-1",
			roleCommandTemplate: "claude",
			roleStartupPrompt: "Act as reviewer.",
			roleStartupSessionId: "session-1",
			roleStartupPromptSessionId: "session-1",
		})).toEqual([]);
	});

	test("can send a prompt without a role command", () => {
		expect(getRoleStartupWrites({
			type: "term",
			ptySessionId: "session-1",
			roleStartupPrompt: "Use this terminal for review.",
		})).toEqual([
			{
				kind: "prompt",
				data: "Use this terminal for review.\r",
				delayMs: 0,
			},
		]);
	});

	test("requires an active PTY session", () => {
		expect(getRoleStartupWrites({
			type: "term",
			roleCommandTemplate: "codex",
			roleStartupPrompt: "Review context.",
		})).toEqual([]);
	});
});
