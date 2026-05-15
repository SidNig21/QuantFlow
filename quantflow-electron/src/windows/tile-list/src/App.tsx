import type { Icon } from "@phosphor-icons/react";
import {
  Terminal,
  Browser,
  ChartLineUp,
  Note,
  Code,
  Image,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  buildTileRegistryGroups,
  normalizeTileStatus,
  summarizeTileRegistry,
  type TileRegistryEntry,
} from "./tile-registry";

type TileType = "term" | "note" | "code" | "image" | "graph" | "browser";

interface TileEntry extends TileRegistryEntry {
  type: TileType;
}

interface TileRegistryMeta {
  workspaceName: string;
}

function isTileEntry(value: unknown): value is TileEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    typeof e.title === "string" &&
    typeof e.description === "string" &&
    (e.status == null || typeof e.status === "string")
  );
}

function isTileRegistryMeta(value: unknown): value is TileRegistryMeta {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).workspaceName === "string",
  );
}

const DEFAULT_REGISTRY_META: TileRegistryMeta = {
  workspaceName: "Workspace",
};

const TYPE_ICONS: Record<TileType, Icon> = {
  term: Terminal,
  browser: Browser,
  graph: ChartLineUp,
  note: Note,
  code: Code,
  image: Image,
};

function statusLabel(status: TileEntry["status"]) {
  const normalized = normalizeTileStatus(status);
  if (normalized === "running") return "LIVE";
  if (normalized === "error") return "ERR";
  if (normalized === "exited") return "EXIT";
  return "IDLE";
}

function TileEntryRow({
  entry,
  focused,
  isRenaming,
  renameValue,
  onClick,
  onDoubleClick,
  onContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
}: {
  entry: TileEntry;
  focused: boolean;
  isRenaming: boolean;
  renameValue: string;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedStatus = normalizeTileStatus(entry.status);
  const IconComp = TYPE_ICONS[entry.type] ?? Terminal;

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.select();
    }
  }, [isRenaming]);

  return (
    <div
      className={`tile-entry${focused ? " focused" : ""}`}
      data-status={normalizedStatus}
      data-type={entry.type}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="tile-icon" data-type={entry.type}>
        <IconComp size={14} weight="regular" />
      </div>
      {isRenaming ? (
        <input
          ref={inputRef}
          className="tile-rename-input"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRenameConfirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onRenameCancel();
            }
          }}
          onBlur={onRenameConfirm}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="tile-copy">
          <div className="tile-title-row">
            <div className="tile-title">{entry.title}</div>
            {entry.routeHandle && (
              <div className="tile-route">@{entry.routeHandle}</div>
            )}
          </div>
          <div className="tile-description">
            {entry.metaLabel || entry.description || entry.type}
          </div>
        </div>
      )}
      <div className="tile-status" data-status={normalizedStatus}>
        <span className="tile-status-dot" />
        <span className="tile-status-label">{statusLabel(entry.status)}</span>
      </div>
    </div>
  );
}

function App() {
  const [entries, setEntries] = useState<TileEntry[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [filter, setFilter] = useState("");
  const [registryMeta, setRegistryMeta] = useState<TileRegistryMeta>(
    DEFAULT_REGISTRY_META,
  );

  const summary = useMemo(() => summarizeTileRegistry(entries), [entries]);
  const groups = useMemo(
    () => buildTileRegistryGroups(entries, filter),
    [entries, filter],
  );
  const visibleEntries = useMemo(
    () => groups.flatMap((group) => group.entries),
    [groups],
  );

  useEffect(() => {
    const cleanup = window.api.onTileListMessage(
      (channel: string, ...args: unknown[]) => {
        if (channel === "tile-list:init") {
          const tiles = Array.isArray(args[0])
            ? args[0].filter(isTileEntry)
            : [];
          setEntries(tiles);
          setRegistryMeta(
            isTileRegistryMeta(args[1]) ? args[1] : DEFAULT_REGISTRY_META,
          );
        } else if (channel === "tile-list:add") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) => [
            ...prev.filter((e) => e.id !== tile.id),
            tile,
          ]);
        } else if (channel === "tile-list:remove") {
          const id = args[0] as string;
          setEntries((prev) => prev.filter((e) => e.id !== id));
        } else if (channel === "tile-list:update") {
          const tile = args[0];
          if (!isTileEntry(tile)) return;
          setEntries((prev) =>
            prev.map((e) => (e.id === tile.id ? tile : e)),
          );
        } else if (channel === "tile-list:focus") {
          setFocusedId(args[0] as string | null);
        }
      },
    );

    return () => {
      cleanup();
    };
  }, []);

  const handleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:peek-tile", id);
  }, []);

  const handleDoubleClick = useCallback((id: string) => {
    setFocusedId(id);
    window.api.sendToHost("tile-list:focus-tile", id);
  }, []);

  const handleContextMenu = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      const selected = await window.api.showContextMenu([
        { id: "rename", label: "Rename" },
      ]);
      if (selected === "rename") {
        const entry = entries.find((en) => en.id === id);
        if (entry) {
          setRenameValue(entry.title);
          setRenamingId(id);
        }
      }
    },
    [entries],
  );

  const commitRename = useCallback(
    (id: string) => {
      const trimmed = renameValue.trim();
      window.api.sendToHost("tile-list:rename-tile", id, trimmed);
      setRenamingId(null);
      setRenameValue("");
    },
    [renameValue],
  );

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (renamingId) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (visibleEntries.length === 0) return;
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const currentIdx = visibleEntries.findIndex(
        (entry) => entry.id === focusedId,
      );
      const nextIdx =
        currentIdx < 0
          ? 0
          : (currentIdx + dir + visibleEntries.length) % visibleEntries.length;
      handleClick(visibleEntries[nextIdx].id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visibleEntries, focusedId, handleClick, renamingId]);

  return (
    <div className="tile-list">
      <header className="registry-header">
        <div className="registry-heading">
          <div className="registry-eyebrow">Tile Registry</div>
          <div className="registry-title">{registryMeta.workspaceName}</div>
        </div>
        <div className="registry-stats" aria-label="Tile status counts">
          <div className="registry-stat" data-tone="live">
            <span>{summary.running}</span>
            <small>LIVE</small>
          </div>
          <div className="registry-stat" data-tone="error">
            <span>{summary.error}</span>
            <small>ERR</small>
          </div>
          <div className="registry-stat">
            <span>{summary.total}</span>
            <small>TILES</small>
          </div>
        </div>
      </header>

      <div className="tile-search">
        <input
          className="tile-search-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter name, host, status"
          spellCheck={false}
        />
      </div>

      <div className="tile-groups">
        {groups.map((group) => (
          <section className="tile-group" key={group.id}>
            <div className="tile-group-header">
              <span>{group.label}</span>
              <span>{group.summary.total}</span>
            </div>
            {group.entries.map((entry) => (
              <TileEntryRow
                key={entry.id}
                entry={entry}
                focused={entry.id === focusedId}
                isRenaming={entry.id === renamingId}
                renameValue={entry.id === renamingId ? renameValue : ""}
                onClick={() => handleClick(entry.id)}
                onDoubleClick={() => handleDoubleClick(entry.id)}
                onContextMenu={(e) => handleContextMenu(entry.id, e)}
                onRenameChange={setRenameValue}
                onRenameConfirm={() => commitRename(entry.id)}
                onRenameCancel={cancelRename}
              />
            ))}
          </section>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="tile-empty">
          No tiles on canvas
        </div>
      )}
      {entries.length > 0 && visibleEntries.length === 0 && (
        <div className="tile-empty">
          No matching tiles
        </div>
      )}
    </div>
  );
}

export default App;
