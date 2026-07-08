import { describe, expect, test } from "bun:test";
import {
  DOCK_ACTOR_IDS,
  getDockActor,
} from "./dock-actors";

describe("dock split equivalence", () => {
  test("keeps load-bearing launch fields pinned as literals", () => {
    expect([...DOCK_ACTOR_IDS]).toEqual([
      "pi-stick",
      "codex",
      "claude",
      "hermes",
      "eve",
      "bovada-odds",
      "canvas-scout",
    ]);

    expect(getDockActor("pi-stick")?.runtimeTarget).toBe("agentos");
    expect(getDockActor("codex")?.runtimeTarget).toBe("windows-pty");
    expect(getDockActor("claude")?.runtimeTarget).toBe("windows-pty");
    expect(getDockActor("hermes")?.runtimeTarget).toBe("agentos");
    expect(getDockActor("eve")?.runtimeTarget).toBe("windows-pty");
    expect(getDockActor("bovada-odds")?.runtimeTarget).toBe("windows-pty");
    expect(getDockActor("canvas-scout")?.runtimeTarget).toBe("windows-pty");

    expect(getDockActor("claude")?.agentAdapter?.integrationMode).toBe("native-tui");
    expect(getDockActor("claude")?.agentAdapter?.launch).toBe("claude");
    expect(getDockActor("codex")?.agentAdapter?.integrationMode).toBe("native-tui");
    expect(getDockActor("codex")?.agentAdapter?.launch).toBe("codex");
    expect(getDockActor("eve")?.commandTemplate).toBe("npm run dev");
    expect(getDockActor("hermes")?.legacyRuntimeTarget).toBe("herdr-wsl");
  });
});
