import { describe, expect, test } from "bun:test";
import {
  buildTileRegistryGroups,
  matchesTileRegistryFilter,
  normalizeTileStatus,
  summarizeTileRegistry,
  type TileRegistryEntry,
} from "./tile-registry";

const entries: TileRegistryEntry[] = [
  {
    id: "term-planner",
    type: "term",
    title: "Planner",
    description: "/repo/quantflow",
    status: "running",
    groupLabel: "Terminal Sessions",
    metaLabel: "@planner",
    routeHandle: "planner",
  },
  {
    id: "term-reviewer",
    type: "term",
    title: "Reviewer",
    description: "/repo/quantflow",
    status: "blocked",
    groupLabel: "Terminal Sessions",
    metaLabel: "@reviewer",
    routeHandle: "reviewer",
  },
  {
    id: "note-readme",
    type: "note",
    title: "README.md",
    description: "docs",
    status: null,
    groupLabel: "Docs",
  },
];

describe("normalizeTileStatus", () => {
  test("maps runtime statuses into registry tones", () => {
    expect(normalizeTileStatus("active")).toBe("running");
    expect(normalizeTileStatus("blocked")).toBe("error");
    expect(normalizeTileStatus("spawn_failed")).toBe("error");
    expect(normalizeTileStatus("exited")).toBe("exited");
    expect(normalizeTileStatus(null)).toBe("idle");
  });
});

describe("summarizeTileRegistry", () => {
  test("counts running, error, and idle tiles", () => {
    expect(summarizeTileRegistry(entries)).toEqual({
      total: 3,
      running: 1,
      error: 1,
      idle: 1,
    });
  });
});

describe("matchesTileRegistryFilter", () => {
  test("matches title, host/path, status, group, and route handle fields", () => {
    expect(matchesTileRegistryFilter(entries[0], "planner")).toBe(true);
    expect(matchesTileRegistryFilter(entries[0], "quantflow")).toBe(true);
    expect(matchesTileRegistryFilter(entries[0], "running")).toBe(true);
    expect(matchesTileRegistryFilter(entries[2], "docs")).toBe(true);
    expect(matchesTileRegistryFilter(entries[2], "reviewer")).toBe(false);
  });
});

describe("buildTileRegistryGroups", () => {
  test("groups entries, sorts attention before live before idle, and summarizes visible rows", () => {
    const groups = buildTileRegistryGroups(entries);

    expect(groups.map((group) => group.label)).toEqual([
      "Terminal Sessions",
      "Docs",
    ]);
    expect(groups[0].summary).toEqual({
      total: 2,
      running: 1,
      error: 1,
      idle: 0,
    });
    expect(groups[0].entries.map((entry) => entry.id)).toEqual([
      "term-reviewer",
      "term-planner",
    ]);
  });

  test("filters groups to matching rows", () => {
    const groups = buildTileRegistryGroups(entries, "readme");

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Docs");
    expect(groups[0].entries).toHaveLength(1);
  });
});
