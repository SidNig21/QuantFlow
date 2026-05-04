import {
	tiles, connections, getTile, defaultSize, snapToGrid,
	addConnection, removeConnection, updateConnectionLabel,
	getConnection,
} from "./canvas-state.js";
import { resolveCableDrop } from "./cable-drop.js";

function generateConnectionId() {
	return "conn-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function defaultTileLabel(tile) {
	return tile?.userTitle || tile?.autoTitle || tile?.id || "unknown";
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
						tiles: tiles.map((t) => ({
							id: t.id,
							type: t.type,
							filePath: t.filePath,
							folderPath: t.folderPath,
							url: t.url,
							cwd: t.cwd,
							ptySessionId: t.ptySessionId,
							userTitle: t.userTitle,
							autoTitle: t.autoTitle,
							position: { x: t.x, y: t.y },
							size: { width: t.width, height: t.height },
							zIndex: t.zIndex,
						})),
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
					const rw = params.size?.width;
					const rh = params.size?.height;
					if (!Number.isFinite(rw) || !Number.isFinite(rh)) {
						respondError(requestId, 4, "Invalid size");
						return;
					}
					tile.width = rw;
					tile.height = rh;
					snapToGrid(tile);
					tileManager.repositionAllTiles();
					tileManager.saveCanvasImmediate();
					result = {};
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
					if (params.pan) {
						viewportState.panX = params.pan.x;
						viewportState.panY = params.pan.y;
					}
					if (params.zoom !== undefined) {
						viewportState.zoom = params.zoom;
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
