import {
	applyHerdrSpawnIdentityToTile,
	buildRoleTileOptions,
	resolveRoleDisplayName,
} from "./canvas-rpc.js";
import { tiles } from "./canvas-state.js";
import { requiresHerdrSpawn } from "./role-herdr-spawn.js";

/**
 * The Kernel command bridge, or null outside Electron (e.g. unit tests).
 * Callers gate on this so the no-Kernel path is fully synchronous — no awaited
 * microtask that could leak past a test's lifetime.
 */
function kernelApiRef() {
	const kapi = typeof window !== "undefined" ? window.kernelApi : null;
	return kapi && typeof kapi.sendCommand === "function" ? kapi : null;
}

/**
 * @param {object} deps
 * @param {import("./canvas-state.js").RoleLike} role
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 */
export async function spawnRoleTileAt(deps, role, x, y, options = {}) {
	const {
		tileManager,
		generateId,
		getTerminalCwd = () => undefined,
		getTerminalSize = () => ({}),
		shellApi,
		workspaceId,
		canvasId,
		onRoleSpawned,
		onRoleSpawnFailed,
		isMissingRoleCommand,
		getRoleCommandName,
		createRoleSpawnFailureEvent,
		createRoleSpawnedEvent,
		updateRoleTileChrome,
		toasts,
	} = deps;

	if (!role) return null;

	const displayName = String(options.displayName ?? "").trim()
		|| resolveRoleDisplayName(tiles, role);

	if (isMissingRoleCommand?.(role)) {
		const message = `${displayName} is missing command: ${getRoleCommandName?.(role)}`;
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	// The recipe's own cwd (e.g. an Eve package folder) wins over the ambient
	// terminal cwd, so `npm run dev` runs where the agent lives.
	const cwd = options.cwd ?? role.cwd ?? getTerminalCwd();
	const size = options.size ?? getTerminalSize();
	const tileId = options.id || generateId();
	const shouldUseHerdr = requiresHerdrSpawn(role);

	if (shouldUseHerdr && !shellApi?.herdrSpawnRole) {
		const message = "Herdr spawn API is unavailable";
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	const tile = await tileManager.createCanvasTile("term", x, y, {
		...buildRoleTileOptions(role, {
			cwd,
			size,
			displayName,
			id: tileId,
			herdrSpawn: null,
		}),
	});

	if (!tile) {
		const message = `Kernel rejected tile.create for ${displayName}`;
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	if (shouldUseHerdr) {
		tile.runtimeTarget = "herdr-wsl";
		tile.terminalTarget = undefined;
		tile.terminalPending = true;
		tile.ptyStatus = "connecting";
	}

	// Kernel owns worker identity and is the spawn authority: establish it
	// (role/harness/model, status 'spawning') BEFORE starting the runtime. If
	// the Kernel rejects, the shell must NOT start a live runtime — that would
	// create a worker outside Kernel authority (the exact Goal 6A loophole).
	const kapi = kernelApiRef();
	if (kapi) {
		let spawnResult;
		try {
			spawnResult = await kapi.sendCommand("kernel.worker.spawn", {
				tileId: tile.id,
				workflowId: options.workflowId ?? null,
				roleName: role.name,
				runtimeTarget: shouldUseHerdr ? "herdr-wsl" : "local-shell",
				harnessKind: shouldUseHerdr ? "herdr-shell" : "local-shell",
			});
		} catch (err) {
			spawnResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
		if (spawnResult && spawnResult.ok === false) {
			const message = `Kernel rejected worker spawn for ${displayName}: ${spawnResult.error ?? "unknown error"}`;
			tile.terminalPending = false;
			tile.ptyStatus = "error";
			tile.ptyError = message;
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
			toasts?.show?.({ message, tone: "error" });
			return tile; // do NOT start herdrSpawnRole / spawnTerminalWebview
		}
	}

	onRoleSpawned?.(createRoleSpawnedEvent(tile, role));
	tileManager.saveCanvasImmediate();

	if (shouldUseHerdr) {
		try {
			const spawn = await shellApi.herdrSpawnRole({
				tileId: tile.id,
				roleId: role.id,
				roleName: role.name,
				cwd,
				commandTemplate: role.commandTemplate,
				startupPrompt: role.startupPrompt,
				canvasId: options.canvasId ?? canvasId ?? workspaceId,
				workspaceId: options.workspaceId ?? workspaceId ?? canvasId,
				workflowTaskId: options.workflowTaskId,
				workflowCorrelationId: options.workflowCorrelationId,
				workflowEnvoySpaceId: options.workflowEnvoySpaceId,
			});
			applyHerdrSpawnIdentityToTile(tile, spawn);
			tileManager.spawnTerminalWebview(tile, true);
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			// Record runtime ids + active status on the Kernel worker row.
			if (kapi) {
				await kapi.sendCommand("kernel.worker.status_update", {
					tileId: tile.id,
					status: "active",
					herdrPaneId: tile.herdrPaneId ?? null,
					envoySpaceId: tile.herdrWorkspaceId ?? options.workflowEnvoySpaceId ?? null,
				});
			}
		} catch (err) {
			const message = err instanceof Error
				? err.message
				: `Herdr spawn failed for ${displayName}`;
			tile.terminalPending = false;
			tile.ptyStatus = "error";
			tile.ptyError = message;
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			if (kapi) {
				await kapi.sendCommand("kernel.worker.status_update", {
					tileId: tile.id,
					status: "error",
				});
			}
			onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
			toasts?.show?.({ message, tone: "error" });
		}
	} else {
		tileManager.spawnTerminalWebview(tile, true);
		if (kapi) {
			await kapi.sendCommand("kernel.worker.status_update", {
				tileId: tile.id,
				status: "active",
			});
		}
	}

	return tile;
}

/**
 * Spawn an AgentOS actor as a terminal tile (V1) — interactive xterm front, no auto-flip.
 * @param {object} deps
 * @param {number} x
 * @param {number} y
 * @param {object} [options]
 */
export async function spawnAgentOsTileAt(deps, x, y, options = {}) {
	const {
		tileManager,
		generateId,
		getTerminalSize = () => ({}),
		shellApi,
		updateRoleTileChrome,
		onRoleSpawned,
		onRoleSpawnFailed,
		createRoleSpawnedEvent,
		createRoleSpawnFailureEvent,
		toasts,
	} = deps;

	const displayName = String(options.displayName ?? "AgentOS Worker").trim();
	const size = options.size ?? getTerminalSize();
	const tileId = options.id || generateId();
	const kapi = kernelApiRef();

	const tile = await tileManager.createCanvasTile("term", x, y, {
		...size,
		displayName,
		id: tileId,
		runtimeTarget: "agentos",
		roleName: "AgentOS",
		userTitle: displayName,
	});

	if (!tile) {
		const message = `Kernel rejected tile.create for ${displayName}`;
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent?.({ id: "agentos", name: displayName }, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	tile.runtimeTarget = "agentos";
	tile.terminalPending = true;
	tile.ptyStatus = "connecting";

	if (kapi) {
		let spawnResult;
		try {
			spawnResult = await kapi.sendCommand("kernel.worker.spawn", {
				tileId: tile.id,
				workflowId: options.workflowId ?? null,
				roleName: "AgentOS",
				runtimeTarget: "agentos",
				harnessKind: "agentos",
			});
		} catch (err) {
			spawnResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
		if (spawnResult && spawnResult.ok === false) {
			const message = `Kernel rejected worker spawn for ${displayName}: ${spawnResult.error ?? "unknown error"}`;
			tile.terminalPending = false;
			tile.ptyStatus = "error";
			tile.ptyError = message;
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			onRoleSpawnFailed?.(createRoleSpawnFailureEvent?.({ id: "agentos", name: displayName }, message));
			toasts?.show?.({ message, tone: "error" });
			return tile;
		}
	}

	onRoleSpawned?.(createRoleSpawnedEvent?.(tile, { id: "agentos", name: displayName }));
	tileManager.spawnTerminalWebview(tile, true);
	tileManager.saveCanvasImmediate();

	try {
		const prepare = await shellApi?.agentosTerminalPrepare?.({
			tileId: tile.id,
			cols: size.width ? Math.max(80, Math.floor(size.width / 8)) : undefined,
			rows: size.height ? Math.max(24, Math.floor(size.height / 17)) : undefined,
			instruction: String(options.instruction ?? "").trim() || undefined,
			software: options.software,
		});
		if (!prepare?.ok || !prepare.terminalTarget) {
			throw new Error(prepare?.error ?? "AgentOS terminal prepare failed");
		}
		tile.terminalTarget = prepare.terminalTarget;
		tile.terminalPending = false;
		tile.ptyStatus = "running";
		updateRoleTileChrome?.(tile);
		tileManager.spawnTerminalWebview(tile, true);
		tileManager.saveCanvasImmediate();
		if (kapi) {
			await kapi.sendCommand("kernel.worker.status_update", {
				tileId: tile.id,
				status: "active",
			});
		}
		const instruction = String(options.instruction ?? "").trim();
		if (instruction) {
			void shellApi?.agentosRun?.({
				tileId: tile.id,
				instruction,
				workflowId: options.workflowId ?? undefined,
			});
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		tile.terminalPending = false;
		tile.ptyStatus = "error";
		tile.ptyError = message;
		updateRoleTileChrome?.(tile);
		tileManager.saveCanvasImmediate();
		if (kapi) {
			await kapi.sendCommand("kernel.worker.status_update", {
				tileId: tile.id,
				status: "error",
			});
		}
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent?.({ id: "agentos", name: displayName }, message));
		toasts?.show?.({ message, tone: "error" });
	}

	return tile;
}
