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
    type: "codex",
    title: "Planner",
    description: "/repo/quantflow",
    status: "running",
    groupLabel: "Codex CLI agents",
    metaLabel: "@planner",
    routeHandle: "planner",
  },
  {
    id: "term-reviewer",
    type: "generic",
    title: "Reviewer",
    description: "/repo/quantflow",
    status: "blocked",
    groupLabel: "Generic CLI agents",
    metaLabel: "@reviewer",
    routeHandle: "reviewer",
  },
  {
    id: "term-worker",
    type: "worker",
    title: "Worker",
    description: "/repo/quantflow",
    status: "queued",
    groupLabel: "Workers",
    routeHandle: "worker",
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
    expect(normalizeTileStatus("queued")).toBe("queued");
    expect(normalizeTileStatus("waiting")).toBe("waiting");
    expect(normalizeTileStatus("spawn_failed")).toBe("error");
    expect(normalizeTileStatus("exited")).toBe("exited");
    expect(normalizeTileStatus(null)).toBe("idle");
  });
});

describe("summarizeTileRegistry", () => {
  test("counts running, error, queued, waiting, and idle tiles", () => {
    expect(summarizeTileRegistry(entries)).toEqual({
      total: 4,
      running: 1,
      error: 1,
      queued: 1,
      waiting: 0,
      idle: 1,
    });
  });
});

describe("matchesTileRegistryFilter", () => {
  test("matches title, host/path, status, group, and route handle fields", () => {
    expect(matchesTileRegistryFilter(entries[0], "planner")).toBe(true);
    expect(matchesTileRegistryFilter(entries[0], "quantflow")).toBe(true);
    expect(matchesTileRegistryFilter(entries[0], "running")).toBe(true);
    expect(matchesTileRegistryFilter(entries[3], "docs")).toBe(true);
    expect(matchesTileRegistryFilter(entries[3], "reviewer")).toBe(false);
  });
});

describe("buildTileRegistryGroups", () => {
  test("groups entries by V2 registry order and summarizes visible rows", () => {
    const groups = buildTileRegistryGroups(entries);

    expect(groups.map((group) => group.label)).toEqual([
      "Codex CLI agents",
      "Generic CLI agents",
      "Workers",
      "Docs",
    ]);
    expect(groups[0].summary.running).toBe(1);
    expect(groups[1].summary.error).toBe(1);
    expect(groups[2].summary.queued).toBe(1);
  });

  test("keeps existing group headers visible while filtering rows", () => {
    const groups = buildTileRegistryGroups(entries, "readme");

    expect(groups.map((group) => group.label)).toEqual([
      "Codex CLI agents",
      "Generic CLI agents",
      "Workers",
      "Docs",
    ]);
    expect(groups.flatMap((group) => group.entries)).toHaveLength(1);
    expect(groups.at(-1)?.entries[0]?.id).toBe("note-readme");
  });
});
