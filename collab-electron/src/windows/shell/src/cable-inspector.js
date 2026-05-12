import { connections, tiles } from "./canvas-state.js";
import {
	clampFloatingPosition,
	formatCableEndpointSummary,
	formatCableLogEntry,
	getCableDefaultDirection,
	getCableRelayResultFeedback,
	getCableSendBlockMessage,
	getConnectionPresentation,
	getDirectedCableTiles,
	getRetryCableRelayRequest,
	shouldSubmitCableMessage,
} from "./cable-overlay.js";

export function createCableInspector({
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
	onStateChanged,
}) {
	let popoverEl = null;
	let contextMenuEl = null;
	let selectedConnectionId = null;
	const relayStateByConnection = new Map();

	function emitStateChanged() {
		onStateChanged?.({
			selectedConnectionId,
			relayStateByConnection,
		});
	}

	function removePopover() {
		popoverEl?.remove();
		popoverEl = null;
	}

	function removeContextMenu() {
		contextMenuEl?.remove();
		contextMenuEl = null;
	}

	function tileLabel(tile) {
		return tile?.userTitle || tile?.autoTitle || tile?.id || "Tile";
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
		emitStateChanged();
	}

	function showPopover(conn, mx, my, tileA, tileB, pointer = null) {
		removePopover();
		removeContextMenu();
		selectedConnectionId = conn.id;
		emitStateChanged();

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
			dirBtn.textContent = direction === "AtoB"
				? `${tileLabel(tileA)} -> ${tileLabel(tileB)}`
				: `${tileLabel(tileB)} -> ${tileLabel(tileA)}`;
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
			setStatus("Sending...", "pending");
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
		labelItem.textContent = "Label...";
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

	function selectConnection(connectionId, { openPopover = true, pointer = null } = {}) {
		const presentation = getConnectionPresentation(
			connectionId,
			connections,
			tiles,
			viewportState,
		);
		if (!presentation) return null;

		const { conn, tileA, tileB, mid } = presentation;
		selectedConnectionId = conn.id;
		emitStateChanged();

		if (openPopover) {
			showPopover(conn, mid.x, mid.y, tileA, tileB, pointer);
		}

		return { connection: conn, tileA, tileB, mid };
	}

	function openContextMenu(connectionId, clientX, clientY) {
		const conn = connections.find((item) => item.id === connectionId);
		if (!conn) return null;
		showContextMenu(conn, clientX, clientY);
		return conn;
	}

	function pulseCable(connectionId) {
		const nodes = containerEl.querySelectorAll(
			`#cable-layer-content [data-cable-id="${connectionId}"] .cable-main, #cable-layer-content [data-cable-id="${connectionId}"] .cable-flow`,
		);
		for (const node of nodes) {
			node.classList.remove("cable-pulse");
			void node.offsetWidth;
			node.classList.add("cable-pulse");
			setTimeout(() => node.classList.remove("cable-pulse"), 650);
		}
	}

	function destroy() {
		removePopover();
		removeContextMenu();
	}

	return {
		selectConnection,
		openContextMenu,
		pulseCable,
		destroy,
		getSelectedConnectionId: () => selectedConnectionId,
		getRelayState: (connectionId) => relayStateByConnection.get(connectionId) ?? null,
	};
}
