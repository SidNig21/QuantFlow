export const SHORTCUTS = [
	{ actionId: "toggle-settings", keys: ["mod", ","], when: "global", description: "Open settings" },
	{ actionId: "command-palette", keys: ["mod", "k"], when: "shell", description: "Open command palette" },
	{ actionId: "shortcuts-panel", keys: ["?"], when: "shell", description: "Open shortcuts" },
	{ actionId: "new-tile", keys: ["mod", "n"], when: "shell", description: "New terminal tile" },
	{ actionId: "close-tile", keys: ["mod", "w"], when: "shell", description: "Close focused tile" },
	{ actionId: "sidebar-files", keys: ["mod", "b"], when: "global", description: "Toggle Navigator" },
	{ actionId: "sidebar-tiles", keys: ["mod", "shift", "b"], when: "shell", description: "Show Tiles sidebar" },
	{ actionId: "toggle-agent", keys: ["mod", "alt", "b"], when: "global", description: "Toggle Agent" },
	{ actionId: "focus-file-search", keys: ["mod", "k"], when: "webview", description: "Focus file search" },
	{ actionId: "add-workspace", keys: ["mod", "shift", "o"], when: "global", description: "Open workspace" },
	{ actionId: "zoom-in", keys: ["mod", "="], when: "global", description: "Zoom in" },
	{ actionId: "zoom-out", keys: ["mod", "-"], when: "global", description: "Zoom out" },
	{ actionId: "zoom-reset", keys: ["mod", "0"], when: "global", description: "Actual size" },
	{ actionId: "toggle-full-screen", keys: ["f11"], when: "global", description: "Toggle full screen" },
	{ actionId: "focus-tile-left", keys: ["alt", "arrowleft"], when: "canvas", description: "Focus tile left" },
	{ actionId: "focus-tile-right", keys: ["alt", "arrowright"], when: "canvas", description: "Focus tile right" },
	{ actionId: "focus-tile-up", keys: ["alt", "arrowup"], when: "canvas", description: "Focus tile up" },
	{ actionId: "focus-tile-down", keys: ["alt", "arrowdown"], when: "canvas", description: "Focus tile down" },
	{ actionId: "toggle-watchtower", keys: ["w"], when: "canvas", description: "Toggle Watchtower" },
	{ actionId: "cable-draw-mode", keys: ["c"], when: "canvas", description: "Hold cable draw mode" },
];

function normalizeKey(value) {
	const text = String(value ?? "").trim().toLowerCase();
	if (text === "cmd" || text === "ctrl" || text === "control" || text === "commandorcontrol") {
		return "mod";
	}
	if (text === "option") return "alt";
	if (text === "esc") return "escape";
	return text;
}

export function shortcutSignature(shortcut) {
	return [
		shortcut.when,
		...(shortcut.keys ?? []).map(normalizeKey).sort(),
	].join(":");
}

export function findDuplicateShortcuts(shortcuts = SHORTCUTS) {
	const seen = new Map();
	const duplicates = [];
	for (const shortcut of shortcuts) {
		const signature = shortcutSignature(shortcut);
		const previous = seen.get(signature);
		if (previous) duplicates.push([previous, shortcut]);
		else seen.set(signature, shortcut);
	}
	return duplicates;
}

export function formatShortcutKeys(keys, { platform = "linux" } = {}) {
	const mod = platform === "darwin" ? "Cmd" : "Ctrl";
	return (keys ?? []).map((key) => {
		const normalized = normalizeKey(key);
		if (normalized === "mod") return mod;
		if (normalized === "alt") return platform === "darwin" ? "Opt" : "Alt";
		if (normalized === "shift") return "Shift";
		if (normalized.startsWith("arrow")) {
			const direction = normalized.replace("arrow", "");
			return direction.charAt(0).toUpperCase() + direction.slice(1);
		}
		if (normalized === "f11") return "F11";
		if (normalized.length === 1) return normalized.toUpperCase();
		return normalized.charAt(0).toUpperCase() + normalized.slice(1);
	}).join("+");
}

export function shortcutToCommand(shortcut, { platform = "linux" } = {}) {
	return {
		id: `shortcut:${shortcut.actionId}`,
		title: shortcut.description,
		subtitle: formatShortcutKeys(shortcut.keys, { platform }),
		section: "Shortcuts",
		keywords: [shortcut.actionId, shortcut.when, shortcut.description],
	};
}

export function isEditableTarget(target) {
	const tag = String(target?.tagName ?? "").toLowerCase();
	return tag === "input" || tag === "textarea" || target?.isContentEditable === true;
}

export function shouldOpenShortcutPanel(event) {
	return event.key === "?" &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!isEditableTarget(event.target);
}
