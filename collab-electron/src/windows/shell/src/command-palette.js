function normalizeCommandText(value) {
	return String(value ?? "").trim().toLowerCase();
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function normalizeCommandQuery(value) {
	return normalizeCommandText(value).split(/\s+/).filter(Boolean);
}

export function getCommandSearchText(item) {
	return [
		item?.title,
		item?.subtitle,
		item?.section,
		...(Array.isArray(item?.keywords) ? item.keywords : []),
	].map(normalizeCommandText).filter(Boolean).join(" ");
}

export function filterCommandItems(items, query) {
	const tokens = normalizeCommandQuery(query);
	const list = Array.isArray(items) ? items : [];
	if (tokens.length === 0) return list.slice(0, 12);
	return list
		.map((item, index) => {
			const title = normalizeCommandText(item?.title);
			const text = getCommandSearchText(item);
			if (!tokens.every((token) => text.includes(token))) return null;
			const startsWith = tokens.some((token) => title.startsWith(token));
			return {
				item,
				index,
				score: (startsWith ? 2 : 0) + (item?.disabled ? -1 : 0),
			};
		})
		.filter(Boolean)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, 12)
		.map((entry) => entry.item);
}

export function renderCommandItem(item, active) {
	const disabled = item?.disabled ? " disabled" : "";
	const activeClass = active ? " active" : "";
	const subtitle = item?.subtitle
		? `<div class="command-palette-subtitle">${escapeHtml(item.subtitle)}</div>`
		: "";
	const section = item?.section
		? `<span class="command-palette-section">${escapeHtml(item.section)}</span>`
		: "";
	return `
		<button
			type="button"
			class="command-palette-item${activeClass}${disabled}"
			data-command-id="${escapeHtml(item?.id)}"
			${item?.disabled ? "disabled" : ""}
		>
			<span class="command-palette-item-main">
				<span class="command-palette-title">${escapeHtml(item?.title)}</span>
				${subtitle}
			</span>
			${section}
		</button>
	`;
}

export function formatConnectionCommandTitle(conn, tileAName, tileBName) {
	const label = String(conn?.label ?? "").trim();
	const prefix = label ? `Cable ${label}` : "Cable";
	return `${prefix}: ${tileAName || conn?.tileAId || "unknown"} -> ${tileBName || conn?.tileBId || "unknown"}`;
}

function formatRelayLogRoute(entry) {
	const method = entry?.routeMethod === "agent" ? "agent" : "manual";
	const source = String(entry?.fromLabel || entry?.fromTileId || "unknown").trim();
	const targetLabel = String(entry?.targetLabel || "").trim().replace(/^@/, "");
	const target = targetLabel
		? `@${targetLabel}`
		: String(entry?.targetTileId || "unresolved").trim() || "unresolved";
	return `${method} / ${source || "unknown"} -> ${target}`;
}

function summarizeRelayText(value, maxLength = 140) {
	const text = String(value ?? "").replace(/\s+/g, " ").trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function formatRelayLogDetail(entries) {
	const list = Array.isArray(entries) ? entries : [];
	if (list.length === 0) {
		return "No relay events recorded for this cable.";
	}
	return list.map((entry) => {
		const status = entry?.ok === false ? "failed" : "sent";
		const ts = Number.isFinite(entry?.ts)
			? new Date(entry.ts).toISOString()
			: "unknown time";
		const message = entry?.message
			? ` (${entry.message})`
			: "";
		return [
			`[${ts}] ${status}${message}`,
			formatRelayLogRoute(entry),
			summarizeRelayText(entry?.text),
		].filter(Boolean).join("\n");
	}).join("\n\n");
}

export function formatContextInjectionTitle(tileLabel) {
	return `Inject Context into ${tileLabel || "terminal"}`;
}

export function formatContextInjectionSubtitle(tile) {
	if (tile?.ptySessionId) return "Shared context -> running terminal";
	if (tile?.type !== "term") return "Only terminal tiles can receive context";
	return "Terminal has no PTY session";
}

export function createCommandPalette({
	document,
	onClose,
	onNotify,
} = {}) {
	const root = document.createElement("div");
	root.className = "command-palette-backdrop";
	root.hidden = true;
	root.innerHTML = `
		<div class="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
			<input class="command-palette-input" type="text" spellcheck="false" placeholder="Type a command" />
			<div class="command-palette-list" role="listbox"></div>
		</div>
	`;
	document.body.appendChild(root);

	const input = root.querySelector(".command-palette-input");
	const list = root.querySelector(".command-palette-list");
	let items = [];
	let visibleItems = [];
	let activeIndex = 0;

	function isOpen() {
		return !root.hidden;
	}

	function close() {
		if (!isOpen()) return;
		root.hidden = true;
		input.value = "";
		onClose?.();
	}

	function render() {
		visibleItems = filterCommandItems(items, input.value);
		if (activeIndex >= visibleItems.length) activeIndex = 0;
		if (activeIndex < 0) activeIndex = Math.max(0, visibleItems.length - 1);
		if (visibleItems.length === 0) {
			list.innerHTML = `<div class="command-palette-empty">No commands</div>`;
			return;
		}
		list.innerHTML = visibleItems
			.map((item, index) => renderCommandItem(item, index === activeIndex))
			.join("");
	}

	async function activate(item = visibleItems[activeIndex]) {
		if (!item || item.disabled) return;
		close();
		try {
			await item.run?.();
		} catch (err) {
			onNotify?.(
				err instanceof Error ? err.message : "Command failed.",
				"error",
			);
		}
	}

	function open(nextItems = items) {
		items = Array.isArray(nextItems) ? nextItems : [];
		activeIndex = 0;
		root.hidden = false;
		render();
		input.focus();
		input.select();
	}

	input.addEventListener("input", () => {
		activeIndex = 0;
		render();
	});

	root.addEventListener("mousedown", (event) => {
		if (event.target === root) close();
	});

	list.addEventListener("click", (event) => {
		const button = event.target.closest?.(".command-palette-item");
		if (!button || button.disabled) return;
		const item = visibleItems.find((entry) => entry.id === button.dataset.commandId);
		void activate(item);
	});

	root.addEventListener("keydown", (event) => {
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			activeIndex = Math.min(activeIndex + 1, visibleItems.length - 1);
			render();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			render();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			void activate();
		}
	});

	return {
		open,
		close,
		isOpen,
		setItems(nextItems) {
			items = Array.isArray(nextItems) ? nextItems : [];
			if (isOpen()) render();
		},
		element: root,
	};
}
