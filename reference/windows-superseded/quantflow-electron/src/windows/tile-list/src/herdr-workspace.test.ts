import { describe, expect, test } from "bun:test";
import { buildHerdrWorkspaceState } from "./herdr-workspace";

describe("buildHerdrWorkspaceState", () => {
  test("renders unavailable Herdr as a compact unavailable state", () => {
    const state = buildHerdrWorkspaceState({
      available: false,
      panes: [{ pane_id: "pane-a", workspace_id: "ws-1" }],
      error: "socket down",
    });

    expect(state.available).toBe(false);
    expect(state.panes).toEqual([]);
    expect(state.error).toBe("socket down");
  });

  test("links Herdr panes back to canvas tiles by pane id", () => {
    const state = buildHerdrWorkspaceState({
      available: true,
      panes: [
        {
          pane_id: "herdr-pane-123456",
          workspace_id: "quantflow-ws",
          cwd: "/repo/QuantFlow",
          agent_status: "working",
          focused: true,
        },
      ],
      tiles: [
        {
          id: "tile-hermes",
          type: "agent",
          title: "Hermes",
          description: "/repo/QuantFlow",
          status: "running",
          routeHandle: "hermes",
          herdrPaneId: "herdr-pane-123456",
        },
      ],
    });

    expect(state.available).toBe(true);
    expect(state.workspaceId).toBe("quantflow-ws");
    expect(state.panes).toHaveLength(1);
    expect(state.panes[0]).toMatchObject({
      paneId: "herdr-pane-123456",
      linkedTileId: "tile-hermes",
      title: "Hermes",
      status: "working",
    });
    expect(state.panes[0].subtitle).toContain("@hermes");
  });

  test("keeps unlinked panes visible but unfocusable", () => {
    const state = buildHerdrWorkspaceState({
      available: true,
      panes: [{ pane_id: "pane-orphan", workspace_id: "ws-1" }],
      tiles: [],
    });

    expect(state.panes[0]).toMatchObject({
      linkedTileId: null,
      title: "Herdr pane pane-orphan",
    });
  });
});
