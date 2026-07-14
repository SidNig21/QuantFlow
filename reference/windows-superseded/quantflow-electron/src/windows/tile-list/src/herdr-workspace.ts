import { normalizeTileStatus, type TileRegistryEntry } from "./tile-registry";

export interface HerdrPaneRaw {
  pane_id?: string;
  paneId?: string;
  workspace_id?: string;
  workspaceId?: string;
  tab_id?: string;
  tabId?: string;
  cwd?: string;
  agent_status?: string;
  agentStatus?: string;
  focused?: boolean;
  revision?: number;
}

export interface HerdrPaneView {
  paneId: string;
  shortPaneId: string;
  workspaceId: string;
  tabId: string;
  cwd: string;
  status: string;
  focused: boolean;
  linkedTileId: string | null;
  title: string;
  subtitle: string;
}

export interface HerdrWorkspaceState {
  available: boolean;
  workspaceId: string | null;
  panes: HerdrPaneView[];
  updatedAt?: number;
  error?: string | null;
}

export const DEFAULT_HERDR_WORKSPACE: HerdrWorkspaceState = {
  available: false,
  workspaceId: null,
  panes: [],
  error: null,
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tileTitleForPane(tile?: TileRegistryEntry): string {
  return tile?.title?.trim() || tile?.routeHandle || tile?.id || "";
}

export function buildHerdrWorkspaceState({
  available,
  panes,
  tiles = [],
  workspaceId,
  updatedAt,
  error,
}: {
  available: boolean;
  panes?: HerdrPaneRaw[];
  tiles?: TileRegistryEntry[];
  workspaceId?: string | null;
  updatedAt?: number;
  error?: string | null;
}): HerdrWorkspaceState {
  if (!available) {
    return {
      available: false,
      workspaceId: workspaceId ?? null,
      panes: [],
      updatedAt,
      error: error ?? null,
    };
  }

  const tileByPane = new Map<string, TileRegistryEntry>();
  for (const tile of tiles) {
    const paneId = asText((tile as TileRegistryEntry & { herdrPaneId?: string }).herdrPaneId);
    if (paneId) tileByPane.set(paneId, tile);
  }

  const paneViews = (panes ?? [])
    .map((pane): HerdrPaneView | null => {
      const paneId = asText(pane.pane_id ?? pane.paneId);
      if (!paneId) return null;
      const linkedTile = tileByPane.get(paneId);
      const status = asText(pane.agent_status ?? pane.agentStatus) || linkedTile?.status || "unknown";
      const linkedTitle = tileTitleForPane(linkedTile);
      const cwd = asText(pane.cwd);
      return {
        paneId,
        shortPaneId: shortId(paneId),
        workspaceId: asText(pane.workspace_id ?? pane.workspaceId) || workspaceId || "",
        tabId: asText(pane.tab_id ?? pane.tabId),
        cwd,
        status,
        focused: Boolean(pane.focused),
        linkedTileId: linkedTile?.id ?? null,
        title: linkedTitle || `Herdr pane ${shortId(paneId)}`,
        subtitle: [
          linkedTile?.routeHandle ? `@${linkedTile.routeHandle}` : null,
          cwd || null,
        ].filter(Boolean).join(" / "),
      };
    })
    .filter((pane): pane is HerdrPaneView => pane !== null)
    .sort((a, b) => {
      const statusDelta =
        statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      if (a.focused !== b.focused) return a.focused ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  const firstWorkspace = paneViews.find((pane) => pane.workspaceId)?.workspaceId ?? null;
  return {
    available: true,
    workspaceId: workspaceId ?? firstWorkspace,
    panes: paneViews,
    updatedAt,
    error: null,
  };
}

function statusRank(status: string): number {
  const normalized = normalizeTileStatus(status);
  if (normalized === "error") return 0;
  if (normalized === "running") return 1;
  if (normalized === "waiting") return 2;
  if (normalized === "queued") return 3;
  return 4;
}
