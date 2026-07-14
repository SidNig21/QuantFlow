import type { ConnectionGraphEntry } from "./tile-session-registry";

export interface TileChatRoute {
  kind: "local" | "cable" | "cable-error";
  text: string;
  connectionId?: string;
  toTileId?: string;
  notice?: string;
}

function isCableCommand(line: string): boolean {
  return line === "/cable" || line.startsWith("/cable ");
}

function peerTileId(tileId: string, connection: ConnectionGraphEntry): string | null {
  if (connection.tileAId === tileId) return connection.tileBId;
  if (connection.tileBId === tileId) return connection.tileAId;
  return null;
}

export function resolveTileChatRoute(
  tileId: string,
  line: string,
  connections: ConnectionGraphEntry[],
): TileChatRoute {
  if (!isCableCommand(line)) {
    return { kind: "local", text: line };
  }

  const text = line === "/cable" ? "" : line.slice("/cable ".length).trim();
  if (!text) {
    return {
      kind: "cable-error",
      text: "",
      notice: "usage: /cable <message>",
    };
  }

  if (connections.length === 0) {
    return {
      kind: "cable-error",
      text,
      notice: "no canvas cable on this tile",
    };
  }

  const connection = connections[connections.length - 1];
  const toTileId = peerTileId(tileId, connection);
  if (!toTileId) {
    return {
      kind: "cable-error",
      text,
      notice: "no canvas cable on this tile",
    };
  }

  return {
    kind: "cable",
    text,
    connectionId: connection.id,
    toTileId,
    notice: connections.length > 1
      ? `${connections.length} cables on this tile — using ${connection.id}`
      : undefined,
  };
}
