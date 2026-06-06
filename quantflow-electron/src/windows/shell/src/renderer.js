import "./shell.css";
import "./legend-v1.css";
import "./tooltip.js";
import {
	tiles, connections, getTile, defaultSize, inferTileType, tileAtPoint,
	selectTile, clearSelection, getSelectedTiles, getNearestTileInDirection,
	addConnection, removeConnection, updateConnectionLabel, clearConnections,
	generateId,
} from "./canvas-state.js";
import { attachMarquee } from "./tile-interactions.js";
import { initDarkMode, applyCanvasOpacity } from "./dark-mode.js";
import { applyDensity } from "./density-controller.js";
import {
	applyThemeMode,
	watchSystemTheme,
} from "./theme-controller.js";
import { createWebview, isFocusSearchShortcut } from "./webview-factory.js";
import {
	createCommandPalette,
	formatConnectionCommandTitle,
	formatContextInjectionSubtitle,
	formatContextInjectionTitle,
	formatRelayLogDetail,
} from "./command-palette.js";
import { createViewport } from "./canvas-viewport.js";
import { createEdgeIndicators } from "./edge-indicators.js";
import { createMinimap } from "./canvas-minimap.js";
import { createPanel } from "./panel-manager.js";
import { createWorkspaceManager } from "./workspace-manager.js";
import { confirmTileClose } from "./pty-close-confirmation.js";
import {
	SHORTCUTS,
	shortcutToCommand,
	shouldOpenShortcutPanel,
} from "./shortcut-registry.js";
import { createShortcutPanel } from "./shortcut-panel.js";
import {
	createCanvasRpc,
	createConnectionLabelEvent,
	createConnectionMutationEvent,
	createRoleSpawnedEvent,
	createRoleSpawnFailureEvent,
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
	updateHerdrBadge,
	getTileLabel,
} from "./tile-renderer.js";
import { formatCableContextRelay } from "./cable-overlay.js";
import { createCableInspector } from "./cable-inspector.js";
import { clearCablePreview, renderCablePreview, renderCables } from "./cable-renderer.js";
import {
	shouldCancelCableDrawMode,
	shouldEnterCableDrawMode,
	shouldExitCableDrawModeOnKeyup,
	shouldStartCableDraw,
} from "./cable-draw-mode.js";
import {
	WATCHTOWER_AGENT_FILTERS,
	WATCHTOWER_ALERT_FILTERS,
	WATCHTOWER_EVENT_FILTERS,
	WATCHTOWER_MESSAGE_FILTERS,
	WATCHTOWER_TABS,
	createConnectionCounts,
	createWatchtowerQueueDepthsFromDb,
	createWatchtowerSummary,
	dbEventsToWatchtowerEvents,
	formatWatchtowerDiagnostics,
	formatWatchtowerFilterLabel,
	groupEventsByCorrelation,
	getWatchtowerRetryRequest,
	renderWatchtowerAgents,
	renderWatchtowerAlerts,
	renderWatchtowerAttention,
	renderWatchtowerEvents,
	renderWatchtowerQueues,
	renderWatchtowerRail,
	runWatchtowerFocusPlan,
} from "./watchtower-view.js";
import {
	createPtyStartFailureDiagnostic,
	createPtyRestoreFailureDiagnostic,
	normalizeLaunchDiagnostic,
	renderLaunchDiagnostics,
} from "./launch-diagnostics-view.js";
import { formatRoleStartupEvent } from "./role-startup.js";
import { createLegendDock, LEGEND_RECIPES } from "./legend-dock.js";
import { spawnRoleTileAt as spawnRoleTileAtShared } from "./role-tile-spawn.js";
import {
	LEGEND_TILE_SIZE,
	getLegendClickPlacement,
	getLegendViewportCenterPlacement,
	resolveLegendRecipeRole,
} from "./legend-spawn.js";

const CANVAS_DBLCLICK_SUPPRESS_MS = 500;
const PLATFORM = window.shellApi.getPlatform();
const IS_WINDOWS = PLATFORM === "win32";
const IS_MAC = PLATFORM === "darwin";

const viewportState = { panX: 0, panY: 0, zoom: 1 };

const canvasEl = document.getElementById("panel-viewer");
const gridCanvas = document.getElementById("grid-canvas");
canvasEl.tabIndex = -1;
const toasts = createToastController({ document });
const operationalEvents = createOperationalEventLog({ limit: 120 });
const viewport = createViewport(canvasEl, gridCanvas, tiles);

document.documentElement.classList.toggle("platform-win", IS_WINDOWS);
document.body.classList.toggle("platform-win", IS_WINDOWS);

// -- Appearance --

let activeThemeMode = "dark";
let stopSystemThemeWatch = () => {};
let viewportReady = false;

function applyThemePreference(value) {
	activeThemeMode = applyThemeMode(value);
	if (viewportReady) viewport.updateCanvas();
	stopSystemThemeWatch();
	stopSystemThemeWatch = activeThemeMode === "system"
		? watchSystemTheme(() => {
			applyThemeMode(activeThemeMode);
			if (viewportReady) viewport.updateCanvas();
		})
		: () => {};
}

initDarkMode();

window.shellApi.getPref("theme")
	.then((value) => applyThemePreference(value))
	.catch(() => applyThemePreference("dark"));

window.shellApi.getPref("density")
	.then((value) => applyDensity(value))
	.catch(() => applyDensity("comfortable"));

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
	} else if (key === "theme") {
		applyThemePreference(value);
	} else if (key === "density") {
		applyDensity(value);
	}
});

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
	const legendSpawnGhost = document.createElement("div");
	legendSpawnGhost.className = "lv1-spawn-ghost";
	legendSpawnGhost.hidden = true;
	panelViewer.appendChild(legendSpawnGhost);
	const legendDock = createLegendDock({
		document,
		container: panelViewer,
		storage: window.localStorage,
		getTileCount: () => tiles.length,
		onRecipeActivate: ({ recipeId, spawnMode, event }) => {
			handleLegendRecipeActivate(recipeId, spawnMode, event);
		},
	});
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
	let pendingLegendRecipeId = null;
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
		if (changed) {
			syncTileList();
			updateCables();
		}
	}

	const tileListEntryFields = [
		"title",
		"description",
		"status",
		"groupLabel",
		"metaLabel",
		"routeHandle",
	];

	function sameTileListEntry(prev, next) {
		return tileListEntryFields.every(
			(field) => prev?.[field] === next?.[field],
		);
	}

	function pathBaseName(value) {
		const text = String(value ?? "").trim().replace(/[\\/]+$/, "");
		if (!text) return "";
		const parts = text.split(/[\\/]+/).filter(Boolean);
		return parts.at(-1) ?? text;
	}

	function browserHost(value) {
		const text = String(value ?? "").trim();
		if (!text) return "";
		try {
			return new URL(text).hostname;
		} catch {
			return text;
		}
	}

	function typeGroupLabel(type) {
		if (type === "term") return "Terminal Sessions";
		if (type === "browser") return "Browsers";
		if (type === "graph") return "Graphs";
		if (type === "note") return "Notes";
		if (type === "code") return "Code";
		if (type === "image") return "Images";
		return "Other Tiles";
	}

	function buildTileGroupLabel(tile, label) {
		if (tile.type === "term") {
			return tile.roleName ? `${tile.roleName} Agents` : "Terminal Sessions";
		}
		const parent = pathBaseName(label.parent);
		return parent || typeGroupLabel(tile.type);
	}

	function buildTileMetaLabel(tile, label, description) {
		if (tile.type === "term") {
			return [
				tile.routeHandle ? `@${tile.routeHandle}` : null,
				tile.roleName || tile.roleId || null,
				description,
			].filter(Boolean).join(" / ");
		}
		if (tile.type === "browser") return browserHost(tile.url) || "Browser";
		if (label.parent) return label.parent;
		return description;
	}

	function buildTileRegistryMeta() {
		return {
			workspaceName: pathBaseName(workspaceData.workspaces?.[0]) || "Workspace",
		};
	}

	const statusEls = {
		workspace: document.getElementById("status-workspace-name"),
		tileCount: document.getElementById("status-tile-count"),
		healthLed: document.getElementById("status-health-led"),
		healthLabel: document.getElementById("status-health-label"),
		zoom: document.getElementById("status-zoom"),
		version: document.getElementById("status-version"),
		paletteHint: document.getElementById("status-palette-hint"),
	};

	function normalizeHealthLevel(value) {
		const level = value?.level;
		if (level === "healthy" || level === "degraded" || level === "down") {
			return level;
		}
		if (value?.ok === true) return "healthy";
		if (value?.ok === false) return "down";
		return "unknown";
	}

	function healthLabel(level) {
		if (level === "healthy") return "Health good";
		if (level === "degraded") return "Health degraded";
		if (level === "down" || level === "error") return "Health down";
		return "Health unknown";
	}

	function updateStatusBar() {
		if (statusEls.workspace) {
			statusEls.workspace.textContent =
				pathBaseName(workspaceData.workspaces?.[0]) || "Workspace";
		}
		if (statusEls.tileCount) {
			statusEls.tileCount.textContent = String(tiles.length);
		}
		if (statusEls.zoom) {
			statusEls.zoom.textContent = `${Math.round(viewportState.zoom * 100)}%`;
		}
		if (statusEls.paletteHint) {
			statusEls.paletteHint.textContent = IS_MAC ? "Cmd+K" : "Ctrl+K";
		}
		legendDock.updateEmptyHint();
	}

	function setHealthStatus(level) {
		if (statusEls.healthLed) {
			statusEls.healthLed.dataset.level = level;
		}
		if (statusEls.healthLabel) {
			statusEls.healthLabel.textContent = healthLabel(level);
		}
	}

	async function refreshStatusHealth() {
		if (!window.shellApi.diagnosticsHealth) return;
		try {
			const result = await window.shellApi.diagnosticsHealth();
			setHealthStatus(normalizeHealthLevel(result));
		} catch {
			setHealthStatus("error");
		}
	}

	window.shellApi.appVersion()
		.then((version) => {
			if (statusEls.version) statusEls.version.textContent = `v${version}`;
		})
		.catch(() => {
			if (statusEls.version) statusEls.version.textContent = "v?";
		});

	updateStatusBar();
	void refreshStatusHealth();
	setInterval(() => {
		void refreshStatusHealth();
	}, 60_000);

	function buildTileListEntry(tile) {
		let title = tile.id;
		let description = "";
		let status = null;
		const label = getTileLabel(tile);

		if (tile.type === "term") {
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
			groupLabel: buildTileGroupLabel(tile, label),
			metaLabel: buildTileMetaLabel(tile, label, description),
			routeHandle: tile.routeHandle || null,
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
			if (!prev || !sameTileListEntry(prev, entry)) {
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
		updateStatusBar();
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

	function clientToCanvasPoint(clientX, clientY) {
		const rect = canvasEl.getBoundingClientRect();
		return {
			x: (clientX - rect.left - viewportState.panX) / viewportState.zoom,
			y: (clientY - rect.top - viewportState.panY) / viewportState.zoom,
		};
	}

	function onCableMousedown(tile, e, opts = {}) {
		if (!shouldStartCableDraw({ cableHeld, force: opts.force })) return false;
		e.preventDefault();
		e.stopPropagation();
		canvasEl.classList.add("cable-draw-mode");
		showCableModeHud();
		const sourceSide = opts.sourceSide ?? "E";
		if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
			renderCablePreview(
				cableLayerContent,
				tile,
				sourceSide,
				clientToCanvasPoint(e.clientX, e.clientY),
			);
		}

		function onMove(ev) {
			renderCablePreview(
				cableLayerContent,
				tile,
				sourceSide,
				clientToCanvasPoint(ev.clientX, ev.clientY),
			);
		}

		function onUp(ev) {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);

			const point = clientToCanvasPoint(ev.clientX, ev.clientY);
			const cx = point.x;
			const cy = point.y;
			const targetPort = ev.target?.closest?.(".tile-port");
			const targetSide = targetPort?.dataset?.side ?? "W";
			const targetTile = targetPort?.dataset?.tileId
				? getTile(targetPort.dataset.tileId)
				: tileAtPoint(cx, cy);

			// Silent cancel: released over empty canvas — no toast, just clear.
			if (!targetTile) {
				clearCablePreview(cableLayerContent);
				if (!cableHeld) {
					canvasEl.classList.remove("cable-draw-mode");
					hideCableHud();
				}
				return;
			}

			const dropResult = resolveCableDrop({
				sourceTile: tile,
				targetTile,
				connections,
				sourceSide,
				targetSide,
			});
			let feedbackShown = false;

			if (dropResult.ok) {
				const now = Date.now();
				const conn = {
					id: `conn-${now}-${Math.random().toString(36).slice(2, 7)}`,
					tileAId: dropResult.tileAId,
					tileBId: dropResult.tileBId,
					from: dropResult.from,
					to: dropResult.to,
					kind: "relay",
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
				updateCables();
			} else {
				showCableHud(dropResult.message, "warn", 1800);
				toasts.show({ message: dropResult.message, tone: "warn" });
				feedbackShown = true;
			}
			clearCablePreview(cableLayerContent);
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
		onBeforeClose: (tile, options = {}) =>
			confirmTileClose(tile, {
				event: options.event,
				showConfirmDialog: window.shellApi.showConfirmDialog,
			}),
		onCableMousedown,
		onReposition: () => { viewport.redrawGrid(); minimapRef?.update(); updateCables(); },
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
			updateCables();
		},
		onTerminalCwdChanged(cwd) {
			setLastTerminalCwd(cwd);
		},
		onTerminalStartFailed(tile, payload) {
			const wasRestoring = tile.ptyStatus === "restoring";
			const diagnostic = upsertLaunchDiagnostic(
				wasRestoring
					? createPtyRestoreFailureDiagnostic(payload, tile)
					: createPtyStartFailureDiagnostic(payload, tile),
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
		onCablePortMouseDown(id, side, e) {
			const tile = getTile(id);
			if (tile) onCableMousedown(tile, e, { force: true, sourceSide: side });
		},
		onConnectionsChanged: syncConnectionGraph,
	});

	// -- Cable overlay --

	function removeConnectionById(id) {
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
		updateCables();
	}

	async function sendCableMessage(req) {
		try {
			const result = await window.shellApi.stringRelay?.(req);
			recordRelayOperationalEvent(result, req);
			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Relay failed.";
			recordRelayOperationalEvent({ ok: false, message }, req, message);
			throw err;
		}
	}

	function getCableLog(connectionId, limit) {
		return window.shellApi.stringGetLog?.(connectionId, limit);
	}

	async function injectCableContext(req) {
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
	}

	function focusCableTile(id) {
		const tile = getTile(id);
		if (!tile) return;
		edgeIndicators.panToTile(tile, { targetZoom: 1 });
		tileManager.focusCanvasTile(tile.id);
	}

	function updateCableLabel(id, label) {
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
		updateCables();
	}

	const cableInspector = createCableInspector({
		containerEl: canvasEl,
		viewportState,
		onSendMessage: sendCableMessage,
		onGetLog: getCableLog,
		onNotify: (message, tone = "info") => toasts.show({ message, tone }),
		onInjectContext: injectCableContext,
		onFocusTile: focusCableTile,
		onRemoveConnection: removeConnectionById,
		onUpdateLabel: updateCableLabel,
		onGetFocusedTileId: () => tileManager.getFocusedTileId(),
		onStateChanged: () => updateCables(),
	});

	// -- Cable layer (SVG renderer + inspector) --
	const cableLayerContent = document.getElementById("cable-layer-content");
	function updateCables() {
		if (cableLayerContent) {
			renderCables(cableLayerContent, connections, tiles, viewportState, {
				onShiftDelete: removeConnectionById,
				onSelect: (id, event) => {
					const rect = canvasEl.getBoundingClientRect();
					cableInspector.selectConnection(id, {
						pointer: {
							x: event.clientX - rect.left,
							y: event.clientY - rect.top,
						},
					});
				},
				onContextMenu: (id, event) =>
					cableInspector.openContextMenu(id, event.clientX, event.clientY),
				selectedConnectionId: cableInspector.getSelectedConnectionId(),
				getRelayState: (id) => cableInspector.getRelayState(id),
			});
		}
	}

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
			updateCables();
		},
		onConnectionRemoved(conn, tileA, tileB) {
			operationalEvents.record(createConnectionMutationEvent(
				"removed", conn, tileA, tileB, tileEventLabel,
			));
			updateCables();
		},
		onConnectionUpdated(conn, tileA, tileB) {
			operationalEvents.record(createConnectionLabelEvent(
				conn, tileA, tileB, tileEventLabel,
			));
			updateCables();
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
		onRoleSpawned(event) {
			operationalEvents.record(event);
		},
		onRoleSpawnFailed(event) {
			operationalEvents.record(event);
			toasts.show({
				message: event.summary || "Role spawn failed.",
				tone: "error",
			});
		},
	});

	function getViewportCenterForSize(size) {
		const rect = panelViewer.getBoundingClientRect();
		return {
			x: (rect.width / 2 - viewportState.panX) / viewportState.zoom -
				size.width / 2,
			y: (rect.height / 2 - viewportState.panY) / viewportState.zoom -
				size.height / 2,
		};
	}

	function getLegendPlacementOptions() {
		return {
			tileSize: LEGEND_TILE_SIZE,
			viewportWidth: panelViewer.clientWidth,
			viewportHeight: panelViewer.clientHeight,
			panX: viewportState.panX,
			panY: viewportState.panY,
			zoom: viewportState.zoom,
			dockWidth: legendDock.root.offsetWidth || 56,
		};
	}

	function moveLegendSpawnGhost(clientX, clientY) {
		const rect = panelViewer.getBoundingClientRect();
		legendSpawnGhost.style.left = `${clientX - rect.left}px`;
		legendSpawnGhost.style.top = `${clientY - rect.top}px`;
	}

	function clearPendingLegendRecipe() {
		pendingLegendRecipeId = null;
		legendSpawnGhost.hidden = true;
		legendDock.state.clearPendingRecipe();
	}

	function beginLegendClickToPlace(recipeId, event = null) {
		pendingLegendRecipeId = recipeId;
		legendSpawnGhost.hidden = false;
		if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
			moveLegendSpawnGhost(event.clientX, event.clientY);
		}
	}

	async function spawnLegendRecipeAt(recipeId, position) {
		const roles = await window.shellApi.rolesList?.() ?? [];
		const role = resolveLegendRecipeRole(recipeId, roles);
		const recipe = LEGEND_RECIPES.find((entry) => entry.id === recipeId);
		if (!role) {
			const message = `Legend recipe role not found: ${recipeId}`;
			operationalEvents.record({
				type: "legend.spawn_failed",
				severity: "warn",
				summary: message,
				meta: { recipeId },
			});
			toasts.show({ message, tone: "error" });
			return null;
		}
		const tile = await spawnRoleTileAt(role, position.x, position.y, {
			size: LEGEND_TILE_SIZE,
			displayName: recipe?.name ?? role.name,
		});
		legendDock.updateEmptyHint();
		return tile;
	}

	function handleLegendRecipeActivate(recipeId, spawnMode, event = null) {
		if (spawnMode === "click") {
			beginLegendClickToPlace(recipeId, event);
			return;
		}
		clearPendingLegendRecipe();
		const position = getLegendViewportCenterPlacement(getLegendPlacementOptions());
		void spawnLegendRecipeAt(recipeId, position);
	}

	function spawnTerminalTileAt(x, y) {
		const cwd = getTerminalCwd();
		const size = getTerminalSize();
		const tile = tileManager.createCanvasTile(
			"term", x, y, { cwd, ...size },
		);
		tileManager.spawnTerminalWebview(tile, true);
		tileManager.saveCanvasImmediate();
		minimap.update();
		return tile;
	}

	function spawnBrowserTileAt(x, y) {
		const tile = tileManager.createCanvasTile("browser", x, y);
		tileManager.spawnBrowserWebview(tile, true);
		tileManager.saveCanvasImmediate();
		minimap.update();
		return tile;
	}

	function updateRoleTileChrome(tile) {
		const dom = tileManager.getTileDOMs().get(tile.id);
		if (dom) updateTileTitle(dom, tile);
	}

	async function spawnRoleTileAt(role, x, y, options = {}) {
		return spawnRoleTileAtShared({
			tileManager,
			generateId,
			getTerminalCwd,
			getTerminalSize,
			shellApi: window.shellApi,
			workspaceId: workspaceData.workspaces?.[0],
			canvasId: workspaceData.workspaces?.[0],
			onRoleSpawned: (event) => operationalEvents.record(event),
			onRoleSpawnFailed: (event) => operationalEvents.record(event),
			isMissingRoleCommand,
			getRoleCommandName,
			createRoleSpawnFailureEvent,
			createRoleSpawnedEvent,
			updateRoleTileChrome,
			minimap,
			toasts,
		}, role, x, y, options);
	}

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

	viewportReady = true;
	viewport.init(viewportState, () => {
		tileManager.repositionAllTiles();
		edgeIndicators.update();
		minimap.update();
		updateCables();
		updateStatusBar();
		tileManager.saveCanvasDebounced();
	});

	edgeIndicators.update();
	minimap.update();
	updateCables();

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
			spawnTerminalTileAt(cx, cy);
		} else if (selected === "new-browser") {
			spawnBrowserTileAt(cx, cy);
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
			void spawnRoleTileAt(role, cx, cy);
		}
	});

	panelViewer.addEventListener("mousemove", (event) => {
		if (!pendingLegendRecipeId) return;
		moveLegendSpawnGhost(event.clientX, event.clientY);
	});

	panelViewer.addEventListener("click", (event) => {
		if (!pendingLegendRecipeId) return;
		if (legendDock.root.contains(event.target)) return;
		if (newTileBtn?.contains(event.target)) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = panelViewer.getBoundingClientRect();
		const position = getLegendClickPlacement({
			...getLegendPlacementOptions(),
			clientX: event.clientX,
			clientY: event.clientY,
			rectLeft: rect.left,
			rectTop: rect.top,
		});
		const recipeId = pendingLegendRecipeId;
		clearPendingLegendRecipe();
		void spawnLegendRecipeAt(recipeId, position);
	}, true);

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
		if (e.key === "Escape" && pendingLegendRecipeId) {
			clearPendingLegendRecipe();
			return;
		}

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
	let watchtowerTab = "events";
	let watchtowerAgentFilter = "all";
	let watchtowerMessageFilter = "all";
	let watchtowerEventFilter = "all";
	let watchtowerAlertFilter = "all";
	let watchtowerQuery = "";
	let watchtowerPaused = false;
	let watchtowerTimer = null;
	let watchtowerRelayLogCache = [];
	const watchtowerEl = document.createElement("div");
	watchtowerEl.id = "watchtower-panel";
	watchtowerEl.hidden = true;
	watchtowerEl.innerHTML = `
		<div class="wt-header">
			<div class="wt-title-block">
				<span class="wt-live-dot" aria-hidden="true"></span>
				<span class="wt-title">Watchtower</span>
			</div>
			<div class="wt-tabs">
				${WATCHTOWER_TABS.map((tab) => `
					<button class="wt-tab ${tab === watchtowerTab ? "active" : ""}" data-tab="${tab}" type="button">
						<span>${watchtowerTabLabel(tab)}</span>
						<span class="wt-tab-count">0</span>
					</button>
				`).join("")}
			</div>
			<input class="wt-search" type="search" placeholder="Filter" spellcheck="false" />
			<button class="wt-pause" type="button" aria-pressed="false">Pause</button>
			<button class="wt-clear" type="button">Clear</button>
			<button class="wt-copy" type="button" title="Copy diagnostics">Copy</button>
			<button class="wt-refresh" type="button" title="Refresh">Refresh</button>
			<button class="wt-close" type="button" aria-label="Collapse Watchtower">×</button>
		</div>
		<div class="wt-filter-bar"></div>
		<div class="wt-content">
			<div class="wt-body"></div>
			<div class="wt-rail-slot"></div>
		</div>
	`;
	document.body.appendChild(watchtowerEl);

	function watchtowerTabLabel(tab) {
		if (tab === "queues") return "Queues";
		if (tab === "agents") return "Agents";
		if (tab === "alerts") return "Alerts";
		return "Events";
	}

	function updateWatchtowerTabs(summary) {
		for (const tab of watchtowerEl.querySelectorAll(".wt-tab")) {
			const name = tab.dataset.tab;
			tab.classList.toggle("active", name === watchtowerTab);
			const count = tab.querySelector(".wt-tab-count");
			if (count) count.textContent = String(summary?.tabs?.[name] ?? 0);
		}
	}

	function setWatchtowerPaused(paused) {
		watchtowerPaused = paused;
		const button = watchtowerEl.querySelector(".wt-pause");
		button.textContent = paused ? "Resume" : "Pause";
		button.setAttribute("aria-pressed", String(paused));
		clearInterval(watchtowerTimer);
		watchtowerTimer = null;
		if (watchtowerVisible && !watchtowerPaused) {
			watchtowerTimer = setInterval(refreshWatchtower, 2000);
		}
	}

	watchtowerEl.querySelector(".wt-refresh").addEventListener("click", () => {
		refreshWatchtower();
	});

	watchtowerEl.querySelector(".wt-clear").addEventListener("click", () => {
		operationalEvents.clear();
		refreshWatchtower();
	});

	watchtowerEl.querySelector(".wt-pause").addEventListener("click", () => {
		setWatchtowerPaused(!watchtowerPaused);
	});

	watchtowerEl.querySelector(".wt-search").addEventListener("input", (e) => {
		watchtowerQuery = e.target.value;
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
				: watchtowerTab === "alerts"
					? WATCHTOWER_ALERT_FILTERS
					: WATCHTOWER_MESSAGE_FILTERS;
		const activeFilter = watchtowerTab === "agents"
			? watchtowerAgentFilter
			: watchtowerTab === "events"
				? watchtowerEventFilter
				: watchtowerTab === "alerts"
					? watchtowerAlertFilter
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
		} else if (watchtowerTab === "alerts") {
			watchtowerAlertFilter = button.dataset.filter;
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
			? cableInspector.selectConnection(row.dataset.connId)
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
		runWatchtowerFocusPlan(row.dataset, {
			onRelay: () => focusWatchtowerRelay(row),
			onTile: (tileId) => focusWatchtowerTile(tileId),
		});
	}

	watchtowerEl.addEventListener("click", (e) => {
		const ackButton = e.target.closest?.(".wt-alert-ack");
		if (ackButton && watchtowerEl.contains(ackButton)) {
			e.preventDefault();
			e.stopPropagation();
			ackButton.closest?.(".wt-alert")?.remove();
			return;
		}
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
		const rail = watchtowerEl.querySelector(".wt-rail-slot");
		const [
			items,
			relayLogs,
			runtimeEventRows,
			runtimeConnectionRows,
			runtimeCorrelationGroups,
		] = await Promise.all([
			window.shellApi.watchtowerSnapshot?.() ?? [],
			window.shellApi.watchtowerRelayLog?.(50) ?? [],
			window.shellApi.watchtowerRuntimeEvents?.({ limit: 120 }) ?? [],
			window.shellApi.watchtowerRuntimeConnections?.({ limit: 200 }) ?? [],
			window.shellApi.watchtowerRuntimeEventCorrelationGroups?.({ limit: 120 }) ?? [],
		]);
		watchtowerRelayLogCache = Array.isArray(relayLogs) ? relayLogs : [];
		const agentItems = Array.isArray(items) ? items : [];
		const dbEventRows = Array.isArray(runtimeEventRows) ? runtimeEventRows : [];
		const dbConnectionRows = Array.isArray(runtimeConnectionRows) ? runtimeConnectionRows : [];
		const dbCorrelationGroups = Array.isArray(runtimeCorrelationGroups) && runtimeCorrelationGroups.length
			? runtimeCorrelationGroups
			: groupEventsByCorrelation(dbEventRows);
		const eventItems = [
			...operationalEvents.list(),
			...dbEventsToWatchtowerEvents(dbEventRows),
		];
		const dbQueueDepths = createWatchtowerQueueDepthsFromDb(dbConnectionRows);
		const summary = createWatchtowerSummary({
			agents: agentItems,
			relayLogs: watchtowerRelayLogCache,
			operationalEvents: eventItems,
			connections,
			queueDepths: dbQueueDepths.length ? dbQueueDepths : undefined,
			correlationGroups: dbCorrelationGroups,
		});
		updateWatchtowerTabs(summary);
		rail.innerHTML = renderWatchtowerRail({
			agents: agentItems,
			relayLogs: watchtowerRelayLogCache,
			operationalEvents: eventItems,
			connections,
			queueDepths: dbQueueDepths.length ? dbQueueDepths : undefined,
			correlationGroups: dbCorrelationGroups,
		});
		syncTerminalTileStatuses(agentItems);
		const attentionHtml = renderWatchtowerAttention(watchtowerRelayLogCache, {
			operationalEvents: eventItems,
		});
		if (watchtowerTab === "agents") {
			body.innerHTML = attentionHtml + renderWatchtowerAgents(agentItems, {
				filter: watchtowerAgentFilter,
				connectionCounts: createConnectionCounts(connections),
				query: watchtowerQuery,
			});
		} else if (watchtowerTab === "events") {
			body.innerHTML = attentionHtml + renderWatchtowerEvents(eventItems, {
				filter: watchtowerEventFilter,
				query: watchtowerQuery,
			});
		} else if (watchtowerTab === "alerts") {
			body.innerHTML = renderWatchtowerAlerts(watchtowerRelayLogCache, {
				operationalEvents: eventItems,
				filter: watchtowerAlertFilter,
				query: watchtowerQuery,
			});
		} else {
			body.innerHTML = attentionHtml + renderWatchtowerQueues(watchtowerRelayLogCache, {
				filter: watchtowerMessageFilter,
				query: watchtowerQuery,
			});
		}
	}

	function showWatchtower() {
		watchtowerVisible = true;
		watchtowerEl.hidden = false;
		refreshWatchtower();
		if (!watchtowerPaused && !watchtowerTimer) {
			watchtowerTimer = setInterval(refreshWatchtower, 2000);
		}
	}

	function hideWatchtower() {
		watchtowerVisible = false;
		watchtowerEl.hidden = true;
		clearInterval(watchtowerTimer);
		watchtowerTimer = null;
	}

	const commandPalette = createCommandPalette({
		document,
		onClose: () => {
			canvasEl.focus();
			noteSurfaceFocus("canvas");
		},
		onNotify: (message, tone = "info") => toasts.show({ message, tone }),
	});
	const shortcutPanel = createShortcutPanel({
		document,
		platform: PLATFORM,
		shortcuts: SHORTCUTS,
	});

	function buildTileCommandItems() {
		return tiles.map((tile) => {
			const label = tileEventLabel(tile);
			const role = tile.roleName || tile.roleId;
			const subtitle = [
				tile.type,
				role ? `role: ${role}` : null,
				tile.routeHandle ? `route: ${tile.routeHandle}` : null,
			].filter(Boolean).join(" · ");
			return {
				id: `focus-tile:${tile.id}`,
				title: `Focus ${label}`,
				subtitle,
				section: "Tiles",
				keywords: [tile.id, tile.routeHandle, tile.roleName, tile.roleId],
				run: () => {
					edgeIndicators.panToTile(tile, { targetZoom: 1 });
					tileManager.focusCanvasTile(tile.id);
				},
			};
		});
	}

	function buildContextInjectionCommandItems() {
		return tiles
			.filter((tile) => tile.type === "term")
			.map((tile) => {
				const label = tileEventLabel(tile);
				return {
					id: `inject-context:${tile.id}`,
					title: formatContextInjectionTitle(label),
					subtitle: formatContextInjectionSubtitle(tile),
					section: "Context",
					disabled: !tile.ptySessionId,
					keywords: [
						tile.id,
						tile.routeHandle,
						tile.roleName,
						tile.roleId,
						"shared",
						"obsidian",
						"vault",
					],
					run: async () => {
						edgeIndicators.panToTile(tile, { targetZoom: 1 });
						tileManager.focusCanvasTile(tile.id);
						const preview = await window.shellApi.contextPreviewForTile?.();
						if (!preview?.injectedChars) {
							operationalEvents.record({
								type: "context.failed",
								severity: "warn",
								summary: `No shared context to inject into ${label}.`,
								meta: { tileId: tile.id, sessionId: tile.ptySessionId },
							});
							toasts.show({ message: "No shared context to inject.", tone: "warn" });
							return;
						}
						const response = await window.shellApi.showConfirmDialog({
							message: `Inject shared context into ${label}?`,
							detail: formatContextPreviewDetail(preview),
							buttons: ["Cancel", "Inject"],
						});
						if (response !== 1) return;
						await window.shellApi.contextInjectToTile?.(tile.ptySessionId);
						operationalEvents.record({
							type: "context.injected",
							severity: "info",
							summary: `Shared context injected into ${label}`,
							meta: {
								tileId: tile.id,
								sessionId: tile.ptySessionId,
								injectedChars: preview.injectedChars,
								truncated: preview.truncated,
							},
						});
						toasts.show({ message: "Shared context injected.", tone: "info" });
					},
				};
			});
	}

	function buildRoleCommandItems(roles) {
		const size = getTerminalSize();
		return roles.map((role) => ({
			id: `spawn-role:${role.id}`,
			title: `Spawn ${role.name}`,
			subtitle: role.commandTemplate || role.description || "Terminal role",
			section: "Roles",
			disabled: isMissingRoleCommand(role),
			keywords: [role.id, role.description, role.commandTemplate, "agent"],
			run: () => {
				const pos = getViewportCenterForSize(size);
				void spawnRoleTileAt(role, pos.x, pos.y);
			},
		}));
	}

	function focusConnection(conn, { openPopover = true } = {}) {
		const selected = cableInspector.selectConnection(conn.id, { openPopover });
		if (!selected?.tileA || !selected?.tileB) return false;
		edgeIndicators.panToTiles([selected.tileA, selected.tileB]);
		tileManager.focusCanvasTile(selected.tileB.id);
		return true;
	}

	function buildConnectionCommandItems() {
		return connections.flatMap((conn) => {
			const tileA = getTile(conn.tileAId);
			const tileB = getTile(conn.tileBId);
			const title = formatConnectionCommandTitle(
				conn,
				tileA ? tileEventLabel(tileA) : "",
				tileB ? tileEventLabel(tileB) : "",
			);
			const subtitle = conn.label
				? `${conn.id} · ${conn.tileAId} -> ${conn.tileBId}`
				: conn.id;
			const keywords = [
				conn.id,
				conn.label,
				conn.tileAId,
				conn.tileBId,
				tileA?.routeHandle,
				tileB?.routeHandle,
				tileA?.roleName,
				tileB?.roleName,
			];
			return [
				{
					id: `inspect-cable:${conn.id}`,
					title: `Inspect ${title}`,
					subtitle,
					section: "Cables",
					keywords,
					run: () => {
						if (!focusConnection(conn)) {
							toasts.show({ message: "Cable could not be focused.", tone: "warn" });
						}
					},
				},
				{
					id: `relay-log:${conn.id}`,
					title: `Show Relay Log ${title}`,
					subtitle,
					section: "Relay",
					keywords: [...keywords, "message", "history"],
					run: async () => {
						focusConnection(conn, { openPopover: false });
						const logs = await window.shellApi.stringGetLog?.(conn.id, 20);
						await window.shellApi.showConfirmDialog({
							message: title,
							detail: formatRelayLogDetail(logs),
							buttons: ["OK"],
						});
					},
				},
			];
		});
	}

	function buildShortcutCommandItems() {
		const runnable = new Set([
			"toggle-settings",
			"new-tile",
			"close-tile",
			"sidebar-files",
			"sidebar-tiles",
			"toggle-agent",
			"focus-file-search",
			"add-workspace",
			"focus-tile-left",
			"focus-tile-right",
			"focus-tile-up",
			"focus-tile-down",
			"toggle-watchtower",
			"shortcuts-panel",
		]);
		return SHORTCUTS
			.filter((shortcut) => runnable.has(shortcut.actionId))
			.map((shortcut) => ({
				...shortcutToCommand(shortcut, { platform: PLATFORM }),
				run: () => handleShortcut(shortcut.actionId),
			}));
	}

	async function openCommandPalette() {
		const roles = await window.shellApi.rolesList?.() ?? [];
		const baseCommands = [
			{
				id: "new-terminal",
				title: "New Terminal Tile",
				subtitle: getTerminalCwd(),
				section: "Canvas",
				keywords: ["shell", "pty"],
				run: () => {
					const pos = getViewportCenterForSize(getTerminalSize());
					spawnTerminalTileAt(pos.x, pos.y);
				},
			},
			{
				id: "new-browser",
				title: "New Browser Tile",
				subtitle: "Canvas browser",
				section: "Canvas",
				keywords: ["web"],
				run: () => {
					const pos = getViewportCenterForSize(defaultSize("browser"));
					spawnBrowserTileAt(pos.x, pos.y);
				},
			},
			{
				id: "watchtower-toggle",
				title: watchtowerVisible ? "Hide Watchtower" : "Open Watchtower",
				subtitle: "Agents, relay messages, and operational events",
				section: "Watchtower",
				keywords: ["status", "relay", "events", "monitor"],
				run: () => {
					if (watchtowerVisible) hideWatchtower();
					else showWatchtower();
				},
			},
			{
				id: "context-preview",
				title: "Preview Shared Context",
				subtitle: "Pinned files, decisions, warnings, and truncation",
				section: "Context",
				keywords: ["obsidian", "vault", "inject"],
				run: async () => {
					const preview = await window.shellApi.contextPreviewForTile?.();
					await window.shellApi.showConfirmDialog({
						message: "Shared context preview",
						detail: preview
							? formatContextPreviewDetail(preview)
							: "No shared context preview is available.",
						buttons: ["OK"],
					});
				},
			},
		];

		commandPalette.open([
			...baseCommands,
			...buildContextInjectionCommandItems(),
			...buildRoleCommandItems(Array.isArray(roles) ? roles : []),
			...buildConnectionCommandItems(),
			...buildTileCommandItems(),
			...buildShortcutCommandItems(),
		]);
	}

	window.addEventListener("keydown", (e) => {
		if (shouldOpenShortcutPanel(e)) {
			e.preventDefault();
			shortcutPanel.open();
			return;
		}
		if (
			(e.metaKey || e.ctrlKey) &&
			!e.altKey &&
			!e.shiftKey &&
			!e.repeat &&
			(e.code === "KeyK" || String(e.key).toLowerCase() === "k")
		) {
			e.preventDefault();
			void openCommandPalette();
		}
	});

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
		if (shouldCancelCableDrawMode(e, cableHeld)) {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			clearCablePreview(cableLayerContent);
			hideCableHud();
			return;
		}
		if (shouldEnterCableDrawMode(e)) {
			cableHeld = true;
			canvasEl.classList.add("cable-draw-mode");
			showCableModeHud();
		}
	});

	window.addEventListener("keyup", (e) => {
		if (shouldExitCableDrawModeOnKeyup(e)) {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			clearCablePreview(cableLayerContent);
			hideCableHud();
		}
	});

	window.addEventListener("blur", () => {
		if (cableHeld) {
			cableHeld = false;
			canvasEl.classList.remove("cable-draw-mode");
			clearCablePreview(cableLayerContent);
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
		} else if (action === "shortcuts-panel") {
			shortcutPanel.open();
		} else if (action === "toggle-watchtower") {
			if (watchtowerVisible) hideWatchtower();
			else showWatchtower();
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
				tileManager.requestCloseCanvasTile(focusedId).then((closed) => {
					if (!closed) return;
					tileManager.setFocusedTileId(null);
					canvasEl.focus();
					noteSurfaceFocus("canvas");
					minimap.update();
				});
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
			tileListWebview.send(
				"tile-list:init",
				initEntries,
				buildTileRegistryMeta(),
			);

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
		const size = defaultSize(type);
		const { x: cx, y: cy } = getViewportCenterForSize(size);
		if (type === "term") {
			spawnTerminalTileAt(cx, cy);
		} else {
			spawnBrowserTileAt(cx, cy);
		}
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
		updateCables();
		updateStatusBar();

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

	// -- herdr status polling (5 s) --
	// For every tile that has a herdrPaneId, refresh the header badge.
	// Fire-and-forget per iteration; errors are silently swallowed so a
	// missing/stopped herdr daemon never crashes the renderer.
	setInterval(async () => {
		const herdrTiles = tiles.filter((t) => t.herdrPaneId);
		if (herdrTiles.length === 0) return;
		for (const tile of herdrTiles) {
			try {
				const status = await window.shellApi.herdrGetStatus(tile.herdrPaneId);
				const dom = tileManager.getTileDOMs().get(tile.id);
				if (dom) {
					const container = dom.container ?? dom;
					updateHerdrBadge(container, tile.herdrPaneId, status ?? "unknown");
				}
			} catch {
				// herdr unavailable — leave badge as-is
			}
		}
	}, 5_000);

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
