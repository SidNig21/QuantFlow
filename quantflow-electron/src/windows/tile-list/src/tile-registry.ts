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
}

export interface TileRegistrySummary {
  total: number;
  running: number;
  error: number;
  idle: number;
}

export interface TileRegistryGroup {
  id: string;
  label: string;
  summary: TileRegistrySummary;
  entries: TileRegistryEntry[];
}

const TYPE_GROUP_LABELS: Record<string, string> = {
  term: "Terminal Sessions",
  browser: "Browsers",
  graph: "Graphs",
  note: "Notes",
  code: "Code",
  image: "Images",
};

export function typeGroupLabel(type: string): string {
  return TYPE_GROUP_LABELS[type] ?? "Other Tiles";
}

export function groupLabelForEntry(entry: TileRegistryEntry): string {
  const label = String(entry.groupLabel ?? "").trim();
  return label || typeGroupLabel(entry.type);
}

export function normalizeTileStatus(status: TileRegistryStatus): "running" | "error" | "exited" | "idle" {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return "idle";
  if (
    value === "running" ||
    value === "active" ||
    value === "working" ||
    value === "waiting"
  ) {
    return "running";
  }
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
    idle: 0,
  };

  for (const entry of entries) {
    const status = normalizeTileStatus(entry.status);
    if (status === "running") {
      summary.running += 1;
    } else if (status === "error") {
      summary.error += 1;
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

  for (const entry of entries) {
    if (!matchesTileRegistryFilter(entry, filter)) continue;
    const label = groupLabelForEntry(entry);
    const key = label.toLowerCase();
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
        label: groupLabelForEntry(sortedEntries[0]),
        summary: summarizeTileRegistry(sortedEntries),
        entries: sortedEntries,
      };
    })
    .sort((a, b) => {
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
  if (normalized === "running") return 1;
  if (normalized === "idle") return 2;
  return 3;
}
