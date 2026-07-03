import {
	tiles, addTile, removeTile, getTile, bringToFront,
	generateId, defaultSize, inferTileType, snapToGrid,
	selectTile, deselectTile, toggleTileSelection,
	clearSelection, isSelected, getSelectedTiles,
	connections, getConnectionsForTile, removeConnection,
	normalizeConnection,
} from "./canvas-state.js";
import {
	createTileDOM, positionTile, updateTileTitle, getTileLabel,
	startInlineRename,
} from "./tile-renderer.js";
import { toCollabFileUrl } from "@collab/shared/collab-file-url";
import { workspaceRootMatch } from "@collab/shared/path-utils";
import { attachDrag, attachResize } from "./tile-interactions.js";
import { shouldForwardCableDrawMouseDown } from "./cable-draw-mode.js";
import { findAutoPlacement } from "./canvas-rpc.js";
import { ensureRouteHandle } from "./tile-route-handles.js";
import { getRoleStartupWrites } from "./role-startup.js";
import { renderStateCardBack } from "./tile-state-card.js";
import { isOneTruthEnabled } from "./canvas-truth.js";

/**
 * Tile lifecycle manager: creation, deletion, persistence, webview
 * spawning, focus, selection visuals, and canvas save/restore.
 */
export function createTileManager({
	tileLayer, viewportState, configs,
	getAllWebviews, isSpaceHeld,
	onSaveDebounced, onSaveImmediate,
	onNoteSurfaceFocus, onFocusSurface,
	onTerminalSessionCreated,
	onTerminalCwdChanged,
	onTerminalStartFailed,
	onRoleStartupWrite,
	onTerminalTileClosed,
	onTerminalTileResized,
	onTileFocused,
	onTileDblClick,
	onBeforeClose,
	onCloseRejected,
	onReposition,
	onCableMousedown,
	onCablePortMouseDown,
	onConnectionsChanged,
}) {
	/** @type {Map<string, {container: HTMLElement, contentArea: HTMLElement, titleText: HTMLElement, webview?: HTMLElement}>} */
	const tileDOMs = new Map();
	let saveTimer = null;
	let focusedTileId = null;

	// Viewport read-only accessor for tile-interactions
	const viewport = {
		get panX() { return viewportState.panX; },
		get panY() { return viewportState.panY; },
		get zoom() { return viewportState.zoom; },
	};

	// -- Coordinate validation --

	function safeCoord(v) {
		return Number.isFinite(v) ? v : 0;
	}

	async function syncBrowserUrlToKernel(tile, url) {
		if (!isOneTruthEnabled() || !window.kernelApi || tile.type !== "browser") {
			return true;
		}
		const kr = await window.kernelApi.sendCommand(
			"kernel.tile_extension.set",
			{ tileId: tile.id, url },
		);
		return !(kr && kr.ok === false);
	}

	function registerTerminalTileSession(tile) {
		if (tile.type !== "term" || !tile.ptySessionId) return;
		ensureRouteHandle(tile, tiles);
		const label = tile.userTitle || tile.autoTitle || tile.id;
		window.shellApi.stringRegisterTileSession?.(
			tile.id,
			tile.ptySessionId,
			label,
			tile.routeHandle,
			tile.roleStatusParser,
		);
	}

	// -- Canvas persistence --

	function getCanvasStateForSave() {
		return {
			version: 2,
			tiles: tiles.map((t) => ({
				id: t.id,
				type: t.type,
				x: safeCoord(t.x),
				y: safeCoord(t.y),
				width: t.width,
				height: t.height,
				filePath: t.filePath,
				folderPath: t.folderPath,
				workspacePath: t.workspacePath,
				cwd: t.cwd,
				ptySessionId: t.ptySessionId,
				terminalTarget: t.terminalTarget,
				terminalPending: t.terminalPending,
				runtimeTarget: t.runtimeTarget,
				ptyStatus: t.ptyStatus,
				ptyError: t.ptyError,
				herdrPaneId: t.herdrPaneId,
				herdrAgentName: t.herdrAgentName,
				herdrWorkspaceId: t.herdrWorkspaceId,
				herdrTerminalId: t.herdrTerminalId,
				url: t.url,
				zIndex: t.zIndex,
				userTitle: t.userTitle,
				autoTitle: t.autoTitle,
				routeHandle: t.routeHandle,
				roleId: t.roleId,
				roleName: t.roleName,
				roleColor: t.roleColor,
				roleShellKind: t.roleShellKind,
				roleCommandTemplate: t.roleCommandTemplate,
				roleStartupPrompt: t.roleStartupPrompt,
				roleStatusParser: t.roleStatusParser,
				roleStartupSessionId: t.roleStartupSessionId,
				roleStartupPromptSessionId: t.roleStartupPromptSessionId,
			})),
			connections: connections
				.map(normalizeConnection)
				.filter(Boolean),
			viewport: {
				panX: viewportState.panX,
				panY: viewportState.panY,
				zoom: viewportState.zoom,
			},
		};
	}

	function saveCanvasDebounced() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const state = getCanvasStateForSave();
			onConnectionsChanged?.(state.connections);
			onSaveDebounced(state);
		}, 500);
	}

	function saveCanvasImmediate() {
		clearTimeout(saveTimer);
		const state = getCanvasStateForSave();
		onConnectionsChanged?.(state.connections);
		onSaveImmediate(state);
	}

	// -- Tile positioning --

	function repositionAllTiles() {
		for (const tile of tiles) {
			const dom = tileDOMs.get(tile.id);
			if (!dom) continue;
			positionTile(dom.container, tile);
		}
		onReposition?.();
	}

	// -- State Card flip (Goal 4) --
	// Front = live content (terminal/webview); back = the tile's Kernel State
	// Card. Flipping toggles a CSS class; the terminal is hidden, never
	// destroyed, so the live experience is preserved on flip back.
	const flippedTiles = new Set();

	function isTileFlipped(id) {
		return flippedTiles.has(id);
	}

	function setTileFlipped(id, flipped) {
		const dom = tileDOMs.get(id);
		if (!dom) return;
		if (flipped) flippedTiles.add(id);
		else flippedTiles.delete(id);
		dom.container.classList.toggle("tile-flipped", flipped);
		if (flipped) {
			void renderStateCardBack(dom.stateCardBack, id);
		}
	}

	function flipTile(id) {
		setTileFlipped(id, !flippedTiles.has(id));
	}

	// Shift+F: flip every tile together. If any tile is still showing its front,
	// flip them all to the State Card; otherwise flip them all back.
	function flipAllTiles() {
		const target = tiles.some((t) => !flippedTiles.has(t.id));
		for (const t of tiles) setTileFlipped(t.id, target);
	}

	// Live-refresh any flipped tile when its Kernel State Card changes.
	function refreshFlippedStateCard(tileId) {
		if (!flippedTiles.has(tileId)) return;
		const dom = tileDOMs.get(tileId);
		if (dom) void renderStateCardBack(dom.stateCardBack, tileId);
	}

	// -- Drag/resize commit: Kernel write gate --
	// The live drag/resize in tile-interactions.js is provisional UI only. On
	// mouseup the manager awaits Kernel acceptance before the new position/size
	// is committed (repositioned + saved). On rejection the tile reverts to the
	// previous Kernel-backed values.
	// intent -> Kernel command -> Kernel write -> event -> renderer commit.
	async function commitTileMoves(movedTiles) {
		if (window.kernelApi) {
			for (const m of movedTiles) {
				const kr = await window.kernelApi.sendCommand("kernel.tile.move", {
					id: m.tile.id, x: m.tile.x, y: m.tile.y,
				});
				if (kr && kr.ok === false) {
					m.tile.x = m.prevX;
					m.tile.y = m.prevY;
				}
			}
		}
		repositionAllTiles();
		saveCanvasImmediate();
	}

	async function commitTileResize(tile, prev) {
		if (window.kernelApi) {
			let rejected = false;
			// N/W resize also moves x/y. Gate the move first so Kernel never
			// disagrees with saved renderer position.
			const moved = tile.x !== prev.x || tile.y !== prev.y;
			let moveAccepted = false;
			if (moved) {
				const km = await window.kernelApi.sendCommand("kernel.tile.move", {
					id: tile.id, x: tile.x, y: tile.y,
				});
				if (km && km.ok === false) rejected = true;
				else moveAccepted = true;
			}
			if (!rejected) {
				const kr = await window.kernelApi.sendCommand("kernel.tile.resize", {
					id: tile.id, width: tile.width, height: tile.height,
				});
				if (kr && kr.ok === false) rejected = true;
			}
			if (rejected) {
				// Defensive: if the move was accepted but a later step failed,
				// resync Kernel back to the prior position so neither store
				// keeps a value the other rejected. (Both commands target the
				// same row, so this partial case is not reachable in practice.)
				if (moveAccepted) {
					await window.kernelApi.sendCommand("kernel.tile.move", {
						id: tile.id, x: prev.x, y: prev.y,
					});
				}
				tile.x = prev.x;
				tile.y = prev.y;
				tile.width = prev.width;
				tile.height = prev.height;
			}
		}
		repositionAllTiles();
		saveCanvasImmediate();
	}

	// -- Selection visuals --

	function syncSelectionVisuals() {
		for (const [id, dom] of tileDOMs) {
			dom.container.classList.toggle(
				"tile-selected", isSelected(id),
			);
		}
	}

	// -- Focus management --

	function clearTileFocusRing() {
		for (const [, d] of tileDOMs) {
			d.container.classList.remove("tile-focused");
		}
	}

	function blurCanvasTileGuest(id = focusedTileId) {
		if (!id) return;
		const dom = tileDOMs.get(id);
		if (!dom?.webview) return;
		try { dom.webview.send("shell-blur"); } catch { /* noop */ }
		try { dom.webview.blur(); } catch { /* noop */ }
	}

	function forwardClickToWebview(webview, mouseEvent) {
		if (!webview.isConnected) return;
		if (
			typeof webview.isLoading === "function" &&
			webview.isLoading()
		) {
			return;
		}
		const rect = webview.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		const x = Math.round(
			(mouseEvent.clientX - rect.left)
			* (webview.offsetWidth / rect.width),
		);
		const y = Math.round(
			(mouseEvent.clientY - rect.top)
			* (webview.offsetHeight / rect.height),
		);
		if (x < 0 || y < 0) return;
		if (x > webview.offsetWidth || y > webview.offsetHeight) return;
		webview.sendInputEvent({
			type: "mouseDown", x, y, button: "left", clickCount: 1,
		});
		webview.sendInputEvent({
			type: "mouseUp", x, y, button: "left", clickCount: 1,
		});
	}

	function focusCanvasTile(id, mouseEvent) {
		const tile = getTile(id);
		if (tile) {
			bringToFront(tile);
			if (isOneTruthEnabled() && window.kernelApi) {
				void window.kernelApi.sendCommand("kernel.tile.layout_sync", {
					id: tile.id,
					zIndex: tile.zIndex,
				});
			}
			repositionAllTiles();
		}
		const dom = tileDOMs.get(id);
		if (dom && dom.webview) {
			if (focusedTileId && focusedTileId !== id) {
				blurCanvasTileGuest(focusedTileId);
			}
			focusedTileId = id;
			if (onTileFocused) {
				onTileFocused(tile);
			}
			clearTileFocusRing();
			dom.container.classList.add("tile-focused");
			dom.webview.focus();
			onNoteSurfaceFocus("canvas-tile");

			if (
				mouseEvent && mouseEvent.button === 0 &&
				tile.type !== "browser"
			) {
				forwardClickToWebview(dom.webview, mouseEvent);
			}
		}
	}

	// -- Webview spawning --

	function spawnTerminalWebview(tile, autoFocus = false) {
		const dom = tileDOMs.get(tile.id);
		if (!dom) return;

		if (dom.webview?.parentElement) {
			dom.webview.remove();
		}

		const wv = document.createElement("webview");
		const termConfig = configs.terminalTile;
		const params = new URLSearchParams();
		params.set("tileId", tile.id);
		if (tile.ptySessionId) {
			params.set("sessionId", tile.ptySessionId);
			params.set("restored", "1");
		} else if (tile.cwd) {
			params.set("cwd", tile.cwd);
		}
		if (tile.terminalTarget) {
			params.set("target", tile.terminalTarget);
		}
		if (tile.terminalPending) {
			params.set("pending", "1");
		}
		const qs = params.toString();
		wv.setAttribute(
			"src",
			qs ? `${termConfig.src}?${qs}` : termConfig.src,
		);
		wv.setAttribute("preload", termConfig.preload);
		wv.setAttribute(
			"webpreferences", "contextIsolation=yes, sandbox=yes",
		);
		wv.style.width = "100%";
		wv.style.height = "100%";
		wv.style.border = "none";

		dom.contentArea.appendChild(wv);
		dom.webview = wv;

		wv.addEventListener("dom-ready", () => {
			if (autoFocus) focusCanvasTile(tile.id);
			wv.addEventListener("before-input-event", () => {});
		});

		wv.addEventListener("ipc-message", (event) => {
			const currentTile = getTile(tile.id);
			const currentDom = tileDOMs.get(tile.id);
			if (!currentTile || !currentDom) return;

			if (event.channel === "pty-session-id") {
				currentTile.ptySessionId = event.args[0];
				ensureRouteHandle(currentTile, tiles);
				maybeRunRoleStartup(currentTile);
				updateTileTitle(currentDom, currentTile);
				saveCanvasDebounced();
				if (onTerminalSessionCreated) {
					onTerminalSessionCreated(currentTile);
				}
				registerTerminalTileSession(currentTile);
			}
			if (event.channel === "pty-restore-stale") {
				currentTile.ptyStatus = "restoring";
				updateTileTitle(currentDom, currentTile);
			}
			if (event.channel === "pty-start-failed") {
				const payload = event.args[0] || {};
				currentTile.ptyStatus = "error";
				currentTile.ptyError = String(payload.message || "PTY start failed.");
				updateTileTitle(currentDom, currentTile);
				saveCanvasDebounced();
				if (onTerminalStartFailed) {
					onTerminalStartFailed(currentTile, payload);
				}
			}
			if (event.channel === "pty-cwd-changed") {
				const cwd = event.args[1];
				if (cwd && cwd !== currentTile.autoTitle) {
					currentTile.cwd = cwd;
					currentTile.autoTitle = cwd;
					ensureRouteHandle(currentTile, tiles);
					updateTileTitle(currentDom, currentTile);
					saveCanvasDebounced();
					registerTerminalTileSession(currentTile);
					if (onTerminalCwdChanged) {
						onTerminalCwdChanged(cwd);
					}
				}
			}
		});
	}

	function maybeRunRoleStartup(tile) {
		if (tile?.runtimeTarget === "herdr-wsl") return;
		const writes = getRoleStartupWrites(tile);
		if (!writes.length) return;
		const sessionId = tile.ptySessionId;

		for (const write of writes) {
			const send = () => {
				const current = getTile(tile.id);
				if (!current || current.ptySessionId !== sessionId) return;
				if (write.kind === "command") {
					current.roleStartupSessionId = sessionId;
				}
				if (write.kind === "prompt") {
					current.roleStartupPromptSessionId = sessionId;
				}
				try {
					window.shellApi.ptyWrite?.(sessionId, write.data);
					onRoleStartupWrite?.(current, write);
					saveCanvasDebounced();
				} catch (err) {
					onRoleStartupWrite?.(current, write, err);
				}
			};

			if (write.delayMs > 0) {
				setTimeout(send, write.delayMs);
			} else {
				send();
			}
		}
	}

	function spawnGraphWebview(tile) {
		const dom = tileDOMs.get(tile.id);
		if (!dom) return;

		const wv = document.createElement("webview");
		const graphConfig = configs.graphTile;
		const params = new URLSearchParams();
		params.set("folder", tile.folderPath);
		params.set("workspace", tile.workspacePath ?? "");
		const qs = params.toString();
		wv.setAttribute("src", `${graphConfig.src}?${qs}`);
		wv.setAttribute("preload", graphConfig.preload);
		wv.setAttribute(
			"webpreferences", "contextIsolation=yes, sandbox=yes",
		);
		wv.style.width = "100%";
		wv.style.height = "100%";
		wv.style.border = "none";

		dom.contentArea.appendChild(wv);
		dom.webview = wv;
	}

	function spawnBrowserWebview(tile, autoFocus = false) {
		const dom = tileDOMs.get(tile.id);
		if (!dom) return;

		if (!tile.url) {
			if (autoFocus && dom.urlInput) {
				dom.urlInput.focus();
			}
			return;
		}

		let url = tile.url;
		if (!/^https?:\/\//i.test(url)) {
			const isLocal = /^localhost(:|$)/i.test(url) ||
				/^127\.0\.0\.1(:|$)/.test(url);
			url = (isLocal ? "http://" : "https://") + url;
			tile.url = url;
		}
		const blocked = /^(javascript|file|data):/i;
		if (blocked.test(url)) return;

		const wv = document.createElement("webview");
		wv.setAttribute("src", url);
		wv.setAttribute("allowpopups", "");
		wv.setAttribute("partition", "persist:browser");
		wv.setAttribute(
			"webpreferences", "contextIsolation=yes, sandbox=yes",
		);
		wv.style.width = "100%";
		wv.style.height = "100%";
		wv.style.border = "none";

		dom.contentArea.appendChild(wv);
		dom.webview = wv;

		const stopSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
		const reloadSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3v4h-4"/><path d="M12.36 10a5 5 0 1 1-.96-5.36L13 7"/></svg>`;

		function updateNavState() {
			if (dom.navBack) {
				dom.navBack.disabled = !wv.canGoBack();
			}
			if (dom.navForward) {
				dom.navForward.disabled = !wv.canGoForward();
			}
		}

		// Replace buttons with clones to strip stale listeners
		for (const key of ["navBack", "navForward", "navReload"]) {
			if (dom[key]) {
				const fresh = dom[key].cloneNode(true);
				dom[key].replaceWith(fresh);
				dom[key] = fresh;
			}
		}

		if (dom.navBack) {
			dom.navBack.addEventListener("click", (e) => {
				e.stopPropagation();
				if (wv.canGoBack()) wv.goBack();
			});
		}
		if (dom.navForward) {
			dom.navForward.addEventListener("click", (e) => {
				e.stopPropagation();
				if (wv.canGoForward()) wv.goForward();
			});
		}
		if (dom.navReload) {
			dom.navReload.addEventListener("click", (e) => {
				e.stopPropagation();
				if (wv.isLoading()) {
					wv.stop();
				} else {
					wv.reload();
				}
			});
		}

		wv.addEventListener("dom-ready", () => {
			wv.setZoomFactor(0.95);
		});

		function clearErrors() {
			for (const el of [
				...dom.contentArea.querySelectorAll(".tile-load-error"),
			]) {
				el.remove();
			}
		}

		wv.addEventListener("did-start-loading", () => {
			clearErrors();
			wv.style.display = "";
			if (dom.navReload) {
				dom.navReload.innerHTML = stopSvg;
				dom.navReload.title = "Stop";
			}
		});

		wv.addEventListener("did-stop-loading", () => {
			if (dom.navReload) {
				dom.navReload.innerHTML = reloadSvg;
				dom.navReload.title = "Reload";
			}
			updateNavState();
		});

		wv.addEventListener("did-navigate", (e) => {
			tile.url = e.url;
			void syncBrowserUrlToKernel(tile, e.url);
			if (dom.urlInput) dom.urlInput.value = e.url;
			updateTileTitle(dom, tile);
			updateNavState();
			saveCanvasDebounced();
		});

		wv.addEventListener("did-navigate-in-page", (e) => {
			if (e.isMainFrame) {
				tile.url = e.url;
				void syncBrowserUrlToKernel(tile, e.url);
				if (dom.urlInput) dom.urlInput.value = e.url;
				updateTileTitle(dom, tile);
				updateNavState();
				saveCanvasDebounced();
			}
		});

		wv.addEventListener("did-fail-load", (e) => {
			if (e.errorCode === -3) return;
			if (!e.isMainFrame) return;
			clearErrors();
			wv.style.display = "none";
			const errDiv = document.createElement("div");
			errDiv.className = "tile-load-error";
			errDiv.style.cssText =
				"padding:20px;color:#888;font-size:13px;";
			errDiv.textContent =
				`Failed to load: ${e.validatedURL || tile.url}`;
			dom.contentArea.appendChild(errDiv);
		});

		wv.addEventListener("render-process-gone", () => {
			const crashDiv = document.createElement("div");
			crashDiv.style.cssText =
				"padding:20px;color:#888;font-size:13px;";
			crashDiv.textContent =
				"Page crashed. Edit the URL and press Enter to reload.";
			if (dom.webview) {
				dom.contentArea.removeChild(dom.webview);
				dom.webview = null;
			}
			dom.contentArea.appendChild(crashDiv);
		});

		if (autoFocus) {
			wv.addEventListener(
				"dom-ready", () => focusCanvasTile(tile.id),
			);
		}
	}

	// -- Tile CRUD --

	// kernelMode:
	//   'gate'    — manual/MCP intent. Kernel must accept the create before the
	//               tile becomes canonical; on rejection the provisional tile is
	//               rolled back (before any DOM/webview/save) and null returned.
	//   'hydrate' — restore from saved JSON. Kernel create is awaited as an
	//               idempotent hydration of already-canonical state; the tile is
	//               kept regardless so a Kernel hiccup never drops a restore.
	async function createCanvasTile(type, cx, cy, extra = {}, { kernelMode = "gate" } = {}) {
		const size = defaultSize(type);
		// Provisional local tile: snapped first so the Kernel record and the
		// renderer agree on the committed position. Not yet rendered or saved.
		const tile = addTile({
			id: extra.id || generateId(),
			type,
			x: cx,
			y: cy,
			width: extra.width || size.width,
			height: extra.height || size.height,
			...extra,
		});
		ensureRouteHandle(tile, tiles);
		snapToGrid(tile);

		// Kernel write gate: intent -> Kernel command -> Kernel write -> event.
		if (window.kernelApi) {
			const kr = await window.kernelApi.sendCommand("kernel.tile.create", {
				id: tile.id,
				displayName: tile.userTitle || tile.type,
				tileKind: "worker",
				x: tile.x,
				y: tile.y,
				width: tile.width,
				height: tile.height,
			});
			if (kernelMode === "gate" && kr && kr.ok === false) {
				// Reliable rollback before any DOM/webview/save commits.
				removeTile(tile.id);
				return null;
			}
			if (isOneTruthEnabled()) {
				const extPayload = { tileId: tile.id, canvasType: type };
				if (tile.filePath !== undefined) extPayload.filePath = tile.filePath;
				if (tile.folderPath !== undefined) extPayload.folderPath = tile.folderPath;
				if (tile.url !== undefined) extPayload.url = tile.url;
				if (tile.workspacePath !== undefined) {
					extPayload.workspacePath = tile.workspacePath;
				}
				if (tile.terminalTarget !== undefined) {
					extPayload.terminalTarget = tile.terminalTarget;
				}
				if (tile.runtimeTarget !== undefined) {
					extPayload.runtimeTarget = tile.runtimeTarget;
				}
				if (tile.userTitle !== undefined) extPayload.userTitle = tile.userTitle;
				if (tile.autoTitle !== undefined) extPayload.autoTitle = tile.autoTitle;
				if (tile.routeHandle !== undefined) extPayload.routeHandle = tile.routeHandle;
				if (tile.herdrAgentName !== undefined) {
					extPayload.herdrAgentName = tile.herdrAgentName;
				}
				if (tile.herdrWorkspaceId !== undefined) {
					extPayload.herdrWorkspaceId = tile.herdrWorkspaceId;
				}
				await window.kernelApi.sendCommand(
					"kernel.tile_extension.set",
					extPayload,
				);
			}
		}

		window.shellApi.trackEvent("tile_created", { type });

		const dom = createTileDOM(tile, {
			onClose: async (id, event) => {
				try {
					const closed = await requestCloseCanvasTile(id, { event });
					if (!closed) return;
				} catch (err) {
					const current = getTile(id);
					const isHerdr = current?.runtimeTarget === "herdr-wsl";
					onCloseRejected?.(
						isHerdr ? "Could not close Herdr tile" : "Could not close tile",
						"error",
					);
					console.warn("[tile] close failed:", err);
				}
			},
			onFocus: (id, e) => {
				if (e && e.shiftKey) {
					toggleTileSelection(id);
					syncSelectionVisuals();
					return;
				}
				clearSelection();
				syncSelectionVisuals();
				focusCanvasTile(id, e);
			},
			onOpenInViewer: (id) => {
				const t = getTile(id);
				if (t?.filePath) {
					window.shellApi.trackEvent(
						"tile_opened_in_viewer", { type: t.type },
					);
					window.shellApi.selectFile(t.filePath);
				}
			},
			onNavigate: async (id, url) => {
				const t = getTile(id);
				if (!t || t.type !== "browser") return;
				t.url = url;
				if (!(await syncBrowserUrlToKernel(t, url))) return;
				const d = tileDOMs.get(id);
				if (d?.webview) {
					d.contentArea.removeChild(d.webview);
					d.webview = null;
				}
				spawnBrowserWebview(t);
				saveCanvasImmediate();
			},
			onDuplicate: async (id) => {
				const t = getTile(id);
				if (!t) return;
				const gap = 40;
				const newTile = await createCanvasTile("term", t.x + t.width + gap, t.y, {
					cwd: t.cwd,
					width: t.width,
					height: t.height,
				});
				if (!newTile) return; // Kernel rejected the create
				spawnTerminalWebview(newTile, true);
				saveCanvasImmediate();
			},
			onRename: (id) => {
				const t = getTile(id);
				const d = tileDOMs.get(id);
				if (!t || !d) return;
				startInlineRename(d, t, (newTitle) => {
					void applyTileUserTitle(t, newTitle, d);
				});
			},
			onCablePortMouseDown,
			onFlip: (id) => flipTile(id),
		});

		// Double-click title bar → center tile in viewport
		dom.titleBar.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			if (onTileDblClick) onTileDblClick(tile);
		});

		attachDrag(dom.titleBar, tile, {
			viewport,
			onUpdate: repositionAllTiles,
			disablePointerEvents: (wvs) => {
				for (const w of wvs) {
					w.webview.style.pointerEvents = "none";
				}
			},
			enablePointerEvents: (wvs) => {
				for (const w of wvs) {
					w.webview.style.pointerEvents = "";
				}
			},
			getAllWebviews,
			getGroupDragContext: () => {
				if (
					!isSelected(tile.id) ||
					getSelectedTiles().length <= 1
				) {
					return null;
				}
				return getSelectedTiles().map((t) => ({
					tile: t,
					container: tileDOMs.get(t.id)?.container,
					startX: t.x,
					startY: t.y,
				}));
			},
			onShiftClick: (id) => {
				toggleTileSelection(id);
				syncSelectionVisuals();
			},
			onFocus: (id, e) => focusCanvasTile(id, e),
			isSpaceHeld,
			contentOverlay: dom.contentOverlay,
			onCommit: commitTileMoves,
		});
		attachResize(
			dom.container, tile, viewport,
			repositionAllTiles,
			getAllWebviews,
			() => focusCanvasTile(tile.id),
			(t) => {
				if (t.type === "term" && onTerminalTileResized) {
					onTerminalTileResized(t.width, t.height);
				}
			},
			commitTileResize,
		);

		// Cable draw: intercept mousedown before drag fires
		if (onCableMousedown) {
			dom.container.addEventListener("mousedown", (e) => {
				if (!shouldForwardCableDrawMouseDown(e)) return;
				onCableMousedown(tile, e);
			}, { capture: true });
		}

		tileLayer.appendChild(dom.container);
		tileDOMs.set(tile.id, dom);
		positionTile(dom.container, tile);

		return tile;
	}

	async function closeCanvasTile(id) {
		// Kernel write gate: associated connections, then the tile, must be
		// accepted as removed before canonical local state is torn down.
		// intent -> Kernel command -> Kernel write -> event -> local removal.
		if (window.kernelApi) {
			for (const conn of getConnectionsForTile(id)) {
				const connResult = await window.kernelApi.sendCommand(
					"kernel.connection.delete", { id: conn.id },
				);
				if (connResult && connResult.ok === false) {
					onCloseRejected?.(
						`Tile close rejected by Kernel: ${connResult.error ?? "connection delete rejected"}`,
						"warn",
					);
					return false;
				}
			}
			const kr = await window.kernelApi.sendCommand(
				"kernel.tile.remove", { id },
			);
			if (kr && kr.ok === false) {
				onCloseRejected?.(
					`Tile close rejected by Kernel: ${kr.error ?? "remove rejected"}`,
					"warn",
				);
				return false; // Kernel rejected - keep tile
			}
		}

		const dom = tileDOMs.get(id);
		if (dom) {
			dom.container.remove();
			tileDOMs.delete(id);
		}
		deselectTile(id);
		const tile = getTile(id);
		if (tile) {
			window.shellApi.trackEvent(
				"tile_closed", { type: tile.type },
			);
			if (tile.type === "term" && tile.ptySessionId) {
				// For herdr-backed tiles the terminal PTY is only a display
				// bridge into the herdr pane. Killing the bridge alone leaves the
				// pane/agent running (it stays in herdr's space list). Mirror the
				// manual Ctrl+C: interrupt the agent through the PTY so the pane
				// actually stops, unlink status tracking, then detach.
				if (tile.runtimeTarget === "herdr-wsl") {
					try {
						window.shellApi.ptyWrite(tile.ptySessionId, "\x03");
					} catch (err) {
						console.warn("[herdr] interrupt-on-close failed:", err);
					}
					window.shellApi.herdrUnlinkPane?.(tile.id);
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
				window.shellApi.ptyKillSession(tile.ptySessionId);
				window.shellApi.stringUnregisterTileSession?.(tile.id);
				if (onTerminalTileClosed) {
					onTerminalTileClosed(tile.ptySessionId);
				}
			}
		}
		for (const conn of getConnectionsForTile(id)) {
			removeConnection(conn.id);
		}
		flippedTiles.delete(id);
		removeTile(id);
		onReposition?.();
		saveCanvasImmediate();
		return true;
	}

	async function requestCloseCanvasTile(id, options = {}) {
		const tile = getTile(id);
		if (tile && onBeforeClose) {
			const allowed = await onBeforeClose(tile, options);
			if (!allowed) return false;
		}
		return closeCanvasTile(id);
	}

	async function createFileTile(type, cx, cy, filePath, extra = {}, opts = {}) {
		const tile = await createCanvasTile(type, cx, cy, { ...extra, filePath }, opts);
		if (!tile) return null; // Kernel rejected the create
		const dom = tileDOMs.get(tile.id);
		if (!dom) return tile;

		if (type === "pdf") {
			const wv = document.createElement("webview");
			wv.setAttribute("src", toCollabFileUrl(filePath));
			wv.setAttribute("webpreferences", "contextIsolation=yes, sandbox=yes");
			wv.style.width = "100%";
			wv.style.height = "100%";
			wv.style.border = "none";
			dom.contentArea.appendChild(wv);
			dom.webview = wv;
		} else if (type === "image") {
			const img = document.createElement("img");
			img.src = toCollabFileUrl(filePath);
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.objectFit = "contain";
			img.draggable = false;
			dom.contentArea.appendChild(img);
		} else {
			const wv = document.createElement("webview");
			const viewerConfig = configs.viewer;
			const mode = type === "note" ? "note" : "code";
			wv.setAttribute(
				"src",
				`${viewerConfig.src}?tilePath=${encodeURIComponent(filePath)}&tileMode=${mode}`,
			);
			wv.setAttribute("preload", viewerConfig.preload);
			wv.setAttribute(
				"webpreferences",
				"contextIsolation=yes, sandbox=yes",
			);
			wv.style.width = "100%";
			wv.style.height = "100%";
			wv.style.border = "none";

			dom.contentArea.appendChild(wv);
			dom.webview = wv;

			wv.addEventListener("dom-ready", () => {});
		}

		saveCanvasImmediate();
		return tile;
	}

	async function createGraphTile(cx, cy, folderPath, workspacePath) {
		const tile = await createCanvasTile("graph", cx, cy, {
			folderPath, workspacePath,
		});
		if (!tile) return null; // Kernel rejected the create
		spawnGraphWebview(tile);
		saveCanvasImmediate();
		return tile;
	}

	async function clearCanvas(viewportObj) {
		const tileIds = tiles.map((t) => t.id);
		for (const id of tileIds) {
			await closeCanvasTile(id);
		}
		viewportState.panX = 0;
		viewportState.panY = 0;
		viewportState.zoom = 1;
		viewportObj.updateCanvas();
		saveCanvasImmediate();
	}

	// -- Canvas state restore --

	async function restoreCanvasState(savedTiles) {
		for (const saved of savedTiles) {
			let cx = saved.x;
			let cy = saved.y;
			if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
				const size = defaultSize(saved.type);
				const pos = findAutoPlacement(
					tiles, size.width, size.height,
				);
				cx = pos.x;
				cy = pos.y;
			}

			if (saved.type === "term") {
				const tile = await createCanvasTile(
					"term", cx, cy, {
						id: saved.id,
						width: saved.width,
						height: saved.height,
						zIndex: saved.zIndex,
						cwd: saved.cwd,
						ptySessionId: saved.ptySessionId,
						terminalTarget: saved.terminalTarget,
						terminalPending: saved.terminalPending,
						runtimeTarget: saved.runtimeTarget,
						ptyStatus: saved.ptyStatus,
						ptyError: saved.ptyError,
						herdrPaneId: saved.herdrPaneId,
						herdrAgentName: saved.herdrAgentName,
						herdrWorkspaceId: saved.herdrWorkspaceId,
						herdrTerminalId: saved.herdrTerminalId,
						userTitle: saved.userTitle,
						autoTitle: saved.autoTitle,
						routeHandle: saved.routeHandle,
						roleId: saved.roleId,
						roleName: saved.roleName,
						roleColor: saved.roleColor,
						roleShellKind: saved.roleShellKind,
						roleCommandTemplate: saved.roleCommandTemplate,
						roleStartupPrompt: saved.roleStartupPrompt,
						roleStatusParser: saved.roleStatusParser,
						roleStartupSessionId: saved.roleStartupSessionId,
						roleStartupPromptSessionId: saved.roleStartupPromptSessionId,
					},
					{ kernelMode: "hydrate" },
				);
				if (tile) spawnTerminalWebview(tile);
			} else if (saved.type === "graph" && saved.folderPath) {
				const tile = await createCanvasTile(
					"graph", cx, cy, {
						id: saved.id,
						width: saved.width,
						height: saved.height,
						zIndex: saved.zIndex,
						folderPath: saved.folderPath,
						workspacePath: saved.workspacePath,
					},
					{ kernelMode: "hydrate" },
				);
				if (tile) spawnGraphWebview(tile);
			} else if (saved.type === "browser") {
				const tile = await createCanvasTile(
					"browser", cx, cy, {
						id: saved.id,
						width: saved.width,
						height: saved.height,
						zIndex: saved.zIndex,
						url: saved.url,
					},
					{ kernelMode: "hydrate" },
				);
				if (tile) spawnBrowserWebview(tile);
			} else if (saved.filePath) {
				await createFileTile(
					saved.type, cx, cy, saved.filePath, {
						id: saved.id,
						width: saved.width,
						height: saved.height,
						zIndex: saved.zIndex,
					},
					{ kernelMode: "hydrate" },
				);
			}
		}
	}

	// -- Tile updates for external events --

	async function updateTileForRename(oldPath, newPath) {
		let anyUpdated = false;
		const kernelUpdates = [];
		for (const t of tiles) {
			if (t.filePath === oldPath) {
				t.filePath = newPath;
				t.type = inferTileType(newPath);
				const dom = tileDOMs.get(t.id);
				if (dom) updateTileTitle(dom, t);
				anyUpdated = true;
				if (isOneTruthEnabled()) {
					kernelUpdates.push({
						tileId: t.id,
						filePath: t.filePath,
						canvasType: t.type,
					});
				}
			}
			if (
				t.type === "graph" && t.folderPath &&
				workspaceRootMatch(oldPath, t.folderPath)
			) {
				t.folderPath =
					newPath + t.folderPath.slice(oldPath.length);
				const dom = tileDOMs.get(t.id);
				if (dom) {
					updateTileTitle(dom, t);
					if (dom.webview) {
						dom.webview.send(
							"scope-changed", t.folderPath,
						);
					}
				}
				anyUpdated = true;
				if (isOneTruthEnabled()) {
					kernelUpdates.push({
						tileId: t.id,
						folderPath: t.folderPath,
					});
				}
			}
		}
		if (anyUpdated) {
			if (isOneTruthEnabled() && window.kernelApi) {
				for (const payload of kernelUpdates) {
					await window.kernelApi.sendCommand(
						"kernel.tile_extension.set",
						payload,
					);
				}
			}
			saveCanvasDebounced();
		}
	}

	async function closeTilesForDeletedPaths(deletedPaths) {
		const deleted = new Set(deletedPaths);
		for (const t of [...tiles]) {
			if (t.filePath && deleted.has(t.filePath)) {
				await closeCanvasTile(t.id);
			}
			if (
				t.type === "graph" && t.folderPath &&
				deleted.has(t.folderPath)
			) {
				await closeCanvasTile(t.id);
			}
		}
	}

	function broadcastToTileWebviews(channel, ...args) {
		for (const [, dom] of tileDOMs) {
			if (dom.webview) dom.webview.send(channel, ...args);
		}
	}

	function renameTile(id, newTitle) {
		const t = getTile(id);
		if (!t) return;
		const d = tileDOMs.get(id);
		void applyTileUserTitle(t, newTitle, d);
	}

	async function applyTileUserTitle(t, newTitle, dom) {
		if (newTitle === "") {
			delete t.userTitle;
		} else {
			t.userTitle = newTitle;
		}
		if (isOneTruthEnabled() && window.kernelApi) {
			await window.kernelApi.sendCommand("kernel.tile_extension.set", {
				tileId: t.id,
				userTitle: newTitle === "" ? null : newTitle,
			});
			if (newTitle !== "") {
				await window.kernelApi.sendCommand("kernel.tile.rename", {
					id: t.id,
					displayName: newTitle,
				});
			}
		}
		if (dom) updateTileTitle(dom, t);
		saveCanvasImmediate();
		registerTerminalTileSession(t);
	}

	return {
		createCanvasTile,
		closeCanvasTile,
		requestCloseCanvasTile,
		focusCanvasTile,
		blurCanvasTileGuest,
		clearTileFocusRing,
		repositionAllTiles,
		flipTile,
		flipAllTiles,
		isTileFlipped,
		refreshFlippedStateCard,
		syncSelectionVisuals,
		spawnTerminalWebview,
		spawnGraphWebview,
		spawnBrowserWebview,
		createFileTile,
		createGraphTile,
		clearCanvas,
		getCanvasStateForSave,
		restoreCanvasState,
		getTileDOMs: () => tileDOMs,
		getFocusedTileId: () => focusedTileId,
		setFocusedTileId: (id) => { focusedTileId = id; },
		renameTile,
		updateTileForRename,
		closeTilesForDeletedPaths,
		broadcastToTileWebviews,
		saveCanvasDebounced,
		saveCanvasImmediate,
	};
}
