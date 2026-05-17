export function isRunningTerminalTile(tile) {
	if (tile?.type !== "term" || !tile.ptySessionId) return false;
	return tile.ptyStatus !== "idle" && tile.ptyStatus !== "exited";
}

export function shouldConfirmTileClose(tile, event = null) {
	return isRunningTerminalTile(tile) && event?.shiftKey !== true;
}

export function closeConfirmationCopy(tile) {
	const label = tile?.userTitle || tile?.autoTitle || tile?.roleName || tile?.id || "terminal";
	return {
		message: `Close ${label}?`,
		detail: "This terminal still has a running PTY session. Closing it will stop the session.",
		buttons: ["Cancel", "Close"],
	};
}

export async function confirmTileClose(tile, {
	event = null,
	showConfirmDialog,
} = {}) {
	if (!shouldConfirmTileClose(tile, event)) return true;
	const response = await showConfirmDialog?.(closeConfirmationCopy(tile));
	return response === 1;
}
