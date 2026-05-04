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

export function formatRoleStartupEvent(tile, write, err = null) {
	const roleLabel = normalizeStartupText(
		tile?.roleName || tile?.userTitle || tile?.autoTitle || tile?.id,
	) || "Role";
	const failed = Boolean(err);
	const kindLabel = write?.kind === "prompt"
		? "startup prompt"
		: "startup command";
	return {
		type: failed
			? "role.failed"
			: write?.kind === "prompt"
				? "role.startup_prompt_sent"
				: "role.startup_command_sent",
		severity: failed ? "error" : "info",
		summary: failed
			? `${roleLabel} ${kindLabel} failed`
			: `${roleLabel} ${kindLabel} sent`,
		detail: failed
			? err?.message || `Could not write ${kindLabel}.`
			: write?.kind === "prompt"
				? "Initial role instruction delivered."
				: tile?.roleCommandTemplate || "",
		meta: {
			tileId: tile?.id,
			sessionId: tile?.ptySessionId,
			roleId: tile?.roleId,
			kind: write?.kind,
		},
	};
}
