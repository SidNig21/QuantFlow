export const ROLE_STARTUP_PROMPT_DELAY_MS = 1800;

function normalizeStartupText(value) {
	return String(value ?? "").trim();
}

/**
 * @param {import("./canvas-state.js").Tile} tile
 * @returns {Array<{kind: "command" | "prompt", data: string, delayMs: number}>}
 */
export function getRoleStartupWrites(tile) {
	if (!tile?.ptySessionId) return [];

	const command = normalizeStartupText(tile.roleCommandTemplate);
	const prompt = normalizeStartupText(tile.roleStartupPrompt);
	const writes = [];
	const shouldSendCommand = command &&
		tile.roleStartupSessionId !== tile.ptySessionId;
	const shouldSendPrompt = prompt &&
		tile.roleStartupPromptSessionId !== tile.ptySessionId;

	if (shouldSendCommand) {
		writes.push({
			kind: "command",
			data: `${command}\r`,
			delayMs: 0,
		});
	}

	if (shouldSendPrompt) {
		writes.push({
			kind: "prompt",
			data: `${prompt}\r`,
			delayMs: shouldSendCommand ? ROLE_STARTUP_PROMPT_DELAY_MS : 0,
		});
	}

	return writes;
}
