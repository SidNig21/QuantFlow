import { describe, expect, test } from "bun:test";
import {
	ROLE_STARTUP_PROMPT_DELAY_MS,
	formatRoleStartupEvent,
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

describe("formatRoleStartupEvent", () => {
	test("formats visible startup command and prompt events", () => {
		const tile = {
			id: "tile-1",
			ptySessionId: "session-1",
			roleId: "codex",
			roleName: "Codex",
			roleCommandTemplate: "codex",
		};

		expect(formatRoleStartupEvent(tile, { kind: "command" }))
			.toMatchObject({
				type: "role.startup_command_sent",
				severity: "info",
				summary: "Codex startup command sent",
				detail: "codex",
				meta: {
					tileId: "tile-1",
					sessionId: "session-1",
					roleId: "codex",
					kind: "command",
				},
			});
		expect(formatRoleStartupEvent(tile, { kind: "prompt" }))
			.toMatchObject({
				type: "role.startup_prompt_sent",
				severity: "info",
				summary: "Codex startup prompt sent",
				detail: "Initial role instruction delivered.",
			});
	});

	test("formats startup write failures as role failures", () => {
		expect(formatRoleStartupEvent(
			{ id: "tile-1", roleName: "Codex" },
			{ kind: "prompt" },
			new Error("write failed"),
		)).toMatchObject({
			type: "role.failed",
			severity: "error",
			summary: "Codex startup prompt failed",
			detail: "write failed",
			meta: {
				tileId: "tile-1",
				kind: "prompt",
			},
		});
	});
});
