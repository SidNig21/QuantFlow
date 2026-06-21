export type TileRegistryStatus = string | null;

export interface TileRegistryEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  status: TileRegistryStatus;
  groupLabel?: string;
  metaLabel?: string;
  routeHandle?: string;
  herdrPaneId?: string | null;
  herdrWorkspaceId?: string | null;
  herdrAgentName?: string | null;
  runtimeTarget?: string | null;
}

export interface TileRegistrySummary {
  total: number;
  running: number;
  error: number;
  queued: number;
  waiting: number;
  idle: number;
}

export interface TileRegistryGroup {
  id: string;
  label: string;
  summary: TileRegistrySummary;
  entries: TileRegistryEntry[];
}

const TYPE_GROUP_LABELS: Record<string, string> = {
  codex: "Codex CLI agents",
  generic: "Generic CLI agents",
  agent: "Agents",
  worker: "Workers",
  term: "Terminal sessions",
  tool: "Tools",
  memory: "Memory",
  browser: "Browsers",
  graph: "Graph tiles",
  note: "Notes",
  code: "Code",
  image: "Images",
};

const GROUP_ORDER = [
  "codex cli agents",
  "generic cli agents",
  "agents",
  "workers",
  "terminal sessions",
  "graph tiles",
  "tools",
  "memory",
  "browsers",
  "notes",
  "code",
  "images",
];

export function typeGroupLabel(type: string): string {
  return TYPE_GROUP_LABELS[type] ?? "Other Tiles";
}

export function groupLabelForEntry(entry: TileRegistryEntry): string {
  const label = String(entry.groupLabel ?? "").trim();
  return label || typeGroupLabel(entry.type);
}

export function normalizeTileStatus(status: TileRegistryStatus): "running" | "error" | "exited" | "queued" | "waiting" | "idle" {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "idle";
  if (
    value === "running" ||
    value === "active" ||
    value === "working"
  ) {
    return "running";
  }
  if (value === "queued" || value === "queue") return "queued";
  if (value === "waiting" || value === "pending") return "waiting";
  if (
    value === "error" ||
    value === "failed" ||
    value === "blocked" ||
    value.includes("error") ||
    value.includes("fail")
  ) {
    return "error";
  }
  if (value === "exited" || value === "closed" || value === "stopped") {
    return "exited";
  }
  return "idle";
}

export function summarizeTileRegistry(entries: TileRegistryEntry[]): TileRegistrySummary {
  const summary: TileRegistrySummary = {
    total: entries.length,
    running: 0,
    error: 0,
    queued: 0,
    waiting: 0,
    idle: 0,
  };

  for (const entry of entries) {
    const status = normalizeTileStatus(entry.status);
    if (status === "running") {
      summary.running += 1;
    } else if (status === "error") {
      summary.error += 1;
    } else if (status === "queued") {
      summary.queued += 1;
    } else if (status === "waiting") {
      summary.waiting += 1;
    } else {
      summary.idle += 1;
    }
  }

  return summary;
}

export function matchesTileRegistryFilter(
  entry: TileRegistryEntry,
  filter: string,
): boolean {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  const fields = [
    entry.title,
    entry.description,
    entry.type,
    entry.status,
    entry.groupLabel,
    entry.metaLabel,
    entry.routeHandle,
    normalizeTileStatus(entry.status),
  ];
  return fields.some((field) => String(field ?? "").toLowerCase().includes(query));
}

export function buildTileRegistryGroups(
  entries: TileRegistryEntry[],
  filter = "",
): TileRegistryGroup[] {
  const map = new Map<string, TileRegistryEntry[]>();
  const baseLabels = new Map<string, string>();

  for (const entry of entries) {
    const label = groupLabelForEntry(entry);
    const key = label.toLowerCase();
    baseLabels.set(key, label);
    if (!matchesTileRegistryFilter(entry, filter)) {
      if (!map.has(key)) map.set(key, []);
      continue;
    }
    const items = map.get(key) ?? [];
    items.push(entry);
    map.set(key, items);
  }

  return Array.from(map.entries())
    .map(([id, groupEntries]) => {
      const sortedEntries = [...groupEntries].sort((a, b) => {
        const statusDelta = statusRank(a.status) - statusRank(b.status);
        if (statusDelta !== 0) return statusDelta;
        return a.title.localeCompare(b.title);
      });
      return {
        id,
        label: sortedEntries[0]
          ? groupLabelForEntry(sortedEntries[0])
          : baseLabels.get(id) ?? id,
        summary: summarizeTileRegistry(sortedEntries),
        entries: sortedEntries,
      };
    })
    .sort((a, b) => {
      const orderDelta = groupRank(a.label) - groupRank(b.label);
      if (orderDelta !== 0) return orderDelta;
      const errorDelta = b.summary.error - a.summary.error;
      if (errorDelta !== 0) return errorDelta;
      const runningDelta = b.summary.running - a.summary.running;
      if (runningDelta !== 0) return runningDelta;
      return a.label.localeCompare(b.label);
    });
}

function statusRank(status: TileRegistryStatus): number {
  const normalized = normalizeTileStatus(status);
  if (normalized === "error") return 0;
  if (normalized === "queued") return 1;
  if (normalized === "waiting") return 2;
  if (normalized === "running") return 3;
  if (normalized === "idle") return 4;
  return 5;
}

function groupRank(label: string): number {
  const normalized = label.toLowerCase();
  const index = GROUP_ORDER.indexOf(normalized);
  return index >= 0 ? index : GROUP_ORDER.length;
}
