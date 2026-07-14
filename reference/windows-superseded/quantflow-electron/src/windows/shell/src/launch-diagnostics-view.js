export function createPtyStartFailureDiagnostic(payload = {}, tile = null) {
	const tileLabel = String(
		tile?.userTitle || tile?.roleName || tile?.autoTitle || tile?.id || payload.tileId || "terminal",
	).trim();
	const message = String(payload.message ?? "").trim() || "The terminal PTY could not be started.";
	return {
		id: `pty-start-failed:${tile?.id || payload.tileId || Date.now()}`,
		severity: "error",
		title: "PTY start failed",
		message: `${tileLabel}: ${message}`,
	};
}

export function createPtyRestoreFailureDiagnostic(payload = {}, tile = null) {
	const tileLabel = String(
		tile?.userTitle || tile?.roleName || tile?.autoTitle || tile?.id || payload.tileId || "terminal",
	).trim();
	const message = String(payload.message ?? "").trim() || "The terminal session could not be restored and a new session also failed to start.";
	return {
		id: `pty-restore-failed:${tile?.id || payload.tileId || Date.now()}`,
		severity: "error",
		title: "Terminal restore failed",
		message: `${tileLabel}: ${message}`,
	};
}
