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

export function formatCableLabel(label, maxLength = 28) {
	const text = String(label ?? "").trim().replace(/\s+/g, " ");
	const max = Math.max(4, Number.isFinite(maxLength) ? Math.floor(maxLength) : 28);
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

export function getCableLabelLayout(
	label,
	mid,
	viewportWidth,
	viewportHeight,
) {
	const text = formatCableLabel(label);
	const width = Math.max(32, Math.min(220, text.length * 6.4 + 16));
	const height = 18;
	const pos = clampFloatingPosition(
		mid.x - width / 2,
		mid.y - 24,
		width,
		height,
		viewportWidth,
		viewportHeight,
		6,
	);
	return {
		text,
		x: pos.x,
		y: pos.y,
		width,
		height,
		textX: pos.x + width / 2,
		textY: pos.y + 12.5,
	};
}

export function getCableHitStrokeWidth(zoom = 1, { selected = false } = {}) {
	const normalizedZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
	let width = 24;
	if (normalizedZoom <= 0.75) {
		width = 30;
	} else if (normalizedZoom >= 1.25) {
		width = 20;
	}
	return selected ? width + 4 : width;
}

export function getCableRenderDescriptors({
	connectionList = [],
	tileList = [],
	viewport = { panX: 0, panY: 0, zoom: 1 },
	selectedConnectionId = null,
	viewportWidth = 0,
	viewportHeight = 0,
} = {}) {
	const descriptors = [];
	for (const conn of connectionList) {
		const presentation = getConnectionPresentation(
			conn.id,
			connectionList,
			tileList,
			viewport,
		);
		if (!presentation) continue;
		const selected = conn.id === selectedConnectionId;
		const labelLayout = conn.label
			? getCableLabelLayout(
				conn.label,
				presentation.mid,
				viewportWidth,
				viewportHeight,
			)
			: null;
		descriptors.push({
			...presentation,
			selected,
			hitStrokeWidth: getCableHitStrokeWidth(viewport.zoom, { selected }),
			labelLayout,
		});
	}
	return descriptors;
}

export function shouldSubmitCableMessage(e) {
	return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function formatCableLogEntry(entry) {
	const ok = entry?.ok !== false;
	const label = ok ? entry?.fromLabel || "sent" : entry?.errorCode || "failed";
	const text = ok
		? entry?.formatted || entry?.text || ""
		: entry?.message || entry?.formatted || entry?.text || "";
	const detail = formatCableLogDetail(entry, ok);
	return {
		ok,
		label: String(label),
		text: String(text),
		detail,
	};
}

export function formatCableLogDetail(entry, ok = entry?.ok !== false) {
	const method = entry?.routeMethod === "agent" ? "agent" : "manual";
	const source = String(entry?.fromLabel || entry?.fromTileId || "unknown").trim();
	const rawTargetLabel = String(entry?.targetLabel || "").trim().replace(/^@/, "");
	const target = rawTargetLabel
		? `@${rawTargetLabel}`
		: String(entry?.targetTileId || "unresolved").trim();
	const route = `${method} / ${source || "unknown"} -> ${target || "unresolved"}`;
	const error = !ok && entry?.errorCode ? ` / ${entry.errorCode}` : "";
	return `${route}${error}`;
}

export function getCableEndpointStatus(tile) {
	if (!tile) {
		return { label: "missing", tone: "error", sendable: false };
	}
	if (tile.ptyStatus === "error" || tile.ptyError) {
		return {
			label: "error",
			tone: "error",
			sendable: false,
			message: tile.ptyError || "Terminal is in an error state.",
		};
	}
	if (tile.ptyStatus === "exited") {
		return {
			label: "exited",
			tone: "error",
			sendable: false,
			message: "Terminal session has exited.",
		};
	}
	if (!tile.ptySessionId) {
		return {
			label: "no PTY",
			tone: "error",
			sendable: false,
			message: "No active PTY session is attached.",
		};
	}
	const label = tile.ptyStatus
		? String(tile.ptyStatus)
		: "ready";
	return {
		label,
		tone: label === "running" || label === "ready" ? "ok" : "warn",
		sendable: true,
	};
}

export function formatCableEndpointSummary(tile, label) {
	const status = getCableEndpointStatus(tile);
	const route = tile?.routeHandle ? ` @${tile.routeHandle}` : "";
	return {
		label: `${label}${route}`,
		status: status.label,
		tone: status.tone,
		message: status.message || "",
		sendable: status.sendable,
	};
}

export function formatCableRelayFailure(result, targetTile) {
	const base = String(result?.message || "Relay failed.").trim();
	const status = getCableEndpointStatus(targetTile);
	if (status.sendable || !status.message) return base;
	return `${base} Target status: ${status.message}`;
}

export function getCableRelayResultFeedback(
	result,
	targetTile,
	{
		clearInputOnSuccess = false,
		focusInputOnFailure = false,
	} = {},
) {
	if (result?.ok === false) {
		return {
			ok: false,
			relayState: "failed",
			status: formatCableRelayFailure(result, targetTile),
			statusKind: "error",
			shouldClearInput: false,
			shouldFocusInput: focusInputOnFailure,
			shouldRemovePopover: false,
		};
	}
	return {
		ok: true,
		relayState: "sent",
		status: "",
		statusKind: "",
		shouldClearInput: clearInputOnSuccess,
		shouldFocusInput: false,
		shouldRemovePopover: true,
	};
}

function defaultCableEndpointLabel(tile) {
	return tile?.userTitle || tile?.autoTitle || tile?.id || "Target";
}

export function getCableSendBlockMessage(targetTile, getLabel = defaultCableEndpointLabel) {
	const status = getCableEndpointStatus(targetTile);
	if (status.sendable) return null;
	const label = typeof getLabel === "function"
		? getLabel(targetTile)
		: targetTile?.id || "Target";
	return `${label} cannot receive yet. ${status.message || "No active PTY session."}`;
}

export function getDirectedCableTiles(direction, tileA, tileB) {
	return direction === "BtoA"
		? { fromTile: tileB, toTile: tileA }
		: { fromTile: tileA, toTile: tileB };
}

function tileScreenCenter(tile, viewport) {
	return {
		x: tile.x * viewport.zoom + viewport.panX + (tile.width * viewport.zoom) / 2,
		y: tile.y * viewport.zoom + viewport.panY + (tile.height * viewport.zoom) / 2,
	};
}

function squaredDistance(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

export function getCableDefaultDirection({
	tileA,
	tileB,
	viewport,
	focusedTileId,
	pointerX,
	pointerY,
} = {}) {
	if (!tileA || !tileB) return "AtoB";
	if (focusedTileId === tileA.id) return "AtoB";
	if (focusedTileId === tileB.id) return "BtoA";
	if (!viewport || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
		return "AtoB";
	}
	const pointer = { x: pointerX, y: pointerY };
	const a = tileScreenCenter(tileA, viewport);
	const b = tileScreenCenter(tileB, viewport);
	return squaredDistance(pointer, b) < squaredDistance(pointer, a)
		? "BtoA"
		: "AtoB";
}

export function getRetryCableRelayRequest(entry, conn, tileA, tileB, getLabel) {
	if (entry?.ok !== false) return null;
	const text = String(entry?.text ?? "").trim();
	if (!text) return null;
	const fromTileId = String(entry?.fromTileId ?? "");
	const targetTileId = String(entry?.targetTileId ?? "");
	if (!fromTileId || !targetTileId || fromTileId === targetTileId) return null;

	const endpoints = new Map([
		[tileA.id, tileA],
		[tileB.id, tileB],
	]);
	const fromTile = endpoints.get(fromTileId);
	const targetTile = endpoints.get(targetTileId);
	if (!fromTile || !targetTile) return null;
	const labelFor = typeof getLabel === "function" ? getLabel : (tile) => tile.id;
	return {
		connectionId: conn.id,
		fromTileId: fromTile.id,
		fromLabel: labelFor(fromTile),
		targetTileId: targetTile.id,
		targetSessionId: targetTile.ptySessionId ?? null,
		text,
	};
}

export function formatCableContextRelay(preview) {
	const text = String(preview?.text ?? "").trim();
	if (!text) return "";
	return `--- Shared Context ---\n${text}\n--- End Context ---`;
}

export function createCableOverlay({
	containerEl,
	viewportState,
	onSendMessage,
	onGetLog,
	onNotify,
	onInjectContext,
	onFocusTile,
	onRemoveConnection,
	onUpdateLabel,
	onGetFocusedTileId,
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
	const relayStateByConnection = new Map();

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

	function setCableRelayState(connectionId, state) {
		if (!state) {
			relayStateByConnection.delete(connectionId);
		} else {
			relayStateByConnection.set(connectionId, state);
		}
		updateCableClasses();
	}

	function getLocalPoint(event) {
		const rect = containerEl.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	function showPopover(conn, mx, my, tileA, tileB, pointer = null) {
		removePopover();
		removeContextMenu();
		selectedConnectionId = conn.id;
		updateCableClasses();

		let direction = getCableDefaultDirection({
			tileA,
			tileB,
			viewport: viewportState,
			focusedTileId: onGetFocusedTileId?.() ?? null,
			pointerX: pointer?.x,
			pointerY: pointer?.y,
		});

		popoverEl = document.createElement("div");
		popoverEl.className = "cable-popover";
		popoverEl.style.left = `${mx}px`;
		popoverEl.style.top = `${my + 12}px`;
		popoverEl.addEventListener("click", (e) => e.stopPropagation());

		const dirBtn = document.createElement("button");
		dirBtn.type = "button";
		dirBtn.className = "cable-dir-btn";

		function refreshDirLabel() {
			const la = tileLabel(tileA);
			const lb = tileLabel(tileB);
			dirBtn.textContent = direction === "AtoB" ? `${la} → ${lb}` : `${lb} → ${la}`;
			renderEndpointHealth();
		}

		dirBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			direction = direction === "AtoB" ? "BtoA" : "AtoB";
			refreshDirLabel();
		});

		const input = document.createElement("textarea");
		input.placeholder = "Message...";
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

		const endpointHealthEl = document.createElement("div");
		endpointHealthEl.className = "cable-endpoint-health";

		const actionsEl = document.createElement("div");
		actionsEl.className = "cable-actions";

		function addAction(label, onClick) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "cable-action-btn";
			button.textContent = label;
			button.addEventListener("click", (e) => {
				e.stopPropagation();
				onClick();
			});
			actionsEl.appendChild(button);
			return button;
		}

		addAction(`Focus ${tileLabel(tileA)}`, () => onFocusTile?.(tileA.id));
		addAction(`Focus ${tileLabel(tileB)}`, () => onFocusTile?.(tileB.id));
		const contextBtn = addAction("Context", async () => {
			if (!onInjectContext) return;
			const { fromTile, toTile } = getDirectedCableTiles(direction, tileA, tileB);
			contextBtn.disabled = true;
			setStatus("Preparing context...", "pending");
			try {
				const result = await onInjectContext({
					connectionId: conn.id,
					fromTileId: fromTile.id,
					fromLabel: tileLabel(fromTile),
					targetTileId: toTile.id,
					targetLabel: tileLabel(toTile),
					targetSessionId: toTile.ptySessionId ?? null,
				});
				if (result?.canceled) {
					setStatus("");
					return;
				}
				if (result?.ok === false) {
					setStatus(result.message || "Context relay failed.", "error");
					onNotify?.(result.message || "Context relay failed.", "error");
					await refreshHistory();
					return;
				}
				pulseCable(conn.id);
				await refreshHistory();
				removePopover();
			} catch (err) {
				const message = err instanceof Error ? err.message : "Context relay failed.";
				setStatus(message, "error");
				onNotify?.(message, "error");
			} finally {
				if (popoverEl) contextBtn.disabled = false;
			}
		});
		addAction("Rename", () => {
			const next = prompt("Cable label:", conn.label ?? "");
			if (next !== null) {
				onUpdateLabel?.(conn.id, next);
				conn.label = next;
			}
		});
		addAction("Remove", () => {
			removePopover();
			onRemoveConnection?.(conn.id);
		});

		const historyEl = document.createElement("div");
		historyEl.className = "cable-history";
		const historyTitle = document.createElement("div");
		historyTitle.className = "cable-history-title";
		historyTitle.textContent = "Recent messages";
		const historyList = document.createElement("div");
		historyList.className = "cable-history-list";
		historyEl.appendChild(historyTitle);
		historyEl.appendChild(historyList);

		function setStatus(message, kind = "error") {
			statusEl.textContent = message;
			statusEl.hidden = !message;
			statusEl.dataset.kind = kind;
		}

		function renderEndpointHealth() {
			if (!endpointHealthEl) return;
			const { fromTile, toTile } = getDirectedCableTiles(direction, tileA, tileB);
			const rows = [
				formatCableEndpointSummary(fromTile, "From"),
				formatCableEndpointSummary(toTile, "To"),
			];
			endpointHealthEl.replaceChildren();
			for (const row of rows) {
				const item = document.createElement("div");
				item.className = "cable-endpoint-row";
				item.dataset.tone = row.tone;
				item.title = row.message || row.status;
				const name = document.createElement("span");
				name.className = "cable-endpoint-name";
				name.textContent = row.label;
				const status = document.createElement("span");
				status.className = "cable-endpoint-status";
				status.textContent = row.status;
				item.appendChild(name);
				item.appendChild(status);
				endpointHealthEl.appendChild(item);
			}
		}

		async function sendRelayRequest(request, {
			clearInputOnSuccess = false,
			focusInputOnFailure = false,
			targetTile = null,
		} = {}) {
			const resolvedTargetTile = targetTile
				|| (request?.targetTileId === tileA.id ? tileA : null)
				|| (request?.targetTileId === tileB.id ? tileB : null);
			setStatus("Sending…", "pending");
			setCableRelayState(conn.id, "sending");
			try {
				const result = await onSendMessage?.(request);
				const feedback = getCableRelayResultFeedback(
					result,
					resolvedTargetTile,
					{ clearInputOnSuccess, focusInputOnFailure },
				);
				if (!feedback.ok) {
					setCableRelayState(conn.id, feedback.relayState);
					setStatus(feedback.status, feedback.statusKind);
					onNotify?.(feedback.status, "error");
					await refreshHistory();
					if (feedback.shouldFocusInput) input.focus();
					return false;
				}
				setCableRelayState(conn.id, feedback.relayState);
				pulseCable(conn.id);
				if (feedback.shouldClearInput) input.value = "";
				await refreshHistory();
				if (feedback.shouldRemovePopover) removePopover();
				setTimeout(() => setCableRelayState(conn.id, null), 1500);
				return true;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Relay failed.";
				setCableRelayState(conn.id, "failed");
				setStatus(message, "error");
				onNotify?.(message, "error");
				if (focusInputOnFailure) input.focus();
				return false;
			}
		}

		function renderHistory(entries) {
			historyList.replaceChildren();
			if (!entries?.length) {
				const empty = document.createElement("div");
				empty.className = "cable-history-empty";
				empty.textContent = "No relay history.";
				historyList.appendChild(empty);
				return;
			}
			for (const entry of entries.slice(-5).reverse()) {
				const line = formatCableLogEntry(entry);
				const item = document.createElement("div");
				item.className = `cable-history-item ${line.ok ? "is-ok" : "is-failed"}`;
				const label = document.createElement("span");
				label.className = "cable-history-label";
				label.textContent = line.label;
				const text = document.createElement("span");
				text.className = "cable-history-text";
				text.textContent = line.text;
				const body = document.createElement("div");
				body.className = "cable-history-body";
				const detail = document.createElement("span");
				detail.className = "cable-history-detail";
				detail.textContent = line.detail;
				item.appendChild(label);
				body.appendChild(text);
				body.appendChild(detail);
				item.appendChild(body);
				const retryRequest = getRetryCableRelayRequest(
					entry,
					conn,
					tileA,
					tileB,
					tileLabel,
				);
				if (retryRequest) {
					const retryBtn = document.createElement("button");
					retryBtn.type = "button";
					retryBtn.className = "cable-history-retry";
					retryBtn.textContent = "Retry";
					retryBtn.addEventListener("click", async (e) => {
						e.stopPropagation();
						retryBtn.disabled = true;
						try {
							await sendRelayRequest(retryRequest);
						} finally {
							if (popoverEl) retryBtn.disabled = false;
						}
					});
					item.appendChild(retryBtn);
				}
				historyList.appendChild(item);
			}
		}

		async function refreshHistory() {
			if (!onGetLog) {
				renderHistory([]);
				return;
			}
			historyList.textContent = "Loading...";
			try {
				const entries = await onGetLog(conn.id, 5);
				renderHistory(Array.isArray(entries) ? entries : []);
			} catch {
				historyList.textContent = "Could not load relay history.";
			}
		}

		async function doSend() {
			const text = input.value.trim();
			if (!text) return;
			const { fromTile, toTile } = getDirectedCableTiles(direction, tileA, tileB);
			const blockMessage = getCableSendBlockMessage(toTile, tileLabel);
			if (blockMessage) {
				setStatus(blockMessage, "error");
				onNotify?.(blockMessage, "error");
				input.focus();
				return;
			}
			sendBtn.disabled = true;
			try {
				await sendRelayRequest({
					connectionId: conn.id,
					fromTileId: fromTile.id,
					fromLabel: tileLabel(fromTile),
					targetTileId: toTile.id,
					targetSessionId: toTile.ptySessionId ?? null,
					text,
				}, {
					clearInputOnSuccess: true,
					focusInputOnFailure: true,
					targetTile: toTile,
				});
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

		refreshDirLabel();
		popoverEl.appendChild(dirBtn);
		popoverEl.appendChild(endpointHealthEl);
		popoverEl.appendChild(input);
		popoverEl.appendChild(statusEl);
		popoverEl.appendChild(sendBtn);
		popoverEl.appendChild(actionsEl);
		popoverEl.appendChild(historyEl);
		containerEl.appendChild(popoverEl);

		requestAnimationFrame(() => {
			if (!popoverEl) return;
			placePopover(popoverEl, mx, my + 12);
			input.focus();
		});
		refreshHistory();

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
			const selected = el.dataset.connId === selectedConnectionId;
			el.classList.toggle("cable-selected", selected);
			if (el.classList.contains("cable-hit")) {
				el.style.strokeWidth = `${getCableHitStrokeWidth(
					viewportState.zoom,
					{ selected },
				)}px`;
			}
			const state = relayStateByConnection.get(el.dataset.connId) ?? "";
			el.classList.toggle("cable-sending", state === "sending");
			el.classList.toggle("cable-sent", state === "sent");
			el.classList.toggle("cable-failed", state === "failed");
		}
	}

	function drawConnections() {
		pathLayer.replaceChildren();
		labelLayer.replaceChildren();
		hitLayer.replaceChildren();

		const descriptors = getCableRenderDescriptors({
			connectionList: connections,
			tileList: tiles,
			viewport: viewportState,
			selectedConnectionId,
			viewportWidth: containerEl.clientWidth,
			viewportHeight: containerEl.clientHeight,
		});

		for (const descriptor of descriptors) {
			const { conn, tileA, tileB, d, mid, hitStrokeWidth, labelLayout } = descriptor;

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
			hit.style.strokeWidth = `${hitStrokeWidth}px`;

			hit.addEventListener("mouseenter", () => setCableHovered(conn.id, true));
			hit.addEventListener("mouseleave", () => setCableHovered(conn.id, false));
			hit.addEventListener("click", (e) => {
				e.stopPropagation();
				showPopover(conn, mid.x, mid.y, tileA, tileB, getLocalPoint(e));
			});
			hit.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showContextMenu(conn, e.clientX, e.clientY);
			});
			hitLayer.appendChild(hit);

			// Label
			if (labelLayout) {
				const group = document.createElementNS(SVG_NS, "g");
				group.setAttribute("class", "cable-label-group");
				group.setAttribute("data-conn-id", conn.id);
				const bg = document.createElementNS(SVG_NS, "rect");
				bg.setAttribute("x", labelLayout.x);
				bg.setAttribute("y", labelLayout.y);
				bg.setAttribute("width", labelLayout.width);
				bg.setAttribute("height", labelLayout.height);
				bg.setAttribute("rx", "5");
				bg.setAttribute("class", "cable-label-bg");
				const txt = document.createElementNS(SVG_NS, "text");
				txt.setAttribute("x", labelLayout.textX);
				txt.setAttribute("y", labelLayout.textY);
				txt.setAttribute("class", "cable-label");
				txt.textContent = labelLayout.text;
				if (labelLayout.text !== conn.label) {
					const title = document.createElementNS(SVG_NS, "title");
					title.textContent = conn.label;
					group.appendChild(title);
				}
				group.appendChild(bg);
				group.appendChild(txt);
				labelLayer.appendChild(group);
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

	function openContextMenu(connectionId, clientX, clientY) {
		const conn = connections.find((item) => item.id === connectionId);
		if (!conn) return null;
		showContextMenu(conn, clientX, clientY);
		return conn;
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
		openContextMenu,
		pulseCable,
		destroy,
	};
}
