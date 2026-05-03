import { connections, tiles } from "./canvas-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function getAnchor(fromTile, toTile, vp) {
	const { panX, panY, zoom } = vp;
	const ax = fromTile.x * zoom + panX + (fromTile.width * zoom) / 2;
	const ay = fromTile.y * zoom + panY + (fromTile.height * zoom) / 2;
	const bx = toTile.x * zoom + panX + (toTile.width * zoom) / 2;
	const by = toTile.y * zoom + panY + (toTile.height * zoom) / 2;
	const dx = bx - ax;
	const dy = by - ay;
	const hw = (fromTile.width * zoom) / 2;
	const hh = (fromTile.height * zoom) / 2;
	if (dx === 0 && dy === 0) return { x: ax, y: ay };
	const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
	const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
	const t = Math.min(tx, ty);
	return { x: ax + dx * t, y: ay + dy * t };
}

function bezierMid(ax, ay, cx1, cy1, cx2, cy2, bx, by) {
	return {
		x: 0.125 * ax + 0.375 * cx1 + 0.375 * cx2 + 0.125 * bx,
		y: 0.125 * ay + 0.375 * cy1 + 0.375 * cy2 + 0.125 * by,
	};
}

function makePath(ax, ay, bx, by) {
	const dx = bx - ax;
	const cx1 = ax + dx * 0.4;
	const cy1 = ay;
	const cx2 = bx - dx * 0.4;
	const cy2 = by;
	const d = `M ${ax} ${ay} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${bx} ${by}`;
	const mid = bezierMid(ax, ay, cx1, cy1, cx2, cy2, bx, by);
	return { d, mid };
}

export function getConnectionPresentation(
	connectionId,
	connectionList,
	tileList,
	viewport,
) {
	const conn = connectionList.find((item) => item.id === connectionId);
	if (!conn) return null;

	const tileA = tileList.find((tile) => tile.id === conn.tileAId);
	const tileB = tileList.find((tile) => tile.id === conn.tileBId);
	if (!tileA || !tileB) return null;

	const a = getAnchor(tileA, tileB, viewport);
	const b = getAnchor(tileB, tileA, viewport);
	const { d, mid } = makePath(a.x, a.y, b.x, b.y);
	return { conn, tileA, tileB, a, b, d, mid };
}

export function clampFloatingPosition(
	x,
	y,
	width,
	height,
	viewportWidth,
	viewportHeight,
	margin = 12,
) {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
	const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
		? viewportWidth
		: safeWidth + margin * 2;
	const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
		? viewportHeight
		: safeHeight + margin * 2;
	const minX = margin;
	const minY = margin;
	const maxX = Math.max(minX, safeViewportWidth - safeWidth - margin);
	const maxY = Math.max(minY, safeViewportHeight - safeHeight - margin);
	return {
		x: Math.min(Math.max(x, minX), maxX),
		y: Math.min(Math.max(y, minY), maxY),
	};
}

export function shouldSubmitCableMessage(e) {
	return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function createCableOverlay({
	containerEl,
	viewportState,
	onSendMessage,
	onRemoveConnection,
	onUpdateLabel,
}) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.id = "cable-overlay";
	svg.setAttribute("aria-hidden", "true");
	containerEl.appendChild(svg);

	const pathLayer = document.createElementNS(SVG_NS, "g");
	pathLayer.setAttribute("class", "cable-path-layer");
	const labelLayer = document.createElementNS(SVG_NS, "g");
	labelLayer.setAttribute("class", "cable-label-layer");
	const hitLayer = document.createElementNS(SVG_NS, "g");
	hitLayer.setAttribute("class", "cable-hit-layer");
	const previewLayer = document.createElementNS(SVG_NS, "g");
	previewLayer.setAttribute("class", "cable-preview-layer");
	svg.appendChild(pathLayer);
	svg.appendChild(labelLayer);
	svg.appendChild(hitLayer);
	svg.appendChild(previewLayer);

	let popoverEl = null;
	let contextMenuEl = null;
	let selectedConnectionId = null;

	const previewState = { active: false, startTile: null, mouseX: 0, mouseY: 0 };

	function removePopover() {
		popoverEl?.remove();
		popoverEl = null;
	}

	function removeContextMenu() {
		contextMenuEl?.remove();
		contextMenuEl = null;
	}

	function tileLabel(tile) {
		return tile.userTitle || tile.autoTitle || tile.id;
	}

	function placePopover(el, x, y) {
		const rect = el.getBoundingClientRect();
		const pos = clampFloatingPosition(
			x,
			y,
			rect.width || el.offsetWidth || 250,
			rect.height || el.offsetHeight || 120,
			containerEl.clientWidth,
			containerEl.clientHeight,
		);
		el.style.left = `${pos.x}px`;
		el.style.top = `${pos.y}px`;
	}

	function showPopover(conn, mx, my, tileA, tileB) {
		removePopover();
		removeContextMenu();
		selectedConnectionId = conn.id;
		updateCableClasses();

		let direction = "AtoB";

		popoverEl = document.createElement("div");
		popoverEl.className = "cable-popover";
		popoverEl.style.left = `${mx}px`;
		popoverEl.style.top = `${my + 12}px`;

		const dirBtn = document.createElement("button");
		dirBtn.type = "button";
		dirBtn.className = "cable-dir-btn";

		function refreshDirLabel() {
			const la = tileLabel(tileA);
			const lb = tileLabel(tileB);
			dirBtn.textContent = direction === "AtoB" ? `${la} → ${lb}` : `${lb} → ${la}`;
		}
		refreshDirLabel();

		dirBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			direction = direction === "AtoB" ? "BtoA" : "AtoB";
			refreshDirLabel();
		});

		const input = document.createElement("textarea");
		input.placeholder = "Message... Ctrl+Enter sends";
		input.className = "cable-input";
		input.rows = 3;
		input.spellcheck = true;

		const sendBtn = document.createElement("button");
		sendBtn.type = "button";
		sendBtn.textContent = "Send";
		sendBtn.className = "cable-send-btn";

		const statusEl = document.createElement("div");
		statusEl.className = "cable-status";
		statusEl.hidden = true;

		function setStatus(message, kind = "error") {
			statusEl.textContent = message;
			statusEl.hidden = !message;
			statusEl.dataset.kind = kind;
		}

		async function doSend() {
			const text = input.value.trim();
			if (!text) return;
			const fromTile = direction === "AtoB" ? tileA : tileB;
			const toTile = direction === "AtoB" ? tileB : tileA;
			sendBtn.disabled = true;
			setStatus("Sending…", "pending");
			try {
				const result = await onSendMessage?.({
					connectionId: conn.id,
					fromTileId: fromTile.id,
					fromLabel: tileLabel(fromTile),
					targetTileId: toTile.id,
					targetSessionId: toTile.ptySessionId ?? null,
					text,
				});
				if (result?.ok === false) {
					setStatus(result.message || "Relay failed.", "error");
					input.focus();
					return;
				}
				pulseCable(conn.id);
				input.value = "";
				removePopover();
			} catch (err) {
				setStatus(err instanceof Error ? err.message : "Relay failed.", "error");
				input.focus();
			} finally {
				if (popoverEl) sendBtn.disabled = false;
			}
		}

		sendBtn.addEventListener("click", (e) => { e.stopPropagation(); doSend(); });
		input.addEventListener("keydown", (e) => {
			if (shouldSubmitCableMessage(e)) {
				e.preventDefault();
				doSend();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				removePopover();
			}
			e.stopPropagation();
		});

		popoverEl.appendChild(dirBtn);
		popoverEl.appendChild(input);
		popoverEl.appendChild(statusEl);
		popoverEl.appendChild(sendBtn);
		containerEl.appendChild(popoverEl);

		requestAnimationFrame(() => {
			if (!popoverEl) return;
			placePopover(popoverEl, mx, my + 12);
			input.focus();
		});

		setTimeout(() => {
			document.addEventListener("click", removePopover, { once: true });
		}, 0);
	}

	function showContextMenu(conn, clientX, clientY) {
		removeContextMenu();
		removePopover();

		contextMenuEl = document.createElement("div");
		contextMenuEl.className = "cable-context-menu";
		contextMenuEl.style.cssText = `left:${clientX}px;top:${clientY}px;`;

		const removeItem = document.createElement("div");
		removeItem.className = "cable-menu-item";
		removeItem.textContent = "Remove connection";
		removeItem.addEventListener("click", (e) => {
			e.stopPropagation();
			removeContextMenu();
			onRemoveConnection?.(conn.id);
		});

		const labelItem = document.createElement("div");
		labelItem.className = "cable-menu-item";
		labelItem.textContent = "Label…";
		labelItem.addEventListener("click", (e) => {
			e.stopPropagation();
			removeContextMenu();
			const next = prompt("Cable label:", conn.label ?? "");
			if (next !== null) onUpdateLabel?.(conn.id, next);
		});

		contextMenuEl.appendChild(removeItem);
		contextMenuEl.appendChild(labelItem);
		document.body.appendChild(contextMenuEl);

		setTimeout(() => {
			document.addEventListener("click", removeContextMenu, { once: true });
		}, 0);
	}

	function pulseCable(connectionId) {
		const paths = svg.querySelectorAll(
			`.cable-path[data-conn-id="${connectionId}"]`,
		);
		for (const p of paths) {
			p.classList.remove("cable-pulse");
			// Force reflow so removing then re-adding restarts animation
			void p.offsetWidth;
			p.classList.add("cable-pulse");
			setTimeout(() => p.classList.remove("cable-pulse"), 650);
		}
	}

	function setCableHovered(connectionId, hovered) {
		for (const el of svg.querySelectorAll(`[data-conn-id="${connectionId}"]`)) {
			el.classList.toggle("cable-hovered", hovered);
		}
	}

	function updateCableClasses() {
		for (const el of svg.querySelectorAll("[data-conn-id]")) {
			el.classList.toggle(
				"cable-selected",
				el.dataset.connId === selectedConnectionId,
			);
		}
	}

	function drawConnections() {
		pathLayer.replaceChildren();
		labelLayer.replaceChildren();
		hitLayer.replaceChildren();

		for (const conn of connections) {
			const presentation = getConnectionPresentation(
				conn.id,
				connections,
				tiles,
				viewportState,
			);
			if (!presentation) continue;
			const { tileA, tileB, d, mid } = presentation;

			// Visible cable path
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("d", d);
			path.setAttribute("class", "cable-path");
			path.setAttribute("data-conn-id", conn.id);
			pathLayer.appendChild(path);

			// Hit path (wide, transparent, receives pointer events)
			const hit = document.createElementNS(SVG_NS, "path");
			hit.setAttribute("d", d);
			hit.setAttribute("class", "cable-hit");
			hit.setAttribute("data-conn-id", conn.id);

			hit.addEventListener("mouseenter", () => setCableHovered(conn.id, true));
			hit.addEventListener("mouseleave", () => setCableHovered(conn.id, false));
			hit.addEventListener("click", (e) => {
				e.stopPropagation();
				showPopover(conn, mid.x, mid.y, tileA, tileB);
			});
			hit.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showContextMenu(conn, e.clientX, e.clientY);
			});
			hitLayer.appendChild(hit);

			// Label
			if (conn.label) {
				const txt = document.createElementNS(SVG_NS, "text");
				txt.setAttribute("x", mid.x);
				txt.setAttribute("y", mid.y - 8);
				txt.setAttribute("class", "cable-label");
				txt.textContent = conn.label;
				labelLayer.appendChild(txt);
			}
		}
		updateCableClasses();
	}

	function drawPreview() {
		previewLayer.replaceChildren();

		if (!previewState.active || !previewState.startTile) return;

		const vp = viewportState;
		const tile = previewState.startTile;
		const ax = tile.x * vp.zoom + vp.panX + (tile.width * vp.zoom) / 2;
		const ay = tile.y * vp.zoom + vp.panY + (tile.height * vp.zoom) / 2;
		const bx = previewState.mouseX;
		const by = previewState.mouseY;
		const { d } = makePath(ax, ay, bx, by);

		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		path.setAttribute("class", "cable-preview");
		previewLayer.appendChild(path);
	}

	function update() {
		drawConnections();
		drawPreview();
	}

	function startPreview(startTile) {
		previewState.active = true;
		previewState.startTile = startTile;
	}

	function updatePreview(mouseX, mouseY) {
		previewState.mouseX = mouseX;
		previewState.mouseY = mouseY;
		if (previewState.active) drawPreview();
	}

	function cancelPreview() {
		previewState.active = false;
		previewState.startTile = null;
		previewLayer.replaceChildren();
	}

	function selectConnection(connectionId, { openPopover = true } = {}) {
		const presentation = getConnectionPresentation(
			connectionId,
			connections,
			tiles,
			viewportState,
		);
		if (!presentation) return null;

		const { conn, tileA, tileB, mid } = presentation;
		selectedConnectionId = conn.id;
		updateCableClasses();

		if (openPopover) {
			showPopover(conn, mid.x, mid.y, tileA, tileB);
		}

		return { connection: conn, tileA, tileB, mid };
	}

	function destroy() {
		svg.remove();
		removePopover();
		removeContextMenu();
	}

	return {
		update,
		startPreview,
		updatePreview,
		cancelPreview,
		selectConnection,
		pulseCable,
		destroy,
	};
}
