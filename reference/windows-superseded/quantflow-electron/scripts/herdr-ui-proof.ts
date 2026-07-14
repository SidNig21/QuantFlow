import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { callHerdrSocket } from "../src/main/herdr-socket-bridge";

interface CanvasTile {
  id?: unknown;
  type?: unknown;
  roleId?: unknown;
  runtimeTarget?: unknown;
  terminalTarget?: unknown;
  herdrPaneId?: unknown;
  herdrAgentName?: unknown;
  herdrWorkspaceId?: unknown;
  herdrTerminalId?: unknown;
}

interface CanvasState {
  tiles?: unknown;
}

interface HerdrTileIdentity {
  tileId: string;
  runtimeTarget: string;
  terminalTarget: string;
  herdrPaneId: string;
  herdrAgentName: string;
  herdrWorkspaceId: string;
  herdrTerminalId: string;
}

function devWorktreeId(root: string): string {
  return createHash("sha256")
    .update(resolve(root))
    .digest("hex")
    .slice(0, 12);
}

function canvasStatePath(): string {
  if (process.env.QF_CANVAS_STATE_PATH?.trim()) {
    return process.env.QF_CANVAS_STATE_PATH.trim();
  }
  if (process.env.QF_CANVAS_STATE_DIR?.trim()) {
    return join(process.env.QF_CANVAS_STATE_DIR.trim(), "canvas-state.json");
  }
  const root = process.env.QUANTFLOW_DEV_WORKTREE_ROOT ||
    process.env.COLLAB_DEV_WORKTREE_ROOT ||
    process.cwd();
  return join(
    homedir(),
    ".quantflow",
    "dev",
    `worktree-${devWorktreeId(root)}`,
    "canvas-state.json",
  );
}

function requiredString(tile: CanvasTile, field: keyof CanvasTile): string {
  const value = tile[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Hermes herdr tile missing ${field}`);
  }
  return value.trim();
}

function findHermesHerdrTiles(tiles: unknown[]): CanvasTile[] {
  return tiles.filter((tile): tile is CanvasTile => {
    if (!tile || typeof tile !== "object") return false;
    const record = tile as CanvasTile;
    return record.roleId === "hermes" &&
      record.runtimeTarget === "herdr-wsl";
  });
}

function normalizeIdentity(tile: CanvasTile): HerdrTileIdentity {
  const identity = {
    tileId: requiredString(tile, "id"),
    runtimeTarget: requiredString(tile, "runtimeTarget"),
    terminalTarget: requiredString(tile, "terminalTarget"),
    herdrPaneId: requiredString(tile, "herdrPaneId"),
    herdrAgentName: requiredString(tile, "herdrAgentName"),
    herdrWorkspaceId: requiredString(tile, "herdrWorkspaceId"),
    herdrTerminalId: requiredString(tile, "herdrTerminalId"),
  };

  if (!identity.terminalTarget.startsWith("herdr-wsl:")) {
    throw new Error("Hermes herdr tile has invalid terminalTarget");
  }
  return identity;
}

async function findLiveHermesIdentity(
  tiles: CanvasTile[],
): Promise<{
  identity: HerdrTileIdentity;
  pane: unknown;
  skipped: Array<{ tileId: string; reason: string }>;
}> {
  const skipped: Array<{ tileId: string; reason: string }> = [];

  for (const tile of tiles) {
    let identity: HerdrTileIdentity;
    try {
      identity = normalizeIdentity(tile);
    } catch (error) {
      skipped.push({
        tileId: typeof tile.id === "string" ? tile.id : "unknown",
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    try {
      const pane = await callHerdrSocket("pane.get", {
        pane_id: identity.herdrPaneId,
      });
      return { identity, pane, skipped };
    } catch (error) {
      skipped.push({
        tileId: identity.tileId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(
    `No persisted Hermes herdr tile has a live herdr pane. Skipped: ${
      JSON.stringify(skipped)
    }`,
  );
}

async function main(): Promise<void> {
  const statePath = canvasStatePath();
  if (!existsSync(statePath)) {
    throw new Error(`canvas-state.json not found at ${statePath}`);
  }

  const parsed = JSON.parse(await readFile(statePath, "utf8")) as CanvasState;
  const tiles = Array.isArray(parsed.tiles) ? parsed.tiles : [];
  const hermesTiles = findHermesHerdrTiles(tiles);
  if (hermesTiles.length === 0) {
    throw new Error(
      `No persisted Hermes herdr tile found in ${statePath} (${tiles.length} tiles)`,
    );
  }

  const { identity, pane, skipped } = await findLiveHermesIdentity(hermesTiles);

  console.log(JSON.stringify({
    ok: true,
    statePath,
    candidateCount: hermesTiles.length,
    skipped,
    identity,
    pane,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
