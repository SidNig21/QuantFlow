export function escapeDiagnosticHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function normalizeLaunchDiagnostic(input = {}) {
	const id = String(input.id ?? "").trim();
	const title = String(input.title ?? "").trim();
	const message = String(input.message ?? "").trim();
	if (!id || !title || !message) return null;
	const action = input.action === "settings" ? "settings" : "copy";
	const fixCommand = String(input.fixCommand ?? "").trim();
	return {
		id,
		severity: input.severity === "error" ? "error" : "warn",
		title,
		message,
		action,
		actionLabel: String(input.actionLabel ?? "").trim()
			|| (action === "settings" ? "Open settings" : "Copy command"),
		fixCommand,
	};
}

export function normalizeLaunchDiagnostics(items = []) {
	return (Array.isArray(items) ? items : [])
		.map((item) => normalizeLaunchDiagnostic(item))
		.filter(Boolean);
}

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
		action: "settings",
		actionLabel: "Open settings",
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
		action: "settings",
		actionLabel: "Open settings",
	};
}

export function renderLaunchDiagnostics(items = []) {
	const diagnostics = normalizeLaunchDiagnostics(items);
	if (diagnostics.length === 0) return "";
	return `
		<div class="launch-diagnostics-panel" role="dialog" aria-modal="false" aria-labelledby="launch-diagnostics-title">
			<div class="launch-diagnostics-header">
				<div>
					<div id="launch-diagnostics-title" class="launch-diagnostics-title">Launch diagnostics</div>
					<div class="launch-diagnostics-subtitle">Fix these before relying on agent orchestration.</div>
				</div>
				<button type="button" class="launch-diagnostics-dismiss" data-launch-dismiss aria-label="Dismiss">Close</button>
			</div>
			<div class="launch-diagnostics-list">
				${diagnostics.map((item) => `
					<div class="launch-diagnostic-row" data-severity="${escapeDiagnosticHtml(item.severity)}" data-diagnostic-id="${escapeDiagnosticHtml(item.id)}">
						<div class="launch-diagnostic-body">
							<div class="launch-diagnostic-title">${escapeDiagnosticHtml(item.title)}</div>
							<div class="launch-diagnostic-message">${escapeDiagnosticHtml(item.message)}</div>
						</div>
						<button
							type="button"
							class="launch-diagnostic-action"
							data-launch-action="${escapeDiagnosticHtml(item.id)}"
						>${escapeDiagnosticHtml(item.actionLabel)}</button>
					</div>
				`).join("")}
			</div>
		</div>
	`;
}
