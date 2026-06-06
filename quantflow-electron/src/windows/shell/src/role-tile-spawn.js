import {
	applyHerdrSpawnIdentityToTile,
	buildRoleTileOptions,
} from "./canvas-rpc.js";
import { requiresHerdrSpawn } from "./role-herdr-spawn.js";

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
		minimap,
		toasts,
	} = deps;

	if (!role) return null;

	const displayName = String(options.displayName ?? role.name ?? "").trim()
		|| role.name;

	if (isMissingRoleCommand?.(role)) {
		const message = `${displayName} is missing command: ${getRoleCommandName?.(role)}`;
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	const cwd = options.cwd ?? getTerminalCwd();
	const size = options.size ?? getTerminalSize();
	const tileId = options.id || generateId();
	const shouldUseHerdr = requiresHerdrSpawn(role);

	if (shouldUseHerdr && !shellApi?.herdrSpawnRole) {
		const message = "Herdr spawn API is unavailable";
		onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
		toasts?.show?.({ message, tone: "error" });
		return null;
	}

	const tile = tileManager.createCanvasTile("term", x, y, {
		...buildRoleTileOptions(role, {
			cwd,
			size,
			displayName,
			id: tileId,
			herdrSpawn: null,
		}),
	});

	if (shouldUseHerdr) {
		tile.runtimeTarget = "herdr-wsl";
		tile.terminalTarget = undefined;
		tile.terminalPending = true;
		tile.ptyStatus = "connecting";
	}

	onRoleSpawned?.(createRoleSpawnedEvent(tile, role));
	tileManager.saveCanvasImmediate();
	minimap?.update?.();

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
			});
			applyHerdrSpawnIdentityToTile(tile, spawn);
			tileManager.spawnTerminalWebview(tile, true);
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			minimap?.update?.();
		} catch (err) {
			const message = err instanceof Error
				? err.message
				: `Herdr spawn failed for ${displayName}`;
			tile.terminalPending = false;
			tile.ptyStatus = "error";
			tile.ptyError = message;
			updateRoleTileChrome?.(tile);
			tileManager.saveCanvasImmediate();
			onRoleSpawnFailed?.(createRoleSpawnFailureEvent(role, message));
			toasts?.show?.({ message, tone: "error" });
		}
	} else {
		tileManager.spawnTerminalWebview(tile, true);
	}

	return tile;
}
