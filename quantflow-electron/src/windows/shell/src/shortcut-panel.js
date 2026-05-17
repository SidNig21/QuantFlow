import {
	SHORTCUTS,
	formatShortcutKeys,
} from "./shortcut-registry.js";

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function groupShortcuts(shortcuts = SHORTCUTS) {
	const groups = new Map();
	for (const shortcut of shortcuts) {
		const key = shortcut.when || "shell";
		const items = groups.get(key) ?? [];
		items.push(shortcut);
		groups.set(key, items);
	}
	return [...groups.entries()].map(([when, items]) => ({ when, items }));
}

export function renderShortcutPanel(shortcuts = SHORTCUTS, { platform = "linux" } = {}) {
	return groupShortcuts(shortcuts).map((group) => `
		<section class="shortcut-panel-section">
			<h3>${escapeHtml(group.when)}</h3>
			${group.items.map((item) => `
				<div class="shortcut-panel-row">
					<span>${escapeHtml(item.description)}</span>
					<kbd>${escapeHtml(formatShortcutKeys(item.keys, { platform }))}</kbd>
				</div>
			`).join("")}
		</section>
	`).join("");
}

export function createShortcutPanel({
	document,
	platform = "linux",
	shortcuts = SHORTCUTS,
} = {}) {
	const root = document.createElement("div");
	root.className = "shortcut-panel-backdrop";
	root.hidden = true;
	root.innerHTML = `
		<div class="shortcut-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
			<div class="shortcut-panel-header">
				<h2>Keyboard shortcuts</h2>
				<button type="button" class="shortcut-panel-close" aria-label="Close shortcuts">Close</button>
			</div>
			<div class="shortcut-panel-list">${renderShortcutPanel(shortcuts, { platform })}</div>
		</div>
	`;
	document.body.appendChild(root);

	function open() {
		root.hidden = false;
		root.querySelector(".shortcut-panel-close")?.focus();
	}

	function close() {
		root.hidden = true;
	}

	root.addEventListener("mousedown", (event) => {
		if (event.target === root) close();
	});
	root.addEventListener("click", (event) => {
		if (event.target.closest?.(".shortcut-panel-close")) close();
	});
	root.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
		}
	});

	return { element: root, open, close, isOpen: () => !root.hidden };
}
