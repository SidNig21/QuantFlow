import { describe, expect, test } from "bun:test";
import {
  DOCK_ACTOR_IDS,
  DOCK_ACTORS,
  buildDockLegendRecipes,
  buildDockRoles,
  dockActorToLegendRecipe,
  dockActorToRole,
  getDockActor,
  resolveEveAgentCwd,
} from "./dock-actors";

describe("dock-actors", () => {
  test("defines the canonical spawn-rail actors", () => {
    expect([...DOCK_ACTOR_IDS]).toEqual([
      "pi-stick",
      "codex",
      "claude",
      "hermes",
      "eve",
      "bovada-odds",
      "canvas-scout",
    ]);
    expect(DOCK_ACTORS).toHaveLength(7);
  });

  test("maps each actor to role + legend recipe with matching ids", () => {
    for (const actor of DOCK_ACTORS) {
      const role = dockActorToRole(actor);
      const recipe = dockActorToLegendRecipe(actor);
      expect(role.id).toBe(actor.id);
      expect(recipe.id).toBe(actor.id);
      expect(recipe.roleId).toBe(actor.id);
      expect(recipe.description).toBe(actor.dockSubtitle);
    }
  });

  test("pi-stick uses AgentOS pi software for projection proof", () => {
    const role = dockActorToRole(getDockActor("pi-stick")!);
    expect(role.runtimeTarget).toBe("agentos");
    expect(role.harnessKind).toBe("agentos");
    expect(role.agentosSoftware).toBe("pi");
    expect(role.commandTemplate).toBeUndefined();
  });

  test("agent actors use AgentOS rail; Eve personas ride Eve's local rail", () => {
    const softwareById = {
      codex: "codex",
      claude: "claude-code",
      hermes: "claude-code",
    } as const;
    for (const id of ["codex", "claude", "hermes"] as const) {
      const role = dockActorToRole(getDockActor(id)!);
      expect(role.runtimeTarget).toBe("agentos");
      expect(role.harnessKind).toBe("agentos");
      expect(role.legacyRuntimeTarget).toBe("herdr-wsl");
      expect(role.agentosSoftware).toBe(softwareById[id]);
      expect(role.agentosSoftware).not.toBe("pi");
    }
    // Eve + Eve personas run locally via npm run dev — NOT AgentOS, NOT pi.
    for (const id of ["eve", "bovada-odds", "canvas-scout"] as const) {
      const role = dockActorToRole(getDockActor(id)!);
      expect(role.runtimeTarget).toBe("windows-pty");
      expect(role.harnessKind).not.toBe("agentos");
      expect(role.agentosSoftware).toBeUndefined();
      expect(role.commandTemplate).toBe("npm run dev");
    }
  });

  test("dock copy bans cable-coordination language for Hermes", () => {
    const hermes = getDockActor("hermes")!;
    const copy = `${hermes.description} ${hermes.startupPrompt ?? ""}`.toLowerCase();
    expect(copy).not.toContain("coordinate via cables");
    expect(copy).not.toContain("delegates via cables");
  });

  test("Eve personas resolve package cwd under eve-agents", () => {
    process.env.QUANTFLOW_DEV_WORKTREE_ROOT = "C:\\Users\\rybow\\QuantFlow";
    expect(resolveEveAgentCwd("bovada-odds")).toContain("eve-agents\\bovada-odds");
    delete process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
  });

  test("build helpers match DOCK_ACTORS length", () => {
    expect(buildDockRoles()).toHaveLength(7);
    expect(buildDockLegendRecipes()).toHaveLength(7);
  });

  test("claude-worker alias resolves to claude", () => {
    expect(getDockActor("claude-worker")?.id).toBe("claude");
  });
});
