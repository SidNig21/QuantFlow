import "./shell.css";
import "./tooltip.js";
import {
	tiles, connections, getTile, defaultSize, inferTileType, tileAtPoint,
	selectTile, clearSelection, getSelectedTiles, getNearestTileInDirection,
	addConnection, removeConnection, updateConnectionLabel, clearConnections,
} from "./canvas-state.js";
import { attachMarquee } from "./tile-interactions.js";
import { initDarkMode, applyCanvasOpacity } from "./dark-mode.js";
import { createWebview, isFocusSearchShortcut } from "./webview-factory.js";
import { createViewport } from "./canvas-viewport.js";
import { createEdgeIndicators } from "./edge-indicators.js";
import { createMinimap } from "./canvas-minimap.js";
import { createPanel } from "./panel-manager.js";
import { createWorkspaceManager } from "./workspace-manager.js";
import {
	createCanvasRpc,
	createConnectionLabelEvent,
	createConnectionMutationEvent,
	createTerminalReadFailureEvent,
	createTerminalWriteFailureEvent,
} from "./canvas-rpc.js";
import { createTileManager } from "./tile-manager.js";
import { createToastController } from "./toast-controller.js";
import { createOperationalEventLog } from "./operational-event-log.js";
import { resolveCableDrop } from "./cable-drop.js";
import {
	formatContextPreviewDetail,
	updateTileTitle,
	getTileLabel,
} from "./tile-renderer.js";
import { createCableOverlay, formatCableContextRelay } from "./cable-overlay.js";
import {
	WATCHTOWER_AGENT_FILTERS,
	WATCHTOWER_EVENT_FILTERS,
	WATCHTOWER_MESSAGE_FILTERS,
	createConnectionCounts,
	formatWatchtowerDiagnostics,
	formatWatchtowerFilterLabel,
	getWatchtowerFocusPlan,
	getWatchtowerRetryRequest,
	renderWatchtowerAgents,
	renderWatchtowerAttention,
	renderWatchtowerEvents,
	renderWatchtowerMessages,
} from "./watchtower-view.js";
import {
	createPtyStartFailureDiagnostic,
	normalizeLaunchDiagnostic,
	renderLaunchDiagnostics,
} from "./launch-diagnostics-view.js";
import { formatRoleStartupEvent } from "./role-startup.js";

const CANVAS_DBLCLICK_SUPPRESS_MS = 500;
const IS_WINDOWS = window.shellApi.getPlatform() === "win32";

const viewportState = { panX: 0, panY: 0, zoom: 1 };

const canvasEl = document.getElementById("panel-viewer");
const gridCanvas = document.getElementById("grid-canvas");
canvasEl.tabIndex = -1;
const toasts = createToastController({ document });
const operationalEvents = createOperationalEventLog({ limit: 120 });

document.documentElement.classList.toggle("platform-win", IS_WINDOWS);
document.body.classList.toggle("platform-win", IS_WINDOWS);

// -- Alpha banner dismiss --

document.getElementById("alpha-dismiss").addEventListener("click", (e) => {
	e.preventDefault();
	document.getElementById("alpha-label").hidden = true;
});

// -- Dark mode --

initDarkMode(() => viewport.updateCanvas());

let broadcastCanvasOpacity = () => {};
const DEFAULT_CANVAS_OPACITY = 50;
let lastCanvasOpacity = DEFAULT_CANVAS_OPACITY;

window.shellApi.getPref("canvasOpacity").then((v) => {
	lastCanvasOpacity = v != null ? v : DEFAULT_CANVAS_OPACITY;
	applyCanvasOpacity(lastCanvasOpacity);
	broadcastCanvasOpacity();
});

window.shellApi.onPrefChanged((key, value) => {
	if (key === "canvasOpacity") {
		lastCanvasOpacity = value;
		applyCanvasOpacity(value);
		broadcastCanvasOpacity();
	}
});

// -- Viewport --

const viewport = createViewport(canvasEl, gridCanvas, tiles);

/** Convert in-memory panX/panY state to a center-point for persistence. */
function toCenterPointState(state) {
	const { panX, panY, zoom } = state.viewport;
	const w = canvasEl.clientWidth;
	const h = canvasEl.clientHeight;
	return {
		...state,
		viewport: {
			centerX: (w / 2 - panX) / zoom,
			centerY: (h / 2 - panY) / zoom,
			zoom,
		},
	};
}

// -- Init --

async function init() {
	const [
		configs, workspaceData,
		prefNavWidth, prefSidebarMode,
		prefAgentWidth, prefAgentMode,
		prefAgentPty, prefSidebarAgentGui,
		prefLastTerminalCwd,
		prefLastTerminalSize,
	] = await Promise.all([
		window.shellApi.getViewConfig(),
		window.shellApi.workspaceList(),
		window.shellApi.getPref("panel-width-nav"),
		window.shellApi.getPref("sidebar-mode"),
		window.shellApi.getPref("panel-width-agent"),
		window.shellApi.getPref("sidebar-mode-agent"),
		window.shellApi.getPref("agent-pty-session"),
		window.shellApi.getPref("sidebar-agent-gui"),
		window.shellApi.getPref("lastTerminalCwd"),
		window.shellApi.getPref("lastTerminalSize"),
	]);

	let lastTerminalCwd = prefLastTerminalCwd || null;
	let lastTerminalSize = prefLastTerminalSize || null;

	function getTerminalCwd() {
		return lastTerminalCwd || workspaceData.workspaces[0];
	}

	function setLastTerminalCwd(cwd) {
		lastTerminalCwd = cwd;
		window.shellApi.setPref("lastTerminalCwd", cwd);
	}

	function getTerminalSize() {
		if (lastTerminalSize) return { ...lastTerminalSize };
		return defaultSize("term");
	}

	function setLastTerminalSize(width, height) {
		lastTerminalSize = { width, height };
		window.shellApi.setPref("lastTerminalSize", lastTerminalSize);
	}

	function getRoleCommandName(role) {
		const template = String(role?.commandTemplate ?? "").trim();
		if (!template) return null;
		const match = template.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
		return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
	}

	function isMissingRoleCommand(role) {
		return Boolean(role?.commandTemplate && role.commandAvailable === false);
	}

	function formatRoleMenuLabel(role) {
		const command = getRoleCommandName(role);
		const suffix = isMissingRoleCommand(role)
			? ` (missing: ${command})`
			: command ? ` (${command})` : "";
		return `${role.name} — ${role.description}${suffix}`;
	}

	function normalizeRoleTerminalTarget(defaultShell) {
		if (defaultShell === "powershell" || defaultShell === "shell") {
			return defaultShell;
		}
		return undefined;
	}

	function tileEventLabel(tile) {
		if (!tile) return "unknown";
		const label = getTileLabel(tile);
		return label.name || tile.userTitle || tile.autoTitle || tile.id;
	}

	function recordRelayOperationalEvent(result, request, fallbackError = null) {
		const ok = result?.ok === true && !fallbackError;
		const fromLabel = request?.fromLabel || request?.fromTileId || "unknown";
		const targetLabel = request?.targetLabel || request?.targetTileId || "unresolved";
		operationalEvents.record({
			type: ok ? "relay.sent" : "relay.failed",
			severity: ok ? "info" : "error",
			summary: ok
				? `Relay sent: ${fromLabel} -> ${targetLabel}`
				: `Relay failed: ${result?.message || fallbackError || "Unknown relay failure"}`,
			detail: `${fromLabel} -> ${targetLabel}`,
			meta: {
				connectionId: request?.connectionId,
				eventId: result?.eventId,
				fromTileId: request?.fromTileId,
				targetTileId: request?.targetTileId,
				errorCode: result?.errorCode,
			},
		});
	}

	const launchDiagnostics = new Map();
	const launchDiagnosticsEl = document.createElement("div");
	launchDiagnosticsEl.id = "launch-diagnostics";
	launchDiagnosticsEl.hidden = true;
	document.body.appendChild(launchDiagnosticsEl);

	function syncLaunchDiagnosticsOverlay() {
		const items = [...launchDiagnostics.values()];
		launchDiagnosticsEl.hidden = items.length === 0;
		launchDiagnosticsEl.innerHTML = renderLaunchDiagnostics(items);
	}

	async function copyLaunchDiagnosticCommand(diagnostic) {
		if (!diagnostic.fixCommand) {
			toasts.show({ message: "No fix command available.", tone: "warn" });
			return;
		}
		try {
			await navigator.clipboard.writeText(diagnostic.fixCommand);
			toasts.show({ message: "Fix command copied.", tone: "info" });
		} catch (err) {
			toasts.show({
				message: err instanceof Error ? err.message : "Could not copy fix command.",
				tone: "error",
			});
		}
	}

	function upsertLaunchDiagnostic(input) {
		const diagnostic = normalizeLaunchDiagnostic(input);
		if (!diagnostic) return null;
		launchDiagnostics.set(diagnostic.id, diagnostic);
		syncLaunchDiagnosticsOverlay();
		return diagnostic;
	}

	function showRuntimeDiagnostics(items) {
		for (const item of items || []) {
			const diagnostic = upsertLaunchDiagnostic(item);
			if (!diagnostic) continue;
			operationalEvents.record({
				type: "launch.diagnostic",
				severity: diagnostic.severity,
				summary: diagnostic.title,
				detail: diagnostic.message,
				meta: { diagnosticId: diagnostic.id },
			});
		}
	}

	launchDiagnosticsEl.addEventListener("click", (event) => {
		const dismiss = event.target.closest?.("[data-launch-dismiss]");
		if (dismiss) {
			launchDiagnostics.clear();
			syncLaunchDiagnosticsOverlay();
			return;
		}
		const button = event.target.closest?.("[data-launch-action]");
		if (!button) return;
		const diagnostic = launchDiagnostics.get(button.dataset.launchAction);
		if (!diagnostic) return;
		if (diagnostic.action === "settings") {
			window.shellApi.openSettings();
		} else {
			void copyLaunchDiagnosticCommand(diagnostic);
		}
	});

	function syncConnectionGraph() {
		window.shellApi.stringSyncConnections?.(
			connections.map((conn) => ({
				id: conn.id,
				tileAId: conn.tileAId,
				tileBId: conn.tileBId,
				label: conn.label,
			})),
		);
	}

	// DOM elements
	const panelNav = document.getElementById("panel-nav");
	const panelViewer = document.getElementById("panel-viewer");
	const navResizeHandle = document.getElementById("nav-resize");
	const navToggle = document.getElementById("nav-toggle");
	const settingsOverlay =
		document.getElementById("settings-overlay");
	const settingsBackdrop =
		document.getElementById("settings-backdrop");
	const settingsModal = document.getElementById("settings-modal");
	const newTileBtn = document.getElementById("new-tile-btn");
	const settingsBtn = document.getElementById("settings-btn");
	const updatePill = document.getElementById("update-pill");
	const dragDropOverlay =
		document.getElementById("drag-drop-overlay");
	const loadingOverlay =
		document.getElementById("loading-overlay");
	const loadingStatusEl =
		document.getElementById("loading-status");
	const tileLayer = document.getElementById("tile-layer");
	const panelAgent = document.getElementById("panel-agent");
	const agentResizeHandle = document.getElementById("agent-resize");
	const agentToggle = document.getElementById("agent-toggle");

	// -- State --

	let dragCounter = 0;
	let settingsModalOpen = false;
	let activeSurface = "canvas";
	let lastNonModalSurface = "canvas";
	let shiftHeld = false;
	let spaceHeld = false;
	let cableHeld = false;
	let isPanning = false;
	let suppressCanvasDblClickUntil = 0;

	// -- Drag-and-drop handler (shared with webviews) --

	function handleDndMessage(channel) {
		if (channel === "dnd:dragenter") {
			dragCounter++;
			if (dragCounter === 1 && dragDropOverlay) {
				dragDropOverlay.classList.add("visible");
				for (const h of getAllWebviews()) {
					h.webview.style.pointerEvents = "none";
				}
			}
		} else if (channel === "dnd:dragleave") {
			dragCounter = Math.max(0, dragCounter - 1);
			if (dragCounter === 0 && dragDropOverlay) {
				dragDropOverlay.classList.remove("visible");
			}
		} else if (channel === "dnd:drop") {
			dragCounter = 0;
			if (dragDropOverlay) {
				dragDropOverlay.classList.remove("visible");
			}
			for (const h of getAllWebviews()) {
				h.webview.style.pointerEvents = "";
			}
		}
	}

	// -- Singleton webviews --

	const singletonViewer = createWebview(
		"viewer", configs.viewer, panelViewer, handleDndMessage,
	);
	singletonViewer.webview.style.display = "none";
	singletonViewer.webview.addEventListener("focus", () => {
		noteSurfaceFocus("viewer");
	});
	singletonViewer.setBeforeInput((event, detail) => {
		if (!isFocusSearchShortcut(detail)) return;
		event.preventDefault();
		handleShortcut("focus-file-search");
	});

	const singletonWebviews = {
		settings: createWebview(
			"settings", configs.settings,
			settingsModal, handleDndMessage,
		),
	};
	singletonWebviews.settings.webview.addEventListener("focus", () => {
		noteSurfaceFocus("settings");
	});

	// -- Panel manager --

	const panelManager = createPanel("nav", {
		panel: panelNav,
		resizeHandle: navResizeHandle, toggle: navToggle,
		label: "Navigator",
		defaultWidth: 280,
		direction: 1,
		validModes: ["closed", "files", "tiles"],
		prefKey: "sidebar-mode",
		getAllWebviews,
		onVisibilityChanged(visible) {
			panelViewer.classList.toggle("nav-open", visible);
			if (visible) {
				requestAnimationFrame(() => {
					singletonViewer.send("nav-visibility", true);
				});
			} else {
				singletonViewer.send("nav-visibility", false);
				canvasEl.focus();
			}
		},
		onModeChanged(mode) {
			updateSidebarContent(mode);
			updateSegmentedControl(mode);
		},
	});
	panelManager.initPrefs(prefNavWidth, prefSidebarMode);

	const useAgentGui = prefSidebarAgentGui === true;
	let agentWebview = null;

	let agentPtySessionId = prefAgentPty || null;

	function ensureAgentTerminal() {
		if (agentWebview) return;

		const termConfig = configs.terminalTile;
		const params = new URLSearchParams();
		params.set("tileId", "agent");

		if (agentPtySessionId) {
			params.set("sessionId", agentPtySessionId);
			params.set("restored", "1");
		} else {
			const homeDir = window.shellApi.getHomePath?.() || "~";
			params.set("cwd", `${homeDir}/.quantflow`);
		}

		const qs = params.toString();
		const wv = document.createElement("webview");
		wv.setAttribute(
			"src", `${termConfig.src}?${qs}`,
		);
		wv.setAttribute("preload", termConfig.preload);
		wv.setAttribute(
			"webpreferences", "contextIsolation=yes, sandbox=yes",
		);
		wv.classList.add("agent-terminal");
		wv.style.flex = "1";
		wv.style.border = "none";

		wv.addEventListener("dom-ready", () => {
			if (agentPanel.isVisible()) {
				wv.focus();
				noteSurfaceFocus("agent");
			}
		});

		wv.addEventListener("ipc-message", (event) => {
			if (event.channel === "pty-session-id") {
				agentPtySessionId = event.args[0];
				window.shellApi.setPref(
					"agent-pty-session", agentPtySessionId,
				);
			}
		});

		wv.addEventListener("console-message", (event) => {
			window.shellApi.logFromWebview(
				"agent-term", event.level,
				event.message, event.sourceId,
			);
		});

		wv.addEventListener("focus", () => {
			noteSurfaceFocus("agent");
		});

		panelAgent.appendChild(wv);
		agentWebview = {
			webview: wv,
			send(ch, ...args) { wv.send(ch, ...args); },
		};
	}

	function ensureAgentChat() {
		if (agentWebview) return;

		const chatConfig = configs.agentChat;
		const homeDir = window.shellApi.getHomePath?.() || "~";
		const cwd = `${homeDir}/.quantflow`;
		const src = `${chatConfig.src}?cwd=${encodeURIComponent(cwd)}`;
		const wv = document.createElement("webview");
		wv.setAttribute("src", src);
		wv.setAttribute("preload", chatConfig.preload);
		wv.setAttribute(
			"webpreferences", "contextIsolation=yes, sandbox=yes",
		);
		wv.style.flex = "1";
		wv.style.border = "none";

		let ready = false;
		const pendingMessages = [];

		wv.addEventListener("dom-ready", () => {
			ready = true;
			for (const [ch, args] of pendingMessages) {
				wv.send(ch, ...args);
			}
			pendingMessages.length = 0;
			if (agentPanel.isVisible()) {
				wv.focus();
				noteSurfaceFocus("agent");
			}
		});

		wv.addEventListener("console-message", (event) => {
			window.shellApi.logFromWebview(
				"agent-chat", event.level,
				event.message, event.sourceId,
			);
		});

		wv.addEventListener("focus", () => {
			noteSurfaceFocus("agent");
		});

		panelAgent.appendChild(wv);
		agentWebview = {
			webview: wv,
			send(ch, ...args) {
				if (ready) wv.send(ch, ...args);
				else pendingMessages.push([ch, args]);
			},
		};

		// Forward agent IPC from shell to the chat webview
		window.shellApi.onAgentUpdate((data) => {
			agentWebview.send("agent:update", data);
		});
		window.shellApi.onAgentPromptComplete((data) => {
			agentWebview.send(
				"agent:prompt-complete", data,
			);
		});
		window.shellApi.onAgentPromptError((data) => {
			agentWebview.send(
				"agent:prompt-error", data,
			);
		});
		window.shellApi.onAgentExit((data) => {
			agentWebview.send("agent:exit", data);
		});
		window.shellApi.onAgentSessionReady((data) => {
			agentWebview.send(
				"agent:session-ready", data,
			);
		});
		window.shellApi.onAgentSessionFailed((data) => {
			agentWebview.send(
				"agent:session-failed", data,
			);
		});
	}

	const agentPanel = createPanel("agent", {
		panel: panelAgent,
		resizeHandle: agentResizeHandle,
		toggle: agentToggle,
		label: "Agent",
		defaultWidth: 400,
		direction: -1,
		validModes: ["closed", "open"],
		defaultMode: "closed",
		prefKey: "sidebar-mode-agent",
		getAllWebviews,
		onVisibilityChanged(visible) {
			panelViewer.classList.toggle("agent-open", visible);
			if (visible) {
				if (useAgentGui) ensureAgentChat();
				else ensureAgentTerminal();
				if (agentWebview) {
					agentWebview.webview.focus();
					noteSurfaceFocus("agent");
				}
			} else {
				canvasEl.focus();
			}
		},
	});
	// agentPanel.initPrefs deferred until after tileManager (getAllWebviews references it)

	function syncTerminalTileMeta(tile, meta) {
		if (!meta) return;
		tile.cwd = meta.cwdHostPath || meta.cwd || tile.cwd;
		tile.autoTitle = meta.cwdHostPath || meta.cwd || tile.autoTitle;
		const dom = tileManager.getTileDOMs().get(tile.id);
		if (dom) {
			updateTileTitle(dom, tile);
		}
	}

	function syncTerminalTileStatuses(items) {
		if (!Array.isArray(items)) return;
		let changed = false;
		for (const item of items) {
			const tile = item?.tileId ? getTile(item.tileId) : null;
			if (!tile || tile.type !== "term") continue;
			const next = item.status || "";
			if (tile.ptyStatus === next) continue;
			tile.ptyStatus = next;
			const dom = tileManager.getTileDOMs().get(tile.id);
			if (dom) updateTileTitle(dom, tile);
			changed = true;
		}
		if (changed) syncTileList();
	}

	function buildTileListEntry(tile) {
		let title = tile.id;
		let description = "";
		let status = null;

		if (tile.type === "term") {
			const label = getTileLabel(tile);
			title = label.parent
				? label.parent + label.name
				: label.name;
			description = tile.cwd || "~";
			status = tile.ptyStatus || (tile.ptySessionId ? "running" : "idle");
		} else if (tile.type === "browser") {
			title = tile.url || "Browser";
			description = "Browser";
		} else if (tile.type === "graph") {
			title = "Graph";
			description = tile.folderPath || "Graph";
		} else if (tile.type === "note") {
			title = tile.filePath
				? tile.filePath.split("/").pop() || "Note"
				: "Note";
			description = "Note";
		} else if (tile.type === "code") {
			title = tile.filePath
				? tile.filePath.split("/").pop() || "Code"
				: "Code";
			description = "Code";
		} else if (tile.type === "image") {
			title = tile.filePath
				? tile.filePath.split("/").pop() || "Image"
				: "Image";
			description = "Image";
		}

		return {
			id: tile.id, type: tile.type,
			title, description, status,
		};
	}

	// -- File tree webview --

	const fileTreeContainer = document.createElement("div");
	fileTreeContainer.id = "file-tree-container";
	fileTreeContainer.style.display = "flex";
	fileTreeContainer.style.flex = "1";
	fileTreeContainer.style.minHeight = "0";
	panelNav.appendChild(fileTreeContainer);
	const navWebview = createWebview(
		"nav", configs.nav, fileTreeContainer, handleDndMessage,
	);
	navWebview.webview.addEventListener("focus", () => {
		noteSurfaceFocus("nav");
	});

	const tileListContainer = document.createElement("div");
	tileListContainer.id = "tile-list-container";
	tileListContainer.style.display = "none";
	tileListContainer.style.flex = "1";
	tileListContainer.style.minHeight = "0";
	panelNav.appendChild(tileListContainer);

	const tileListWebview = createWebview(
		"tile-list", configs.tileList,
		tileListContainer, handleDndMessage,
	);

	function updateSidebarContent(mode) {
		fileTreeContainer.style.display =
			mode === "files" ? "flex" : "none";
		tileListContainer.style.display =
			mode === "tiles" ? "flex" : "none";
	}
	updateSidebarContent(panelManager.getMode());

	const modeButtons =
		document.querySelectorAll(".mode-btn");

	function updateSegmentedControl(mode) {
		for (const btn of modeButtons) {
			btn.classList.toggle(
				"active", btn.dataset.mode === mode,
			);
		}
	}

	for (const btn of modeButtons) {
		btn.addEventListener("click", () => {
			const targetMode = btn.dataset.mode;
			if (
				targetMode === "files" ||
				targetMode === "tiles"
			) {
				panelManager.setMode(targetMode);
			}
		});
	}

	updateSegmentedControl(panelManager.getMode());

	const workspaceManager = createWorkspaceManager({
		navWebview,
	});

	// Forward canvas opacity to nav webview
	broadcastCanvasOpacity = () => {
		if (lastCanvasOpacity == null) return;
		const opacity = Math.max(
			0, Math.min(
				100, Number(lastCanvasOpacity) || 0,
			),
		) / 100;
		workspaceManager.getNavWebview().send(
			"canvas-opacity", opacity,
		);
		tileListWebview.send("canvas-opacity", opacity);
		if (agentWebview) {
			agentWebview.send("canvas-opacity", opacity);
		}
	};
	broadcastCanvasOpacity();

	// -- Tile list sync --

	let lastTileSnapshot = new Map();

	function syncTileList() {
		const currentIds = new Set();
		for (const [id] of tileManager.getTileDOMs()) {
			const tile = getTile(id);
			if (!tile) continue;
			currentIds.add(id);
			const entry = buildTileListEntry(tile);
			const prev = lastTileSnapshot.get(id);
			if (!prev || prev.title !== entry.title ||
				prev.description !== entry.description ||
				prev.status !== entry.status) {
				tileListWebview.send(
					prev ? "tile-list:update" : "tile-list:add",
					entry,
				);
			}
			lastTileSnapshot.set(id, entry);
		}
		for (const id of lastTileSnapshot.keys()) {
			if (!currentIds.has(id)) {
				tileListWebview.send("tile-list:remove", id);
				lastTileSnapshot.delete(id);
			}
		}
	}

	// -- Tile manager --

	let minimapRef = null;
	let cableHudTimer = null;
	const cableHudEl = document.createElement("div");
	cableHudEl.className = "cable-mode-hud";
	cableHudEl.hidden = true;
	document.body.appendChild(cableHudEl);

	function showCableHud(message, tone = "info", timeout = 0) {
		clearTimeout(cableHudTimer);
		cableHudEl.textContent = message;
		cableHudEl.dataset.tone = tone;
		cableHudEl.hidden = false;
		if (timeout > 0) {
			cableHudTimer = setTimeout(() => {
				cableHudEl.hidden = true;
				cableHudTimer = null;
			}, timeout);
		}
	}

	function hideCableHud() {
		clearTimeout(cableHudTimer);
		cableHudTimer = null;
		cableHudEl.hidden = true;
	}

	function showCableModeHud() {
		showCableHud(
			"Cable mode: drag from one terminal to another. Esc cancels.",
		);
	}

	function onCableMousedown(tile, e, opts = {}) {
		if (!cableHeld && !opts.force) return false;
		e.preventDefault();
		e.stopPropagation();
		canvasEl.classList.add("cable-draw-mode");
		showCableModeHud();
		cableOverlay?.startPreview(tile);

		function onMove(ev) {
			cableOverlay?.updatePreview(ev.clientX, ev.clientY);
		}

		function onUp(ev) {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);

			const rect = canvasEl.getBoundingClientRect();
			const cx = (ev.clientX - rect.left - viewportState.panX) / viewportState.zoom;
			const cy = (ev.clientY - rect.top - viewportState.panY) / viewportState.zoom;
			const targetTile = tileAtPoint(cx, cy);
			const dropResult = resolveCableDrop({
				sourceTile: tile,
				targetTile,
				connections,
			});
			let feedbackShown = false;

			if (dropResult.ok) {
				const now = Date.now();
				const conn = {
					id: `conn-${now}-${Math.random().toString(36).slice(2, 7)}`,
					tileAId: dropResult.tileAId,
					tileBId: dropResult.tileBId,
					createdAt: now,
					updatedAt: now,
				};
				addConnection(conn);
				operationalEvents.record({
					type: "connection.created",
					severity: "info",
					summary: `${tileEventLabel(tile)} connected to ${tileEventLabel(targetTile)}`,
					meta: {
						connectionId: conn.id,
						tileAId: conn.tileAId,
						tileBId: conn.tileBId,
					},
				});
				tileManager.saveCanvasImmediate();
				cableOverlay?.update();
			} else {
				showCableHud(dropResult.message, "warn", 1800);
				toasts.show({ message: dropResult.message, tone: "warn" });
				feedbackShown = true;
			}
			cableOverlay?.cancelPreview();
			if (!cableHeld) {
				canvasEl.classList.remove("cable-draw-mode");
				if (!feedbackShown) hideCableHud();
			}
		}

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return true;
	}

	const tileManager = createTileManager({
		tileLayer, viewportState, configs,
		getAllWebviews,
		isSpaceHeld: () => spaceHeld,
		onCableMousedown,
		onReposition: () => { viewport.redrawGrid(); minimapRef?.update(); cableOverlay?.update(); },
		onSaveDebounced(state) {
			window.shellApi.canvasSaveState(
				toCenterPointState(state),
			);
			syncTileList();
		},
		onSaveImmediate(state) {
			window.shellApi.canvasSaveState(
				toCenterPointState(state),
			);
			syncTileList();
		},
		onNoteSurfaceFocus: noteSurfaceFocus,
		onFocusSurface: focusSurface,
		async onTerminalSessionCreated(tile) {
			tile.ptyStatus = "running";
			delete tile.ptyError;
			const discovered =
				await window.shellApi.ptyDiscover?.() ?? [];
			const session = discovered.find(
				(entry) => entry.sessionId === tile.ptySessionId,
			);
			syncTerminalTileMeta(tile, session?.meta);
			tileManager.saveCanvasDebounced();
			syncTileList();
		},
		onTerminalCwdChanged(cwd) {
			setLastTerminalCwd(cwd);
		},
		onTerminalStartFailed(tile, payload) {
			const diagnostic = upsertLaunchDiagnostic(
				createPtyStartFailureDiagnostic(payload, tile),
			);
			operationalEvents.record({
				type: "pty.failed",
				severity: "error",
				summary: diagnostic?.title || "PTY start failed",
				detail: diagnostic?.message || payload?.message || "PTY start failed.",
				meta: {
					tileId: tile?.id,
					cwd: payload?.cwd,
					target: payload?.target,
				},
			});
			toasts.show({
				message: diagnostic?.message || "PTY start failed.",
				tone: "error",
			});
			syncTileList();
		},
		onRoleStartupWrite(tile, write, err = null) {
			const event = formatRoleStartupEvent(tile, write, err);
			operationalEvents.record(event);
			if (err) {
				toasts.show({
					message: `${event.summary}.`,
					tone: "error",
				});
			}
		},
		onTerminalTileResized(width, height) {
			setLastTerminalSize(width, height);
		},
		onTerminalTileClosed() {
			syncTileList();
		},
		onTileFocused(tile) {
			tileListWebview.send(
				"tile-list:focus", tile?.id || null,
			);
		},
		onTileDblClick(tile) {
			edgeIndicators.panToTile(tile);
		},
		onCablePortMouseDown(id, e) {
			const tile = getTile(id);
			if (tile) onCableMousedown(tile, e, { force: true });
		},
		onConnectionsChanged: syncConnectionGraph,
	});

	// -- Cable overlay --

	let cableOverlay = createCableOverlay({
		containerEl: canvasEl,
		viewportState,
		onSendMessage: async (req) => {
			try {
				const result = await window.shellApi.stringRelay?.(req);
				recordRelayOperationalEvent(result, req);
				return result;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Relay failed.";
				recordRelayOperationalEvent({ ok: false, message }, req, message);
				throw err;
			}
		},
		onGetLog: (connectionId, limit) =>
			window.shellApi.stringGetLog?.(connectionId, limit),
		onNotify: (message, tone = "info") => toasts.show({ message, tone }),
		onInjectContext: async (req) => {
			const preview = await window.shellApi.contextPreviewForTile?.();
			const text = formatCableContextRelay(preview);
			if (!text) {
				operationalEvents.record({
					type: "context.failed",
					severity: "warn",
					summary: "No shared context to inject.",
					meta: { connectionId: req.connectionId },
				});
				toasts.show({ message: "No shared context to inject.", tone: "warn" });
				return { ok: false, message: "No shared context to inject." };
			}
			const detail = [
				`${req.fromLabel} -> ${req.targetLabel}`,
				"Destination format: relayed cable message",
				formatContextPreviewDetail(preview),
			].join("\n");
			const response = await window.shellApi.showConfirmDialog({
				message: "Inject shared context over cable?",
				detail,
				buttons: ["Cancel", "Inject"],
			});
			if (response !== 1) {
				return { canceled: true };
			}
			const result = await window.shellApi.stringRelay?.({
				connectionId: req.connectionId,
				fromTileId: req.fromTileId,
				fromLabel: req.fromLabel,
				targetTileId: req.targetTileId,
				targetSessionId: req.targetSessionId,
				text,
			});
			if (result?.ok === false) {
				operationalEvents.record({
					type: "context.failed",
					severity: "error",
					summary: result.message || "Context relay failed.",
					detail: `${req.fromLabel} -> ${req.targetLabel}`,
					meta: { connectionId: req.connectionId, eventId: result.eventId },
				});
				toasts.show({ message: result.message || "Context relay failed.", tone: "error" });
			} else {
				operationalEvents.record({
					type: "context.injected",
					severity: "info",
					summary: `Shared context injected over cable: ${req.fromLabel} -> ${req.targetLabel}`,
					meta: { connectionId: req.connectionId, eventId: result?.eventId },
				});
			}
			return result;
		},
		onFocusTile: (id) => {
			const tile = getTile(id);
			if (!tile) return;
			edgeIndicators.panToTile(tile, { targetZoom: 1 });
			tileManager.focusCanvasTile(tile.id);
		},
		onRemoveConnection: (id) => {
			const conn = connections.find((item) => item.id === id);
			const tileA = getTile(conn?.tileAId);
			const tileB = getTile(conn?.tileBId);
			removeConnection(id);
			operationalEvents.record({
				type: "connection.removed",
				severity: "info",
				summary: `${tileEventLabel(tileA)} disconnected from ${tileEventLabel(tileB)}`,
				meta: { connectionId: id, tileAId: conn?.tileAId, tileBId: conn?.tileBId },
			});
			tileManager.saveCanvasImmediate();
			cableOverlay.update();
		},
		onUpdateLabel: (id, label) => {
			const conn = updateConnectionLabel(id, label);
			if (conn) {
				operationalEvents.record(createConnectionLabelEvent(
					conn,
					getTile(conn.tileAId),
					getTile(conn.tileBId),
					tileEventLabel,
					"cable-inspector",
				));
			}
			tileManager.saveCanvasImmediate();
			cableOverlay.update();
		},
		onGetFocusedTileId: () => tileManager.getFocusedTileId(),
	});

	// -- Edge indicators --

	const edgeIndicators = createEdgeIndicators({
		canvasEl,
		edgeIndicatorsEl: document.getElementById("edge-indicators"),
		viewportState,
		getTiles: () => tiles,
		getTileDOMs: () => tileManager.getTileDOMs(),
		onViewportUpdate() {
			viewport.updateCanvas();
		},
	});

	// -- Minimap --

	const minimap = createMinimap({
		viewportEl: canvasEl,
		wrapperEl: document.getElementById("minimap-wrapper"),
		viewportState,
		getTiles: () => tiles,
		viewport,
	});
	minimapRef = minimap;

	// -- Canvas RPC --

	const handleCanvasRpc = createCanvasRpc({
		tileManager, viewportState, viewport, edgeIndicators,
		onConnectionCreated(conn, tileA, tileB) {
			operationalEvents.record(createConnectionMutationEvent(
				"created", conn, tileA, tileB, tileEventLabel,
			));
			cableOverlay?.update();
		},
		onConnectionRemoved(conn, tileA, tileB) {
			operationalEvents.record(createConnectionMutationEvent(
				"removed", conn, tileA, tileB, tileEventLabel,
			));
			cableOverlay?.update();
		},
		onConnectionUpdated(conn, tileA, tileB) {
			operationalEvents.record(createConnectionLabelEvent(
				conn, tileA, tileB, tileEventLabel,
			));
			cableOverlay?.update();
		},
		onConnectionFailed(event) {
			operationalEvents.record(event);
			toasts.show({
				message: event.summary,
				tone: "warn",
			});
		},
		onTerminalReadFailed(tile, failure) {
			const event = createTerminalReadFailureEvent(
				tile,
				failure.message,
				failure.reason,
				tileEventLabel,
			);
			operationalEvents.record(event);
			toasts.show({
				message: event.summary,
				tone: "warn",
			});
		},
		onTerminalWriteFailed(tile, failure) {
			const event = createTerminalWriteFailureEvent(
				tile,
				failure.message,
				failure.reason,
				tileEventLabel,
			);
			operationalEvents.record(event);
			toasts.show({
				message: event.summary,
				tone: "warn",
			});
		},
	});

	Promise.resolve(window.shellApi.runtimeDiagnostics?.() ?? [])
		.then((items) => {
			if (Array.isArray(items) && items.length > 0) {
				showRuntimeDiagnostics(items);
			}
		})
		.catch((err) => {
			operationalEvents.record({
				type: "launch.diagnostic_failed",
				severity: "warn",
				summary: "Runtime diagnostics failed",
				detail: err instanceof Error ? err.message : String(err),
			});
		});

	// -- Wire viewport updates --

	viewport.init(viewportState, () => {
		tileManager.repositionAllTiles();
		edgeIndicators.update();
		minimap.update();
		cableOverlay.update();
		tileManager.saveCanvasDebounced();
	});

	edgeIndicators.update();
	minimap.update();
	cableOverlay.update();

	// -- Agent panel init (after tileManager, since getAllWebviews references it) --

	agentPanel.initPrefs(prefAgentWidth, prefAgentMode);
	agentPanel.setupResize(() => {
		agentPanel.updateTogglePosition();
	});

	// -- Surface focus management --

	function noteSurfaceFocus(surface) {
		if (settingsModalOpen && surface !== "settings") {
			focusSurface("settings");
			return;
		}
		if (
			activeSurface === "canvas-tile" &&
			surface !== "canvas-tile"
		) {
			tileManager.blurCanvasTileGuest();
		}
		activeSurface = surface;
		if (surface !== "settings") {
			lastNonModalSurface = surface;
		}
		const canvasOwned =
			surface === "canvas" || surface === "canvas-tile";
		canvasEl.classList.toggle("canvas-focused", canvasOwned);
		if (surface !== "canvas-tile") {
			tileManager.clearTileFocusRing();
		}
	}

	function isViewerVisible() {
		return singletonViewer.webview.style.display !== "none";
	}

	function resolveSurface(surface = lastNonModalSurface) {
		if (surface === "canvas-tile" && tileManager.getFocusedTileId()) {
			const dom = tileManager.getTileDOMs()
				.get(tileManager.getFocusedTileId());
			if (dom && dom.webview) return "canvas-tile";
		}
		if (surface === "viewer" && !isViewerVisible()) {
			surface = null;
		}
		if (
			surface === "nav" &&
			!panelManager.isVisible()
		) {
			surface = null;
		}
		if (surface === "agent" && !agentPanel.isVisible()) {
			surface = null;
		}
		if (surface === "agent") return "agent";
		if (surface === "viewer") return "viewer";
		if (surface === "nav") return "nav";
		if (panelManager.isVisible()) return "nav";
		if (isViewerVisible()) return "viewer";
		return "canvas";
	}

	function focusSurface(surface = lastNonModalSurface) {
		if (
			surface === "canvas-tile" &&
			tileManager.getFocusedTileId()
		) {
			const dom = tileManager.getTileDOMs()
				.get(tileManager.getFocusedTileId());
			if (dom && dom.webview) {
				dom.webview.focus();
				noteSurfaceFocus("canvas-tile");
				return;
			}
		}

		if (surface === "agent" && agentWebview && agentPanel.isVisible()) {
			agentWebview.webview.focus();
			noteSurfaceFocus("agent");
			return;
		}

		requestAnimationFrame(() => {
			window.focus();
			if (surface === "settings") {
				singletonWebviews.settings.webview.focus();
				noteSurfaceFocus("settings");
				return;
			}
			const resolved = resolveSurface(surface);
			if (resolved === "nav") {
				workspaceManager.getNavWebview().webview.focus();
				noteSurfaceFocus("nav");
				return;
			}
			if (resolved === "viewer" && isViewerVisible()) {
				singletonViewer.webview.focus();
				noteSurfaceFocus("viewer");
				return;
			}
			canvasEl.focus();
			noteSurfaceFocus("canvas");
		});
	}

	function setUnderlyingShellInert(inert) {
		const panelsEl = document.getElementById("panels");
		panelsEl.inert = inert;
		navToggle.inert = inert;
		agentToggle.inert = inert;
	}

	function blurNonModalSurfaces() {
		canvasEl.blur();
		navToggle.blur();
		agentToggle.blur();
		singletonViewer.webview.blur();
		workspaceManager.getNavWebview().webview.blur();
		if (agentWebview) agentWebview.webview.blur();
	}

	// -- getAllWebviews aggregator --

	function getAllWebviews() {
		const all = [workspaceManager.getNavWebview()];
		all.push(singletonViewer);
		all.push(tileListWebview);
		all.push(singletonWebviews.settings);
		if (agentWebview) all.push(agentWebview);
		for (const [, dom] of tileManager.getTileDOMs()) {
			if (dom.webview) {
				all.push({
					webview: dom.webview,
					send: (ch, ...args) => {
						if (dom.webview) dom.webview.send(ch, ...args);
					},
				});
			}
		}
		return all;
	}

	// -- Window + canvas focus listeners --

	window.addEventListener("focus", () => {
		noteSurfaceFocus("shell");
	});
	canvasEl.addEventListener("focus", () => {
		noteSurfaceFocus("canvas");
	});
	canvasEl.classList.add("canvas-focused");

	// -- Double-click to create terminal tile --

	canvasEl.addEventListener("dblclick", (e) => {
		if (
			spaceHeld || isPanning ||
			Date.now() < suppressCanvasDblClickUntil
		) return;
		if (
			e.target !== canvasEl && e.target !== gridCanvas &&
			e.target !== tileLayer
		) return;

		const rect = canvasEl.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;
		const cx = (screenX - viewportState.panX) / viewportState.zoom;
		const cy = (screenY - viewportState.panY) / viewportState.zoom;

		const cwd = getTerminalCwd();
		const size = getTerminalSize();
		const tile = tileManager.createCanvasTile(
			"term", cx, cy, { cwd, ...size },
		);
		tileManager.spawnTerminalWebview(tile, true);
		tileManager.saveCanvasImmediate();
		minimap.update();
	});

	// -- Right-click context menu --

	canvasEl.addEventListener("contextmenu", async (e) => {
		if (
			e.target !== canvasEl && e.target !== gridCanvas &&
			e.target !== tileLayer
		) return;
		e.preventDefault();

		const rect = canvasEl.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;
		const cx = (screenX - viewportState.panX) / viewportState.zoom;
		const cy = (screenY - viewportState.panY) / viewportState.zoom;

		const selected = await window.shellApi.showContextMenu([
			{ id: "new-terminal", label: "New terminal tile" },
			{ id: "new-browser", label: "New browser tile" },
			{ id: "spawn-role", label: "Spawn role tile…" },
		]);

		if (selected === "new-terminal") {
			const cwd = getTerminalCwd();
			const size = getTerminalSize();
			const tile = tileManager.createCanvasTile(
				"term", cx, cy, { cwd, ...size },
			);
			tileManager.spawnTerminalWebview(tile, true);
			tileManager.saveCanvasImmediate();
			minimap.update();
		} else if (selected === "new-browser") {
			const tile = tileManager.createCanvasTile(
				"browser", cx, cy,
			);
			tileManager.spawnBrowserWebview(tile, true);
			tileManager.saveCanvasImmediate();
			minimap.update();
		} else if (selected === "spawn-role") {
			const roles = await window.shellApi.rolesList?.() ?? [];
			if (roles.length === 0) return;
			const roleItems = roles.map((r) => ({
				id: `role:${r.id}`,
				label: formatRoleMenuLabel(r),
				enabled: !isMissingRoleCommand(r),
			}));
			const roleSelected = await window.shellApi.showContextMenu(roleItems);
			if (!roleSelected?.startsWith("role:")) return;
			const roleId = roleSelected.slice(5);
			const role = roles.find((r) => r.id === roleId);
			if (!role) return;
			if (isMissingRoleCommand(role)) {
				operationalEvents.record({
					type: "role.failed",
					severity: "error",
					summary: `${role.name} is missing command: ${getRoleCommandName(role)}`,
					meta: { roleId: role.id, command: getRoleCommandName(role) },
				});
				toasts.show({
					message: `${role.name} is missing command: ${getRoleCommandName(role)}`,
					tone: "error",
				});
				return;
			}
			const cwd = getTerminalCwd();
			const size = getTerminalSize();
			const tile = tileManager.createCanvasTile(
				"term", cx, cy, {
					cwd, ...size,
					userTitle: role.name,
					terminalTarget: normalizeRoleTerminalTarget(role.defaultShell),
					roleId: role.id,
					roleName: role.name,
					roleColor: role.color,
					roleShellKind: getRoleCommandName(role) || role.defaultShell || "shell",
					roleCommandTemplate: role.commandTemplate,
					roleStartupPrompt: role.startupPrompt,
					roleStatusParser: role.statusParser,
				},
			);
			operationalEvents.record({
				type: "role.spawned",
				severity: "info",
				summary: `${role.name} role tile spawned`,
				detail: role.commandTemplate || "shell",
				meta: {
					roleId: role.id,
					tileId: tile.id,
					command: role.commandTemplate,
				},
			});
			tileManager.spawnTerminalWebview(tile, true);
			tileManager.saveCanvasImmediate();
			minimap.update();
		}
	});

	document.addEventListener("focusin", (event) => {
		if (!settingsModalOpen) return;
		if (settingsOverlay.contains(event.target)) return;
		focusSurface("settings");
	});

	// -- Marquee selection --

	attachMarquee(canvasEl, {
		viewport: {
			get panX() { return viewportState.panX; },
			get panY() { return viewportState.panY; },
			get zoom() { return viewportState.zoom; },
		},
		tiles: () => tiles,
		onSelectionChange: (ids) => {
			if (shiftHeld) {
				for (const id of ids) selectTile(id);
			} else {
				clearSelection();
				for (const id of ids) selectTile(id);
			}
			tileManager.syncSelectionVisuals();
			tileManager.blurCanvasTileGuest();
			tileManager.clearTileFocusRing();
			tileManager.setFocusedTileId(null);
			canvasEl.focus();
			noteSurfaceFocus("canvas");
		},
		isShiftHeld: () => shiftHeld,
		isSpaceHeld: () => spaceHeld,
		getAllWebviews,
	});

	// -- Selection keyboard handlers --

	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && getSelectedTiles().length > 0) {
			clearSelection();
			tileManager.syncSelectionVisuals();
			return;
		}

		if (
			(e.key === "Backspace" || e.key === "Delete") &&
			(activeSurface === "canvas" ||
				activeSurface === "canvas-tile")
		) {
			const selected = getSelectedTiles();
			if (selected.length === 0) return;

			const count = selected.length;
			window.shellApi.showConfirmDialog({
				message: count === 1
					? "Delete this tile?"
					: `Delete ${count} tiles?`,
				detail: "This cannot be undone.",
				buttons: ["Cancel", "Delete"],
			}).then((response) => {
				if (response !== 1) return;
				for (const t of selected) {
					tileManager.closeCanvasTile(t.id);
				}
				clearSelection();
				tileManager.syncSelectionVisuals();
				minimap.update();
			});
		}
	});

	// -- Shift scroll passthrough --

	window.addEventListener("keydown", (e) => {
		if (e.key === "Shift" && !shiftHeld) {
			shiftHeld = true;
			canvasEl.classList.add("shift-held");
		}
	});

	window.addEventListener("keyup", (e) => {
		if (e.key === "Shift") {
			shiftHeld = false;
			canvasEl.classList.remove("shift-held");
		}
	});

	window.addEventListener("blur", () => {
		if (shiftHeld) {
			shiftHeld = false;
			canvasEl.classList.remove("shift-held");
		}
	});

	// -- Space+click and middle-click pan --

	window.addEventListener("keydown", (e) => {
		if (e.code === "Space" && !e.target.closest?.("webview") && !e.target.matches?.("input, textarea")) {
			e.preventDefault();
			if (!e.repeat && !spaceHeld) {
				spaceHeld = true;
				canvasEl.classList.add("space-held");
				for (const h of getAllWebviews()) {
					h.webview.blur();
				}
			}
		}
	});

	window.addEventListener("keyup", (e) => {
		if (e.code === "Space") {
			spaceHeld = false;
			if (!isPanning) {
				canvasEl.classList.remove("space-held");
			}
		}
	});

	window.addEventListener("blur", () => {
		if (spaceHeld) {
			spaceHeld = false;
			canvasEl.classList.remove("space-held", "panning");
		}
	});

	// -- W key: watchtower panel --

	let watchtowerVisible = false;
	let watchtowerTab = "agents";
	let watchtowerAgentFilter = "all";
	let watchtowerMessageFilter = "all";
	let watchtowerEventFilter = "all";
	let watchtowerTimer = null;
	let watchtowerRelayLogCache = [];
	const watchtowerEl = document.createElement("div");
	watchtowerEl.id = "watchtower-panel";
	watchtowerEl.hidden = true;
	watchtowerEl.innerHTML = `
		<div class="wt-header">
			<span class="wt-title">Watchtower</span>
			<div class="wt-tabs">
				<button class="wt-tab active" data-tab="agents">Agents</button>
				<button class="wt-tab" data-tab="messages">Messages</button>
				<button class="wt-tab" data-tab="events">Events</button>
			</div>
			<button class="wt-copy" title="Copy diagnostics">Copy</button>
			<button class="wt-refresh" title="Refresh">Refresh</button>
			<button class="wt-close">✕</button>
		</div>
		<div class="wt-filter-bar"></div>
		<div class="wt-body"></div>
	`;
	document.body.appendChild(watchtowerEl);

	watchtowerEl.querySelector(".wt-refresh").addEventListener("click", () => {
		refreshWatchtower();
	});

	watchtowerEl.querySelector(".wt-copy").addEventListener("click", async () => {
		try {
			const [
				items,
				relayLogs,
				roles,
				appVersion,
				terminalMode,
				terminalTarget,
			] = await Promise.all([
				window.shellApi.watchtowerSnapshot?.() ?? [],
				window.shellApi.watchtowerRelayLog?.(50) ?? [],
				window.shellApi.rolesList?.() ?? [],
				window.shellApi.appVersion?.() ?? "unknown",
				window.shellApi.getPref("terminalMode"),
				window.shellApi.getPref("terminalTarget"),
			]);
			const text = formatWatchtowerDiagnostics({
				runtime: {
					appVersion,
					os: window.shellApi.getPlatform?.() ?? "unknown",
					shellMode: terminalMode || "sidecar",
					terminalTarget: terminalTarget || "auto",
				},
				agents: Array.isArray(items) ? items : [],
				connections,
				relayLogs: Array.isArray(relayLogs) ? relayLogs : [],
				operationalEvents: operationalEvents.list(),
				roles: Array.isArray(roles) ? roles : [],
			});
			await navigator.clipboard.writeText(text);
			toasts.show({ message: "Watchtower diagnostics copied.", tone: "info" });
		} catch (err) {
			toasts.show({
				message: err instanceof Error ? err.message : "Could not copy diagnostics.",
				tone: "error",
			});
		}
	});

	watchtowerEl.querySelector(".wt-close").addEventListener("click", () => {
		hideWatchtower();
	});

	for (const tab of watchtowerEl.querySelectorAll(".wt-tab")) {
		tab.addEventListener("click", () => {
			watchtowerTab = tab.dataset.tab;
			for (const t of watchtowerEl.querySelectorAll(".wt-tab")) {
				t.classList.toggle("active", t.dataset.tab === watchtowerTab);
			}
			refreshWatchtower();
		});
	}

	function watchtowerFilterLabel(filter) {
		return formatWatchtowerFilterLabel(filter);
	}

	function renderWatchtowerFilters() {
		const filters = watchtowerTab === "agents"
			? WATCHTOWER_AGENT_FILTERS
			: watchtowerTab === "events"
				? WATCHTOWER_EVENT_FILTERS
				: WATCHTOWER_MESSAGE_FILTERS;
		const activeFilter = watchtowerTab === "agents"
			? watchtowerAgentFilter
			: watchtowerTab === "events"
				? watchtowerEventFilter
				: watchtowerMessageFilter;
		const filterBar = watchtowerEl.querySelector(".wt-filter-bar");
		filterBar.innerHTML = filters.map((filter) => `
			<button
				class="wt-filter ${filter === activeFilter ? "active" : ""}"
				data-filter="${filter}"
				type="button"
			>${watchtowerFilterLabel(filter)}</button>
		`).join("");
	}

	watchtowerEl.querySelector(".wt-filter-bar").addEventListener("click", (e) => {
		const button = e.target.closest?.(".wt-filter");
		if (!button) return;
		if (watchtowerTab === "agents") {
			watchtowerAgentFilter = button.dataset.filter;
		} else if (watchtowerTab === "events") {
			watchtowerEventFilter = button.dataset.filter;
		} else {
			watchtowerMessageFilter = button.dataset.filter;
		}
		refreshWatchtower();
	});

	function focusWatchtowerTile(tileId) {
		const tile = getTile(tileId);
		if (!tile) return false;
		edgeIndicators.panToTile(tile, { targetZoom: 1 });
		tileManager.focusCanvasTile(tile.id);
		return true;
	}

	function focusWatchtowerRelay(row) {
		const selected = row.dataset.connId
			? cableOverlay?.selectConnection(row.dataset.connId)
			: null;
		if (selected?.tileA && selected?.tileB) {
			edgeIndicators.panToTiles([selected.tileA, selected.tileB]);
			const targetTileId = row.dataset.targetTileId;
			const targetTile = targetTileId ? getTile(targetTileId) : null;
			tileManager.focusCanvasTile(targetTile?.id ?? selected.tileB.id);
			return true;
		}

		if (row.dataset.targetTileId && focusWatchtowerTile(row.dataset.targetTileId)) {
			return true;
		}
		if (row.dataset.fromTileId && focusWatchtowerTile(row.dataset.fromTileId)) {
			return true;
		}
		return false;
	}

	async function retryWatchtowerRelay(button) {
		const row = button.closest?.("[data-watchtower-kind='message']");
		if (!row) return;
		const entry = watchtowerRelayLogCache.find((item) =>
			String(item?.eventId ?? "") === row.dataset.eventId,
		);
		const connection = connections.find((conn) => conn.id === entry?.connectionId);
		const fromTile = entry?.fromTileId ? getTile(entry.fromTileId) : null;
		const targetTile = entry?.targetTileId ? getTile(entry.targetTileId) : null;
		const request = getWatchtowerRetryRequest(
			entry,
			connection,
			fromTile,
			targetTile,
			getTileLabel,
		);
		if (!request) {
			toasts.show({
				message: "Relay cannot be retried from this Watchtower row.",
				tone: "warn",
			});
			return;
		}
		button.disabled = true;
		try {
			const result = await window.shellApi.stringRelay?.(request);
			recordRelayOperationalEvent(result, request);
			if (result?.ok === false) {
				toasts.show({ message: result.message || "Relay retry failed.", tone: "error" });
			} else {
				toasts.show({ message: "Relay retried.", tone: "info" });
			}
			await refreshWatchtower();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Relay retry failed.";
			recordRelayOperationalEvent({ ok: false, message }, request, message);
			toasts.show({
				message,
				tone: "error",
			});
		} finally {
			if (watchtowerEl.contains(button)) button.disabled = false;
		}
	}

	function activateWatchtowerRow(target) {
		const row = target.closest?.("[data-watchtower-kind]");
		if (!row || !watchtowerEl.contains(row)) return;
		for (const action of getWatchtowerFocusPlan(row.dataset)) {
			if (action.type === "relay" && focusWatchtowerRelay(row)) return;
			if (action.type === "tile" && focusWatchtowerTile(action.tileId)) return;
		}
	}

	watchtowerEl.addEventListener("click", (e) => {
		const retryButton = e.target.closest?.(".wt-msg-retry");
		if (retryButton && watchtowerEl.contains(retryButton)) {
			e.preventDefault();
			e.stopPropagation();
			retryWatchtowerRelay(retryButton);
			return;
		}
		activateWatchtowerRow(e.target);
	});

	watchtowerEl.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		const row = e.target.closest?.("[data-watchtower-kind]");
		if (!row) return;
		e.preventDefault();
		activateWatchtowerRow(row);
	});

	async function refreshWatchtower() {
		renderWatchtowerFilters();
		const body = watchtowerEl.querySelector(".wt-body");
		const [items, relayLogs] = await Promise.all([
			window.shellApi.watchtowerSnapshot?.() ?? [],
			window.shellApi.watchtowerRelayLog?.(50) ?? [],
		]);
		watchtowerRelayLogCache = Array.isArray(relayLogs) ? relayLogs : [];
		const agentItems = Array.isArray(items) ? items : [];
		syncTerminalTileStatuses(agentItems);
		const attentionHtml = renderWatchtowerAttention(watchtowerRelayLogCache, {
			operationalEvents: operationalEvents.list(),
		});
		if (watchtowerTab === "agents") {
			body.innerHTML = attentionHtml + renderWatchtowerAgents(agentItems, {
				filter: watchtowerAgentFilter,
				connectionCounts: createConnectionCounts(connections),
			});
		} else if (watchtowerTab === "events") {
			body.innerHTML = attentionHtml + renderWatchtowerEvents(operationalEvents.list(), {
				filter: watchtowerEventFilter,
			});
		} else {
			body.innerHTML = attentionHtml + renderWatchtowerMessages(watchtowerRelayLogCache, {
				filter: watchtowerMessageFilter,
			});
		}
	}

	function showWatchtower() {
		watchtowerVisible = true;
		watchtowerEl.hidden = false;
		refreshWatchtower();
		if (!watchtowerTimer) {
			watchtowerTimer = setInterval(refreshWatchtower, 2000);
		}
	}

	function hideWatchtower() {
		watchtowerVisible = false;
		watchtowerEl.hidden = true;
		clearInterval(watchtowerTimer);
		watchtowerTimer = null;
	}

	window.addEventListener("keydown", (e) => {
		if (
			e.code === "KeyW" && !e.metaKey && !e.ctrlKey && !e.altKey &&
			!e.target.closest?.("webview") &&
			!e.target.matches?.("input, textarea")
		) {
			if (watchtowerVisible) hideWatchtower();
			else showWatchtower();
		}
	});

	// -- C key: cable draw mode --

	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && cableHeld) {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			cableOverlay?.cancelPreview();
			hideCableHud();
			return;
		}
		if (
			e.code === "KeyC" && !e.repeat &&
			!e.target.closest?.("webview") &&
			!e.target.matches?.("input, textarea")
		) {
			cableHeld = true;
			canvasEl.classList.add("cable-draw-mode");
			showCableModeHud();
		}
	});

	window.addEventListener("keyup", (e) => {
		if (e.code === "KeyC") {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			cableOverlay?.cancelPreview();
			hideCableHud();
		}
	});

	window.addEventListener("blur", () => {
		if (cableHeld) {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			cableOverlay?.cancelPreview();
			hideCableHud();
		}
	});

	canvasEl.addEventListener("mousedown", (e) => {
		const shouldPan =
			e.button === 1 || (e.button === 0 && spaceHeld);
		if (!shouldPan) return;

		e.preventDefault();
		suppressCanvasDblClickUntil =
			Date.now() + CANVAS_DBLCLICK_SUPPRESS_MS;
		isPanning = true;
		canvasEl.classList.add("panning");

		const startMX = e.clientX;
		const startMY = e.clientY;
		const startPanX = viewportState.panX;
		const startPanY = viewportState.panY;

		for (const h of getAllWebviews()) {
			h.webview.style.pointerEvents = "none";
		}

		function onMove(ev) {
			viewportState.panX = startPanX + (ev.clientX - startMX);
			viewportState.panY = startPanY + (ev.clientY - startMY);
			viewport.updateCanvas();
		}

		function onUp() {
			isPanning = false;
			canvasEl.classList.remove("panning");
			if (!spaceHeld) {
				canvasEl.classList.remove("space-held");
			}
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			for (const h of getAllWebviews()) {
				h.webview.style.pointerEvents = "";
			}
		}

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	});

	// -- Shortcuts --

	function handleShortcut(action) {
		if (settingsModalOpen && action !== "toggle-settings") {
			focusSurface("settings");
			return;
		}
		if (action === "toggle-settings") {
			window.shellApi.toggleSettings();
		} else if (action === "sidebar-files") {
			panelManager.toggle();
		} else if (action === "sidebar-tiles") {
			panelManager.toggleToMode("tiles");
		} else if (action === "toggle-agent") {
			agentPanel.toggle();
		} else if (action === "focus-file-search") {
			panelManager.setMode("files");
			focusSurface("nav");
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					workspaceManager.getNavWebview().send(
						"focus-search",
					);
				});
			});
		} else if (action === "add-workspace") {
			window.shellApi.workspaceAdd();
		} else if (action === "new-tile") {
			const rect = canvasEl.getBoundingClientRect();
			const size = getTerminalSize();
			const cx =
				(rect.width / 2 - viewportState.panX) /
				viewportState.zoom - size.width / 2;
			const cy =
				(rect.height / 2 - viewportState.panY) /
				viewportState.zoom - size.height / 2;
			const cwd = getTerminalCwd();
			const tile = tileManager.createCanvasTile(
				"term", cx, cy, { cwd, ...size },
			);
			tileManager.spawnTerminalWebview(tile, true);
			tileManager.saveCanvasImmediate();
			minimap.update();
		} else if (action === "close-tile") {
			const focusedId = tileManager.getFocusedTileId();
			if (focusedId) {
				tileManager.closeCanvasTile(focusedId);
				tileManager.setFocusedTileId(null);
				canvasEl.focus();
				noteSurfaceFocus("canvas");
				minimap.update();
			}
		} else if (
			action === "focus-tile-right" || action === "focus-tile-left" ||
			action === "focus-tile-up" || action === "focus-tile-down"
		) {
			const direction = action.replace("focus-tile-", "");
			const currentId = tileManager.getFocusedTileId();
			let target;
			if (!currentId) {
				const rect = canvasEl.getBoundingClientRect();
				const cx = (rect.width / 2 - viewportState.panX) / viewportState.zoom;
				const cy = (rect.height / 2 - viewportState.panY) / viewportState.zoom;
				target = getNearestTileInDirection(null, direction, cx, cy);
			} else {
				target = getNearestTileInDirection(currentId, direction);
			}
			if (target) {
				tileManager.focusCanvasTile(target.id, null);
				edgeIndicators.panToTile(target);
			}
		}
	}

	window.shellApi.onShortcut(handleShortcut);

	window.addEventListener("keydown", (event) => {
		if (!isFocusSearchShortcut(event)) return;
		event.preventDefault();
		handleShortcut("focus-file-search");
	});

	window.addEventListener("keydown", (event) => {
		if (!event.metaKey || event.shiftKey || event.altKey) return;
		if (event.key === "n") {
			event.preventDefault();
			handleShortcut("new-tile");
		} else if (event.key === "w") {
			event.preventDefault();
			handleShortcut("close-tile");
		}
	});

	// -- Browser tile Cmd+L focus URL --

	window.shellApi.onBrowserTileFocusUrl((webContentsId) => {
		for (const [, dom] of tileManager.getTileDOMs()) {
			if (!dom.webview || !dom.urlInput) continue;
			if (dom.webview.getWebContentsId() === webContentsId) {
				dom.urlInput.readOnly = false;
				dom.urlInput.focus();
				dom.urlInput.select();
				break;
			}
		}
	});

	// -- IPC forwarding --

	window.shellApi.onForwardToWebview(
		(target, channel, ...args) => {
			if (target === "settings") {
				singletonWebviews.settings.send(channel, ...args);
			} else if (target === "nav") {
				workspaceManager.getNavWebview().send(channel, ...args);
			} else if (
				target === "viewer" ||
				target.startsWith("viewer:")
			) {
				if (channel === "file-selected") {
					const hasSelectedFile = !!args[0];
					if (!hasSelectedFile) {
						singletonViewer.webview.blur();
					}
					singletonViewer.webview.style.display =
						hasSelectedFile ? "" : "none";
					if (!hasSelectedFile) {
						focusSurface(lastNonModalSurface);
					}
				}
				if (channel === "file-renamed") {
					tileManager.updateTileForRename(
						args[0], args[1],
					);
				}
				if (channel === "files-deleted") {
					tileManager.closeTilesForDeletedPaths(args[0]);
					minimap.update();
				}
				if (channel !== "workspace-changed") {
					singletonViewer.send(channel, ...args);
				}
				if (
					channel === "fs-changed" ||
					channel === "file-renamed" ||
					channel === "wikilinks-updated" ||
					channel.startsWith("agent:") ||
					channel === "replay:data"
				) {
					tileManager.broadcastToTileWebviews(
						channel, ...args,
					);
				}
			} else if (target === "canvas") {
				if (channel === "open-terminal") {
					const cwd = args[0];
					setLastTerminalCwd(cwd);
					const size = getTerminalSize();
					const rect = canvasEl.getBoundingClientRect();
					const cx =
						(rect.width / 2 - viewportState.panX) /
						viewportState.zoom - size.width / 2;
					const cy =
						(rect.height / 2 - viewportState.panY) /
						viewportState.zoom - size.height / 2;
					const tile = tileManager.createCanvasTile(
						"term", cx, cy, { cwd, ...size },
					);
					tileManager.spawnTerminalWebview(tile, true);
					tileManager.saveCanvasImmediate();
					minimap.update();
				}
				if (channel === "open-browser-tile") {
					const url = args[0];
					const sourceWcId = args[1];
					let srcTile = null;
					for (const [id, d] of tileManager.getTileDOMs()) {
						if (
							d.webview &&
							d.webview.getWebContentsId() === sourceWcId
						) {
							srcTile = getTile(id);
							break;
						}
					}
					const x = srcTile ? srcTile.x + 40 : 0;
					const y = srcTile ? srcTile.y + 40 : 0;
					const extra = { url };
					if (srcTile) {
						extra.width = srcTile.width;
						extra.height = srcTile.height;
					}
					const newTile = tileManager.createCanvasTile(
						"browser", x, y, extra,
					);
					tileManager.spawnBrowserWebview(newTile, true);
					tileManager.saveCanvasImmediate();
					minimap.update();
				}
				if (channel === "create-graph-tile") {
					const folderPath = args[0];
					const size = defaultSize("graph");
					const rect = canvasEl.getBoundingClientRect();
					const cx =
						(rect.width / 2 - viewportState.panX) /
						viewportState.zoom - size.width / 2;
					const cy =
						(rect.height / 2 - viewportState.panY) /
						viewportState.zoom - size.height / 2;
					const wsPath =
						workspaceData.workspaces[0] ?? "";
					tileManager.createGraphTile(
						cx, cy, folderPath, wsPath,
					);
					minimap.update();
				}
			}
		},
	);

	// -- Canvas pinch from tile webviews --

	window.shellApi.onCanvasPinch((deltaY) => {
		const rect = canvasEl.getBoundingClientRect();
		viewport.applyZoom(
			deltaY, rect.width / 2, rect.height / 2,
		);
	});

	// -- Canvas RPC --

	window.shellApi.onCanvasRpcRequest(handleCanvasRpc);

	// -- PTY lifecycle forwarding --

	window.shellApi.onPtyExit((payload) => {
		for (const [id] of tileManager.getTileDOMs()) {
			const tile = getTile(id);
			if (
				tile?.type === "term" &&
				tile.ptySessionId === payload.sessionId
			) {
				tileManager.closeCanvasTile(id);
				minimap.update();
				break;
			}
		}
	});

	// -- Tile list init + click-to-navigate --

	tileListWebview.webview.addEventListener(
		"dom-ready", () => {
			lastTileSnapshot = new Map();
			const initEntries = [];
			for (const [id] of tileManager.getTileDOMs()) {
				const tile = getTile(id);
				if (tile) {
					const entry = buildTileListEntry(tile);
					initEntries.push(entry);
					lastTileSnapshot.set(id, entry);
				}
			}
			tileListWebview.send("tile-list:init", initEntries);

			const focusedId = tileManager.getFocusedTileId();
			if (focusedId) {
				tileListWebview.send(
					"tile-list:focus", focusedId,
				);
			}
		},
	);

	tileListWebview.webview.addEventListener(
		"ipc-message", (event) => {
			if (event.channel === "tile-list:peek-tile") {
				const tileId = event.args[0];
				const tile = getTile(tileId);
				if (tile) {
					edgeIndicators.panToTile(
						tile, { targetZoom: 1 },
					);
				}
			} else if (event.channel === "tile-list:focus-tile") {
				const tileId = event.args[0];
				const tile = getTile(tileId);
				if (tile) {
					edgeIndicators.panToTile(
						tile, { targetZoom: 1 },
					);
					tileManager.focusCanvasTile(tileId);
				}
			} else if (event.channel === "tile-list:rename-tile") {
				const tileId = event.args[0];
				const newTitle = event.args[1];
				tileManager.renameTile(tileId, newTitle);
			}
		},
	);

	// -- Nav resize --

	panelManager.setupResize(() => {
		panelManager.updateTogglePosition();
	});

	const panelsEl = document.getElementById("panels");
	new ResizeObserver(() => {
		panelManager.updateTogglePosition();
		agentPanel.updateTogglePosition();
	}).observe(panelsEl);

	// -- Nav toggle --

	navToggle.addEventListener("click", () => {
		panelManager.toggle();
	});

	agentToggle.addEventListener("click", () => {
		agentPanel.toggle();
	});

	// -- Settings --

	settingsBackdrop.addEventListener("click", () => {
		window.shellApi.closeSettings();
	});

	window.shellApi.onSettingsToggle((action) => {
		const open = action === "open";
		settingsModalOpen = open;
		if (open) {
			blurNonModalSurfaces();
		} else {
			singletonWebviews.settings.webview.blur();
		}
		setUnderlyingShellInert(open);
		settingsOverlay.classList.toggle("visible", open);
		if (open) {
			focusSurface("settings");
			return;
		}
		focusSurface(lastNonModalSurface);
	});

	// -- Update pill --

	let updateState = { status: "idle" };
	const isDevMode = import.meta.env.DEV;

	function renderUpdatePill() {
		if (updateState.status === "downloading") {
			updatePill.style.display = "inline-block";
			updatePill.classList.add("is-downloading");
			updatePill.classList.remove("is-error");
			updatePill.textContent =
				`Updating ${Math.round(updateState.progress ?? 0)}%`;
			updatePill.title = "Downloading update...";
		} else if (updateState.status === "installing") {
			updatePill.style.display = "inline-block";
			updatePill.classList.add("is-downloading");
			updatePill.classList.remove("is-error");
			updatePill.textContent = "Installing…";
			updatePill.title =
				"Extracting and verifying update...";
		} else if (updateState.status === "available") {
			updatePill.style.display = "inline-block";
			updatePill.classList.remove("is-downloading");
			updatePill.classList.remove("is-error");
			updatePill.textContent = "Download & Update";
			updatePill.title =
				`Click to download v${updateState.version}`;
		} else if (updateState.status === "ready") {
			updatePill.style.display = "inline-block";
			updatePill.classList.remove("is-downloading");
			updatePill.classList.remove("is-error");
			updatePill.textContent = "Update & Restart";
			updatePill.title =
				`Click to install v${updateState.version}`;
		} else if (updateState.status === "error") {
			updatePill.style.display = "inline-block";
			updatePill.classList.remove("is-downloading");
			updatePill.classList.add("is-error");
			updatePill.textContent = "Update failed — retry";
			updatePill.title =
				updateState.error || "Update failed";
		} else if (isDevMode) {
			updatePill.style.display = "inline-block";
			updatePill.classList.remove("is-downloading");
			updatePill.classList.remove("is-error");
			updatePill.textContent =
				updateState.status === "checking"
					? "Checking…"
					: "Check for Update";
			updatePill.title = "Click to check for updates";
		} else {
			updatePill.style.display = "none";
			updatePill.classList.remove("is-downloading");
			updatePill.classList.remove("is-error");
		}
	}

	window.shellApi.updateGetStatus().then((s) => {
		updateState = s;
		renderUpdatePill();
	}).catch(() => {});

	window.shellApi.onUpdateStatus((s) => {
		updateState = s;
		renderUpdatePill();
	});

	newTileBtn.addEventListener("click", async () => {
		const selected = await window.shellApi.showContextMenu([
			{ id: "new-terminal", label: "New terminal tile" },
			{ id: "new-browser", label: "New browser tile" },
		]);
		const type = selected === "new-terminal" ? "term" : selected === "new-browser" ? "browser" : null;
		if (!type) return;
		const rect = panelViewer.getBoundingClientRect();
		const size = defaultSize(type);
		const cx = (rect.width / 2 - viewportState.panX) / viewportState.zoom - size.width / 2;
		const cy = (rect.height / 2 - viewportState.panY) / viewportState.zoom - size.height / 2;
		if (type === "term") {
			const cwd = getTerminalCwd();
			const tile = tileManager.createCanvasTile("term", cx, cy, { cwd });
			tileManager.spawnTerminalWebview(tile, true);
		} else {
			const tile = tileManager.createCanvasTile("browser", cx, cy);
			tileManager.spawnBrowserWebview(tile, true);
		}
		tileManager.saveCanvasImmediate();
		minimap.update();
	});

	settingsBtn.addEventListener("click", () => {
		window.shellApi.toggleSettings();
	});

	updatePill.addEventListener("click", () => {
		if (
			updateState.status === "downloading" ||
			updateState.status === "installing"
		) return;
		if (updateState.status === "available") {
			window.shellApi.updateDownload();
		} else if (updateState.status === "ready") {
			window.shellApi.updateInstall();
		} else if (updateState.status === "error") {
			updateState = { status: "idle" };
			renderUpdatePill();
			window.shellApi.updateCheck();
		} else if (
			isDevMode &&
			(updateState.status === "idle" ||
				updateState.status === "checking")
		) {
			window.shellApi.updateCheck();
		}
	});

	// -- Loading --

	window.shellApi.onLoadingStatus((message) => {
		loadingStatusEl.textContent = message;
	});

	window.shellApi.onLoadingDone(() => {
		loadingOverlay.classList.add("fade-out");
		setTimeout(() => {
			loadingOverlay.remove();
		}, 350);
		checkFirstLaunchDialog();
	});

	// -- Drag-and-drop (window-level) --

	window.addEventListener("dragenter", (e) => {
		e.preventDefault();
		dragCounter++;
		if (dragCounter === 1 && dragDropOverlay) {
			dragDropOverlay.classList.add("visible");
		}
	});

	window.addEventListener("dragover", (e) => {
		e.preventDefault();
	});

	window.addEventListener("dragleave", (e) => {
		e.preventDefault();
		dragCounter = Math.max(0, dragCounter - 1);
		if (dragCounter === 0 && dragDropOverlay) {
			dragDropOverlay.classList.remove("visible");
		}
	});

	window.addEventListener("drop", async (e) => {
		e.preventDefault();
		dragCounter = 0;
		if (dragDropOverlay) {
			dragDropOverlay.classList.remove("visible");
		}

		const rect = canvasEl.getBoundingClientRect();
		const screenX = e.clientX - rect.left;
		const screenY = e.clientY - rect.top;
		const cx =
			(screenX - viewportState.panX) / viewportState.zoom;
		const cy =
			(screenY - viewportState.panY) / viewportState.zoom;

		// Extract Finder file paths synchronously — native file
		// handles on DataTransfer are invalidated after the first
		// await, so getPathForFile must run before getDragPaths.
		const finderPaths = [];
		if (e.dataTransfer?.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				let p = "";
				try {
					p = window.shellApi.getPathForFile(
						e.dataTransfer.files[i],
					);
				} catch { /* skip non-file items */ }
				if (p) finderPaths.push(p);
			}
		}

		let paths = [];
		if (window.shellApi.getDragPaths) {
			try {
				paths = await window.shellApi.getDragPaths();
			} catch { /* noop */ }
		}
		if (paths.length === 0) {
			paths = finderPaths;
		}
		if (paths.length === 0) return;

		const viewerRect = panelViewer.getBoundingClientRect();
		if (e.clientX < viewerRect.left) return;

		// Filter out directories in parallel (folder drops not supported)
		const checks = paths.map(async (p) => {
			const isDir = await window.shellApi.isDirectory(p);
			return isDir ? null : p;
		});
		const filePaths = (await Promise.all(checks)).filter(Boolean);
		if (filePaths.length === 0) return;

		// If drop landed on a terminal tile, paste paths into the PTY
		const targetTile = tileAtPoint(cx, cy);
		if (targetTile && targetTile.type === "term" && targetTile.ptySessionId) {
			const escaped = filePaths.map(
				(p) => "'" + p.replace(/'/g, "'\\''") + "'",
			);
			window.shellApi.ptyWrite(
				targetTile.ptySessionId,
				escaped.join(" "),
			);
			tileManager.focusCanvasTile(targetTile.id);
			return;
		}

		for (let i = 0; i < filePaths.length; i++) {
			const filePath = filePaths[i];
			const type = inferTileType(filePath);
			tileManager.createFileTile(
				type, cx + i * 30, cy + i * 30, filePath,
			);
		}
	});

	if (dragDropOverlay) {
		dragDropOverlay.addEventListener("transitionend", () => {
			if (!dragDropOverlay.classList.contains("visible")) {
				for (const h of getAllWebviews()) {
					h.webview.style.pointerEvents = "";
				}
			}
		});
	}

	// -- Restore canvas state --

	const savedState = await window.shellApi.canvasLoadState();
	if (savedState) {
		const { centerX, centerY, zoom } = savedState.viewport;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		viewportState.zoom = zoom ?? 1;
		viewportState.panX = centerX != null
			? w / 2 - centerX * viewportState.zoom
			: 0;
		viewportState.panY = centerY != null
			? h / 2 - centerY * viewportState.zoom
			: 0;
		viewport.updateCanvas();
		tileManager.restoreCanvasState(savedState.tiles);
		clearConnections();
		for (const conn of savedState.connections ?? []) {
			if (!conn.id || !conn.tileAId || !conn.tileBId) continue;
			addConnection(conn);
		}
		syncConnectionGraph();
		viewport.redrawGrid();
		minimap.update();
		cableOverlay.update();

		// Batch-sync metadata for restored terminal tiles
		const restoredTermTiles = tiles.filter(
			(t) => t.type === "term" && t.ptySessionId,
		);
		if (restoredTermTiles.length > 0) {
			const discovered =
				await window.shellApi.ptyDiscover?.() ?? [];
			for (const tile of restoredTermTiles) {
				const session = discovered.find(
					(entry) => entry.sessionId === tile.ptySessionId,
				);
				syncTerminalTileMeta(tile, session?.meta);
			}
			tileManager.saveCanvasDebounced();
		}
	}

	// -- Initialize workspaces --

	navWebview.send(
		"workspace-init", workspaceData.workspaces,
	);

	panelManager.applyVisibility();

	// -- beforeunload save --

	window.addEventListener("beforeunload", () => {
		tileManager.saveCanvasImmediate();
	});
}

async function checkFirstLaunchDialog() {
	const offered = await window.shellApi.hasOfferedPlugin();
	if (offered) return;

	const agents = await window.shellApi.getAgents();

	const dialog =
		document.getElementById("canvas-skill-dialog");
	const agentsContainer =
		document.getElementById("canvas-skill-agents");
	const skipBtn =
		document.getElementById("canvas-skill-skip");
	const installBtn =
		document.getElementById("canvas-skill-install");
	if (
		!dialog || !agentsContainer || !skipBtn || !installBtn
	) return;

	agentsContainer.innerHTML = "";
	const checkboxes = [];

	for (const agent of agents) {
		const row = document.createElement("label");
		row.className = "canvas-skill-agent-row";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = agent.detected;
		checkbox.dataset.agentId = agent.id;
		checkboxes.push(checkbox);

		const name = document.createElement("span");
		name.className = "agent-name";
		name.textContent = agent.name;

		const badge = document.createElement("span");
		badge.className = agent.detected
			? "agent-badge detected"
			: "agent-badge not-found";
		badge.textContent =
			agent.detected ? "detected" : "not found";

		row.appendChild(checkbox);
		row.appendChild(name);
		row.appendChild(badge);
		agentsContainer.appendChild(row);
	}

	dialog.classList.remove("hidden");

	function closeDialog() {
		dialog.classList.add("hidden");
		window.shellApi.markPluginOffered();
	}

	skipBtn.addEventListener(
		"click", closeDialog, { once: true },
	);

	installBtn.addEventListener("click", async function onInstall() {
		installBtn.disabled = true;
		installBtn.textContent = "Installing…";
		// Clear previous error if retrying
		dialog.querySelector(".canvas-skill-error")?.remove();
		const errors = [];
		for (const cb of checkboxes) {
			if (cb.checked) {
				try {
					const result = await window.shellApi.installSkill(
						cb.dataset.agentId,
					);
					if (result && !result.ok) {
						errors.push(`${cb.dataset.agentId}: ${result.error}`);
					}
				} catch (err) {
					errors.push(`${cb.dataset.agentId}: ${err.message || err}`);
				}
			}
		}
		if (errors.length > 0) {
			installBtn.textContent = "Install";
			installBtn.disabled = false;
			const errEl = document.createElement("p");
			errEl.className = "canvas-skill-error";
			errEl.textContent =
				`Install failed: ${errors.join("; ")}`;
			dialog.querySelector("#canvas-skill-actions")
				?.insertAdjacentElement("beforebegin", errEl);
			return;
		}
		installBtn.removeEventListener("click", onInstall);
		closeDialog();
	});
}

init().catch((err) => {
	console.error("[shell] init() failed:", err);
	const el = document.getElementById("loading-status");
	if (el) el.textContent = `ERROR: ${err?.message || err}`;
});
