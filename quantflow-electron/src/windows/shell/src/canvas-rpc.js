import {
	tiles, connections, getTile, defaultSize, snapToGrid,
	addConnection, removeConnection, updateConnectionLabel,
	getConnection, generateId,
} from "./canvas-state.js";
import { normalizeCableSide, resolveCableDrop } from "./cable-drop.js";
import { MIN_SIZES } from "./tile-interactions.js";
import { ZOOM_MAX, ZOOM_MIN } from "./canvas-viewport.js";
import { requiresHerdrSpawn } from "./role-herdr-spawn.js";
import { spawnRoleTileAt as spawnRoleTileAtShared } from "./role-tile-spawn.js";

function generateConnectionId() {
	return "conn-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function defaultTileLabel(tile) {
	return tile?.userTitle || tile?.autoTitle || tile?.id || "unknown";
}

function getRpcRoleCommandName(role) {
	const template = String(role?.commandTemplate ?? "").trim();
	if (!template) return null;
	const match = template.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function normalizeRpcRoleTerminalTarget(defaultShell) {
	const value = String(defaultShell ?? "").trim();
	if (value === "powershell") return "powershell";
	if (value === "shell") return "shell";
	if (value === "wsl") return "wsl";
	return undefined;
}

export function createConnectionMutationEvent(
	action,
	conn,
	tileA,
	tileB,
	labelForTile = defaultTileLabel,
) {
	const created = action === "created";
	const tileALabel = labelForTile(tileA);
	const tileBLabel = labelForTile(tileB);
	return {
		type: created ? "connection.created" : "connection.removed",
		severity: "info",
		summary: created
			? `${tileALabel} connected to ${tileBLabel}`
			: `${tileALabel} disconnected from ${tileBLabel}`,
		meta: {
			connectionId: conn?.id,
			tileAId: conn?.tileAId,
			tileBId: conn?.tileBId,
			source: "canvas-rpc",
		},
	};
}

export function createConnectionLabelEvent(
	conn,
	tileA,
	tileB,
	labelForTile = defaultTileLabel,
	source = "canvas-rpc",
) {
	const tileALabel = labelForTile(tileA);
	const tileBLabel = labelForTile(tileB);
	const label = String(conn?.label ?? "").trim();
	return {
		type: "connection.updated",
		severity: "info",
		summary: label
			? `${tileALabel} -> ${tileBLabel} cable renamed: ${label}`
			: `${tileALabel} -> ${tileBLabel} cable label cleared`,
		meta: {
			connectionId: conn?.id,
			tileAId: conn?.tileAId,
			tileBId: conn?.tileBId,
			source,
		},
	};
}

export function createConnectionFailureEvent(
	message,
	params = {},
	tileA = null,
	tileB = null,
	labelForTile = defaultTileLabel,
) {
	const tileALabel = tileA ? labelForTile(tileA) : params.tileAId || "unknown";
	const tileBLabel = tileB ? labelForTile(tileB) : params.tileBId || "unknown";
	return {
		type: "connection.failed",
		severity: "warn",
		summary: `Connection failed: ${message}`,
		detail: `${tileALabel} -> ${tileBLabel}`,
		meta: {
			...(params.connectionId ? { connectionId: params.connectionId } : {}),
			...(params.tileAId ? { tileAId: params.tileAId } : {}),
			...(params.tileBId ? { tileBId: params.tileBId } : {}),
			source: "canvas-rpc",
		},
	};
}

export function validateRpcConnectionCreate(tileA, tileB, existingConnections) {
	const dropResult = resolveCableDrop({
		sourceTile: tileA,
		targetTile: tileB,
		connections: existingConnections,
	});
	if (!dropResult.ok) {
		return {
			ok: false,
			code: 4,
			message: dropResult.message,
			reason: dropResult.reason,
		};
	}
	return dropResult;
}

export function validateRpcTerminalWrite(tile, input) {
	if (tile?.type !== "term") {
		return { ok: false, code: 4, reason: "not_terminal", message: "Tile is not a terminal" };
	}
	if (!tile.ptySessionId) {
		return { ok: false, code: 4, reason: "missing_session", message: "Terminal has no session" };
	}
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, code: 4, reason: "empty_input", message: "Terminal input must be a non-empty string" };
	}
	return {
		ok: true,
		sessionId: tile.ptySessionId,
		input,
	};
}

export function validateRpcTerminalRead(tile, lines) {
	if (tile?.type !== "term") {
		return { ok: false, code: 4, reason: "not_terminal", message: "Tile is not a terminal" };
	}
	if (!tile.ptySessionId) {
		return { ok: false, code: 4, reason: "missing_session", message: "Terminal has no session" };
	}
	const lineCount = lines ?? 50;
	if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 500) {
		return { ok: false, code: 4, reason: "invalid_lines", message: "Terminal read lines must be an integer from 1 to 500" };
	}
	return {
		ok: true,
		sessionId: tile.ptySessionId,
		lines: lineCount,
	};
}

export function validateRpcTileResize(tile, size) {
	const width = size?.width;
	const height = size?.height;
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		return { ok: false, code: 4, reason: "invalid_size", message: "Invalid size" };
	}
	const min = MIN_SIZES[tile?.type] || MIN_SIZES.term;
	if (width < min.width || height < min.height) {
		return {
			ok: false,
			code: 4,
			reason: "too_small",
			message: `Tile size must be at least ${min.width}x${min.height}`,
		};
	}
	return { ok: true, width, height };
}

export function validateRpcTileRename(title) {
	if (typeof title !== "string") {
		return { ok: false, code: 4, reason: "invalid_title", message: "Tile title must be a string" };
	}
	return { ok: true, title: title.trim() };
}

export function validateRpcViewportSet(params = {}) {
	const result = {};
	if (params.pan !== undefined) {
		const x = params.pan?.x;
		const y = params.pan?.y;
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			return { ok: false, code: 4, reason: "invalid_pan", message: "Viewport pan must use finite x and y values" };
		}
		result.pan = { x, y };
	}
	if (params.zoom !== undefined) {
		const zoom = params.zoom;
		if (!Number.isFinite(zoom) || zoom < ZOOM_MIN || zoom > ZOOM_MAX) {
			return { ok: false, code: 4, reason: "invalid_zoom", message: `Viewport zoom must be between ${ZOOM_MIN} and ${ZOOM_MAX}` };
		}
		result.zoom = zoom;
	}
	return { ok: true, ...result };
}

export function createTerminalWriteFailureEvent(
	tile,
	message,
	reason,
	labelForTile = defaultTileLabel,
) {
	return {
		type: "terminal.write_failed",
		severity: "warn",
		summary: `Terminal write failed: ${message}`,
		detail: labelForTile(tile),
		meta: {
			tileId: tile?.id,
			sessionId: tile?.ptySessionId,
			reason,
			source: "canvas-rpc",
		},
	};
}

export function createTerminalReadFailureEvent(
	tile,
	message,
	reason,
	labelForTile = defaultTileLabel,
) {
	return {
		type: "terminal.read_failed",
		severity: "warn",
		summary: `Terminal read failed: ${message}`,
		detail: labelForTile(tile),
		meta: {
			tileId: tile?.id,
			sessionId: tile?.ptySessionId,
			reason,
			source: "canvas-rpc",
		},
	};
}

export function buildRpcTileSummary(tile, existingConnections = []) {
	const connectionIds = existingConnections
		.filter((conn) =>
			conn.tileAId === tile.id || conn.tileBId === tile.id,
		)
		.map((conn) => conn.id);
	const summary = {
		id: tile.id,
		type: tile.type,
		filePath: tile.filePath,
		folderPath: tile.folderPath,
		url: tile.url,
		cwd: tile.cwd,
		ptySessionId: tile.ptySessionId,
		terminalTarget: tile.terminalTarget,
		terminalPending: tile.terminalPending,
		runtimeTarget: tile.runtimeTarget,
		ptyStatus: tile.ptyStatus,
		ptyError: tile.ptyError,
		herdrPaneId: tile.herdrPaneId,
		herdrAgentName: tile.herdrAgentName,
		herdrWorkspaceId: tile.herdrWorkspaceId,
		herdrTerminalId: tile.herdrTerminalId,
		userTitle: tile.userTitle,
		autoTitle: tile.autoTitle,
		routeHandle: tile.routeHandle,
		roleId: tile.roleId,
		roleName: tile.roleName,
		roleShellKind: tile.roleShellKind,
		roleCommandTemplate: tile.roleCommandTemplate,
		connectionIds,
		position: { x: tile.x, y: tile.y },
		size: { width: tile.width, height: tile.height },
		zIndex: tile.zIndex,
	};
	if (tile.routeHandle) {
		summary.relaySyntax = `>>@${tile.routeHandle}: <message>`;
	}
	return summary;
}

export function createRoleSpawnedEvent(tile, role) {
	return {
		type: "role.spawned",
		severity: "info",
		summary: `${role.name} role tile spawned`,
		detail: role.commandTemplate || "shell",
		meta: {
			roleId: role.id,
			tileId: tile.id,
			command: role.commandTemplate,
			source: "canvas-rpc",
		},
	};
}

export function createRoleSpawnFailureEvent(role, message) {
	return {
		type: "role.failed",
		severity: "error",
		summary: message,
		meta: {
			roleId: role?.id,
			command: getRpcRoleCommandName(role),
			source: "canvas-rpc",
		},
	};
}

function requiredHerdrIdentityString(spawn, field) {
	const value = spawn?.[field];
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Herdr spawn response missing ${field}`);
	}
	return value.trim();
}

export function normalizeHerdrSpawnIdentity(spawn) {
	if (!spawn || typeof spawn !== "object") {
		throw new Error("Herdr spawn response missing identity");
	}
	const runtimeTarget = requiredHerdrIdentityString(spawn, "runtimeTarget");
	if (runtimeTarget !== "herdr-wsl") {
		throw new Error("Herdr spawn response has invalid runtimeTarget");
	}
	const terminalTarget = requiredHerdrIdentityString(spawn, "terminalTarget");
	const targetPrefix = "herdr-wsl:";
	if (
		!terminalTarget.startsWith(targetPrefix) ||
		!terminalTarget.slice(targetPrefix.length).trim()
	) {
		throw new Error("Herdr spawn response has invalid terminalTarget");
	}
	return {
		runtimeTarget,
		terminalTarget,
		herdrPaneId: requiredHerdrIdentityString(spawn, "herdrPaneId"),
		herdrAgentName: requiredHerdrIdentityString(spawn, "herdrAgentName"),
		herdrWorkspaceId: requiredHerdrIdentityString(spawn, "herdrWorkspaceId"),
		herdrTerminalId: requiredHerdrIdentityString(spawn, "herdrTerminalId"),
	};
}

export function applyHerdrSpawnIdentityToTile(tile, spawn) {
	const herdrSpawn = normalizeHerdrSpawnIdentity(spawn);
	tile.runtimeTarget = herdrSpawn.runtimeTarget;
	tile.terminalTarget = herdrSpawn.terminalTarget;
	tile.herdrPaneId = herdrSpawn.herdrPaneId;
	tile.herdrAgentName = herdrSpawn.herdrAgentName;
	tile.herdrWorkspaceId = herdrSpawn.herdrWorkspaceId;
	tile.herdrTerminalId = herdrSpawn.herdrTerminalId;
	tile.terminalPending = false;
	tile.ptyStatus = undefined;
	tile.ptyError = undefined;
	return herdrSpawn;
}

export function buildRoleTileOptions(role, params = {}) {
	const size = params.size ?? {};
	const displayName = String(params.displayName ?? role.name ?? "").trim() || role.name;
	const herdrSpawn = params.herdrSpawn
		? normalizeHerdrSpawnIdentity(params.herdrSpawn)
		: null;
	const options = {
		cwd: params.cwd,
		userTitle: displayName,
		terminalTarget:
			herdrSpawn?.terminalTarget ??
			normalizeRpcRoleTerminalTarget(role.defaultShell),
		roleId: role.id,
		roleName: displayName,
		roleColor: role.color,
		roleShellKind:
			getRpcRoleCommandName(role) || role.defaultShell || "shell",
		roleCommandTemplate: role.commandTemplate,
		roleStartupPrompt: role.startupPrompt,
		roleStatusParser: role.statusParser,
	};
	if (role.runtimeTarget) {
		options.runtimeTarget = role.runtimeTarget;
	}
	if (params.id) options.id = params.id;
	if (herdrSpawn) {
		options.runtimeTarget = herdrSpawn.runtimeTarget;
		options.herdrPaneId = herdrSpawn.herdrPaneId;
		options.herdrAgentName = herdrSpawn.herdrAgentName;
		options.herdrWorkspaceId = herdrSpawn.herdrWorkspaceId;
		options.herdrTerminalId = herdrSpawn.herdrTerminalId;
	}
	if (Number.isFinite(size.width)) options.width = size.width;
	if (Number.isFinite(size.height)) options.height = size.height;
	return options;
}

/**
 * Find a non-overlapping position on the canvas for a tile of the
 * given size. Scans on a 20 px grid within a 4000x3000 region.
 */
export function findAutoPlacement(existingTiles, width, height) {
	const CANVAS_W = 4000;
	const CANVAS_H = 3000;
	const STEP = 20;

	for (let y = 0; y <= CANVAS_H - height; y += STEP) {
		for (let x = 0; x <= CANVAS_W - width; x += STEP) {
			const overlaps = existingTiles.some((t) =>
				x < t.x + t.width &&
				x + width > t.x &&
				y < t.y + t.height &&
				y + height > t.y,
			);
			if (!overlaps) return { x, y };
		}
	}

	const last = existingTiles[existingTiles.length - 1];
	if (last) return { x: last.x + 40, y: last.y + 40 };
	return { x: 40, y: 40 };
}

/**
 * Create the canvas RPC request handler.
 *
 * Methods: tileList, tileCreate, tileRemove, tileMove, tileResize,
 *          viewportGet, viewportSet, terminalWrite, terminalRead,
 *          tileFocus, browserNavigate, browserScreenshot,
 *          browserSnapshot, browserClick, browserType,
 *          browserScroll, browserEvaluate, browserWait,
 *          browserInfo.
 */
export function createCanvasRpc({
	tileManager, viewportState, viewport, edgeIndicators,
	onConnectionCreated,
	onConnectionRemoved,
	onConnectionUpdated,
	onConnectionFailed,
	onTerminalReadFailed,
	onTerminalWriteFailed,
	onRoleSpawned,
	onRoleSpawnFailed,
}) {
	function respond(requestId, result) {
		window.shellApi.canvasRpcResponse({ requestId, result });
	}

	function respondError(requestId, code, message) {
		window.shellApi.canvasRpcResponse({
			requestId, error: { code, message },
		});
	}

	function requireTile(requestId, tileId) {
		const tile = getTile(tileId);
		if (!tile) {
			respondError(requestId, 3, "Tile not found");
			return null;
		}
		return tile;
	}

	function requireBrowserWcId(requestId, tileId) {
		const tile = requireTile(requestId, tileId);
		if (!tile) return null;
		if (tile.type !== "browser") {
			respondError(requestId, 4, "Tile is not a browser");
			return null;
		}
		const dom = tileManager.getTileDOMs().get(tileId);
		if (!dom || !dom.webview) {
			respondError(requestId, 4, "Browser webview not ready");
			return null;
		}
		return dom.webview.getWebContentsId();
	}

	return async function handleCanvasRpc(request) {
		const { requestId, method, params } = request;

		try {
			let result;
			switch (method) {
				case "tileList": {
					result = {
						tiles: tiles.map((t) =>
							buildRpcTileSummary(t, connections),
						),
					};
					break;
				}
				case "tileCreate": {
					const tileType = params.tileType || "note";
					const size = defaultSize(tileType);
					const pos = params.position
						? { x: params.position.x, y: params.position.y }
						: findAutoPlacement(tiles, size.width, size.height);

					let tile;
					if (tileType === "term") {
						tile = tileManager.createCanvasTile(
							"term", pos.x, pos.y,
						);
						tileManager.spawnTerminalWebview(tile);
					} else if (tileType === "browser") {
						tile = tileManager.createCanvasTile(
							"browser", pos.x, pos.y, { url: params.url },
						);
						tileManager.spawnBrowserWebview(tile, false);
					} else if (tileType === "pdf") {
						tile = tileManager.createFileTile(
							"pdf", pos.x, pos.y, params.filePath,
						);
					} else if (tileType === "graph") {
						const wsPath = "";
						tile = tileManager.createGraphTile(
							pos.x, pos.y, params.filePath, wsPath,
						);
					} else {
						tile = tileManager.createFileTile(
							tileType, pos.x, pos.y, params.filePath,
						);
					}
					tileManager.saveCanvasImmediate();
					result = { tileId: tile.id };
					break;
				}
				case "roleSpawn": {
					const role = params.role;
					if (!role?.id || !role?.name || !role?.color) {
						respondError(requestId, 4, "Role payload is invalid");
						return;
					}
					if (role.commandTemplate && role.commandAvailable === false) {
						const command = getRpcRoleCommandName(role);
						const message = `${role.name} is missing command: ${command}`;
						onRoleSpawnFailed?.(
							createRoleSpawnFailureEvent(role, message),
						);
						respondError(requestId, 4, message);
						return;
					}
					const defaultTermSize = defaultSize("term");
					const requestedSize = params.size ?? defaultTermSize;
					const tileId = params.tileId || generateId();
					if (requiresHerdrSpawn(role) && !window.shellApi.herdrSpawnRole) {
						const message = "Herdr spawn API is unavailable";
						onRoleSpawnFailed?.(
							createRoleSpawnFailureEvent(role, message),
						);
						respondError(requestId, 4, message);
						return;
					}
					const pos = params.position
						? { x: params.position.x, y: params.position.y }
						: findAutoPlacement(
							tiles,
							requestedSize.width ?? defaultTermSize.width,
							requestedSize.height ?? defaultTermSize.height,
						);
					const tile = await spawnRoleTileAtShared({
						tileManager,
						generateId,
						shellApi: window.shellApi,
						onRoleSpawned,
						onRoleSpawnFailed,
						isMissingRoleCommand: (spawnRole) =>
							Boolean(
								spawnRole?.commandTemplate &&
								spawnRole.commandAvailable === false,
							),
						getRoleCommandName: getRpcRoleCommandName,
						createRoleSpawnFailureEvent,
						createRoleSpawnedEvent,
					}, role, pos.x, pos.y, {
						id: tileId,
						cwd: params.cwd,
						size: requestedSize,
						canvasId: params.canvasId,
						workspaceId: params.workspaceId,
						displayName: params.displayName,
					});
					if (!tile) {
						respondError(requestId, 4, "Role spawn failed");
						return;
					}
					tileManager.saveCanvasImmediate();
					result = buildRpcTileSummary(tile, connections);
					break;
				}
				case "tileRemove": {
					if (!requireTile(requestId, params.tileId)) return;
					tileManager.closeCanvasTile(params.tileId);
					result = {};
					break;
				}
				case "tileMove": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					const mx = params.position?.x;
					const my = params.position?.y;
					if (!Number.isFinite(mx) || !Number.isFinite(my)) {
						respondError(requestId, 4, "Invalid position");
						return;
					}
					tile.x = mx;
					tile.y = my;
					snapToGrid(tile);
					tileManager.repositionAllTiles();
					tileManager.saveCanvasImmediate();
					result = {};
					break;
				}
				case "tileResize": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					const validation = validateRpcTileResize(tile, params.size);
					if (!validation.ok) {
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					tile.width = validation.width;
					tile.height = validation.height;
					snapToGrid(tile);
					tileManager.repositionAllTiles();
					tileManager.saveCanvasImmediate();
					result = {};
					break;
				}
				case "tileRename": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					const validation = validateRpcTileRename(params.title);
					if (!validation.ok) {
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					const routeHandle = tile.routeHandle;
					tileManager.renameTile(params.tileId, validation.title);
					const renamed = getTile(params.tileId);
					if (renamed && routeHandle) renamed.routeHandle = routeHandle;
					result = renamed
						? buildRpcTileSummary(renamed, connections)
						: {};
					break;
				}
				case "connectionList": {
					result = [...connections];
					break;
				}
				case "connectionCreate": {
					const tileA = requireTile(requestId, params.tileAId);
					if (!tileA) return;
					const tileB = requireTile(requestId, params.tileBId);
					if (!tileB) return;
					const validation = validateRpcConnectionCreate(
						tileA, tileB, connections,
					);
					if (!validation.ok) {
						onConnectionFailed?.(
							createConnectionFailureEvent(
								validation.message,
								params,
								tileA,
								tileB,
							),
						);
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					const now = Date.now();
					result = addConnection({
						id: generateConnectionId(),
						tileAId: validation.tileAId,
						tileBId: validation.tileBId,
						label: params.label,
						from: {
							tileId: validation.tileAId,
							side: normalizeCableSide(params.fromSide, "E"),
						},
						to: {
							tileId: validation.tileBId,
							side: normalizeCableSide(params.toSide, "W"),
						},
						kind: typeof params.kind === "string" && params.kind.trim()
							? params.kind
							: "relay",
						createdAt: now,
						updatedAt: now,
					});
					onConnectionCreated?.(result, tileA, tileB);
					tileManager.saveCanvasImmediate();
					break;
				}
				case "connectionRemove": {
					const conn = getConnection(params.id);
					if (!conn) {
						onConnectionFailed?.(
							createConnectionFailureEvent(
								"Connection not found.",
								{ connectionId: params.id },
							),
						);
						respondError(requestId, 3, "Connection not found");
						return;
					}
					const tileA = getTile(conn?.tileAId);
					const tileB = getTile(conn?.tileBId);
					removeConnection(params.id);
					onConnectionRemoved?.(conn, tileA, tileB);
					tileManager.saveCanvasImmediate();
					result = { ok: true };
					break;
				}
				case "connectionUpdateLabel": {
					const conn = updateConnectionLabel(params.id, params.label);
					if (!conn) {
						onConnectionFailed?.(
							createConnectionFailureEvent(
								"Connection not found.",
								{ connectionId: params.id },
							),
						);
						respondError(requestId, 3, "Connection not found");
						return;
					}
					onConnectionUpdated?.(
						conn,
						getTile(conn.tileAId),
						getTile(conn.tileBId),
					);
					tileManager.saveCanvasImmediate();
					result = getConnection(params.id);
					break;
				}
				case "viewportGet": {
					result = {
						pan: {
							x: viewportState.panX,
							y: viewportState.panY,
						},
						zoom: viewportState.zoom,
					};
					break;
				}
				case "viewportSet": {
					const validation = validateRpcViewportSet(params);
					if (!validation.ok) {
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					if (validation.pan) {
						viewportState.panX = validation.pan.x;
						viewportState.panY = validation.pan.y;
					}
					if (validation.zoom !== undefined) {
						viewportState.zoom = validation.zoom;
					}
					viewport.updateCanvas();
					tileManager.saveCanvasDebounced();
					result = {};
					break;
				}
				case "terminalWrite": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					const validation = validateRpcTerminalWrite(tile, params.input);
					if (!validation.ok) {
						onTerminalWriteFailed?.(tile, validation);
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					try {
						window.shellApi.ptyWrite(
							validation.sessionId,
							validation.input,
						);
					} catch (err) {
						const message = err instanceof Error
							? err.message
							: "Terminal write failed";
						onTerminalWriteFailed?.(tile, {
							code: 4,
							reason: "write_failed",
							message,
						});
						respondError(requestId, 4, message);
						return;
					}
					result = {};
					break;
				}
				case "terminalRead": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					const validation = validateRpcTerminalRead(tile, params.lines);
					if (!validation.ok) {
						onTerminalReadFailed?.(tile, validation);
						respondError(
							requestId,
							validation.code,
							validation.message,
						);
						return;
					}
					try {
						const output = await window.shellApi.ptyCapture(
							validation.sessionId,
							validation.lines,
						);
						result = { output };
					} catch (err) {
						const message = err instanceof Error
							? err.message
							: "Terminal read failed";
						onTerminalReadFailed?.(tile, {
							code: 4,
							reason: "capture_failed",
							message,
						});
						respondError(requestId, 4, message);
						return;
					}
					break;
				}
				case "browserNavigate": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					if (tile.type !== "browser") {
						respondError(requestId, 4, "Tile is not a browser");
						return;
					}
					const dom = tileManager.getTileDOMs().get(tile.id);
					if (!dom?.webview) {
						respondError(requestId, 4, "Browser has no webview");
						return;
					}
					const wcId = dom.webview.getWebContentsId();
					result = await window.shellApi.browserNavigate(wcId, params.url);
					tile.url = params.url;
					if (dom.urlInput) dom.urlInput.value = params.url;
					break;
				}
				case "browserScreenshot": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					if (tile.type !== "browser") {
						respondError(requestId, 4, "Tile is not a browser");
						return;
					}
					const dom = tileManager.getTileDOMs().get(tile.id);
					if (!dom?.webview) {
						respondError(requestId, 4, "Browser has no webview");
						return;
					}
					const wcId = dom.webview.getWebContentsId();
					result = await window.shellApi.browserScreenshot(wcId);
					break;
				}
				case "browserSnapshot": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					if (tile.type !== "browser") {
						respondError(requestId, 4, "Tile is not a browser");
						return;
					}
					const dom = tileManager.getTileDOMs().get(tile.id);
					if (!dom?.webview) {
						respondError(requestId, 4, "Browser has no webview");
						return;
					}
					const wcId = dom.webview.getWebContentsId();
					result = await window.shellApi.browserSnapshot(wcId);
					break;
				}
				case "browserClick": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					if (tile.type !== "browser") {
						respondError(requestId, 4, "Tile is not a browser");
						return;
					}
					const dom = tileManager.getTileDOMs().get(tile.id);
					if (!dom?.webview) {
						respondError(requestId, 4, "Browser has no webview");
						return;
					}
					const wcId = dom.webview.getWebContentsId();
					result = await window.shellApi.browserClick(wcId, params.selector);
					break;
				}
				case "browserType": {
					const tile = requireTile(requestId, params.tileId);
					if (!tile) return;
					if (tile.type !== "browser") {
						respondError(requestId, 4, "Tile is not a browser");
						return;
					}
					const dom = tileManager.getTileDOMs().get(tile.id);
					if (!dom?.webview) {
						respondError(requestId, 4, "Browser has no webview");
						return;
					}
					const wcId = dom.webview.getWebContentsId();
					result = await window.shellApi.browserType(
						wcId, params.selector, params.text,
					);
					break;
				}
				case "browserScroll": {
					const wcId = requireBrowserWcId(
						requestId, params.tileId,
					);
					if (wcId == null) return;
					result = await window.shellApi.browserScroll(
						wcId, params.x ?? 0, params.y ?? 0,
					);
					break;
				}
				case "browserEvaluate": {
					const wcId = requireBrowserWcId(
						requestId, params.tileId,
					);
					if (wcId == null) return;
					result = await window.shellApi.browserEvaluate(
						wcId, params.expression,
					);
					break;
				}
				case "browserWait": {
					const wcId = requireBrowserWcId(
						requestId, params.tileId,
					);
					if (wcId == null) return;
					result = await window.shellApi.browserWait(
						wcId, params.timeout,
					);
					break;
				}
				case "browserInfo": {
					const wcId = requireBrowserWcId(
						requestId, params.tileId,
					);
					if (wcId == null) return;
					result = await window.shellApi.browserInfo(wcId);
					break;
				}
				case "tileFocus": {
					const ids = params.tileIds;
					if (!Array.isArray(ids) || ids.length === 0) {
						respondError(
							requestId, 4,
							"tileIds must be a non-empty array",
						);
						return;
					}
					const focusTiles = [];
					for (const id of ids) {
						const t = getTile(id);
						if (!t) {
							respondError(
								requestId, 3, `Tile not found: ${id}`,
							);
							return;
						}
						focusTiles.push(t);
					}
					edgeIndicators.panToTiles(focusTiles);
					result = {};
					break;
				}
				default: {
					respondError(
						requestId, -32601,
						`Unknown method: ${method}`,
					);
					return;
				}
			}
			respond(requestId, result);
		} catch (err) {
			respondError(
				requestId, -32603,
				err.message || "Internal error",
			);
		}
	};
}
