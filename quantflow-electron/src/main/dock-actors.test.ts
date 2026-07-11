import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOCK_ACTOR_IDS,
  DOCK_ACTORS,
  DOCK_SPAWN_ACTOR_IDS,
  buildDockLegendRecipes,
  buildDockRoles,
  dockActorToLegendRecipe,
  dockActorToRole,
  getAgentAdapterForRole,
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

  test("dock spawn rail starts empty until canvas proof promotes actors", () => {
    expect([...DOCK_SPAWN_ACTOR_IDS]).toEqual([]);
    expect(buildDockLegendRecipes()).toHaveLength(0);
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

  test("agent actors use AgentOS rail; secondary Eve personas ride Eve's local rail", () => {
    const softwareById = {
      hermes: "claude-code",
      eve: "eve",
    } as const;
    for (const id of ["hermes", "eve"] as const) {
      const role = dockActorToRole(getDockActor(id)!);
      expect(role.runtimeTarget).toBe("agentos");
      expect(role.harnessKind).toBe("agentos");
      expect(role.agentosSoftware).toBe(softwareById[id]);
      expect(role.agentosSoftware).not.toBe("pi");
      expect(role.commandTemplate).toBeUndefined();
    }
    expect(dockActorToRole(getDockActor("hermes")!).legacyRuntimeTarget).toBe("herdr-wsl");
    for (const id of ["claude", "codex"] as const) {
      const role = dockActorToRole(getDockActor(id)!);
      expect(role.runtimeTarget).toBe("windows-pty");
      expect(role.agentAdapter?.integrationMode).toBe("native-tui");
      expect(role.agentAdapter?.launch).toBe(id);
      expect(role.commandTemplate).toContain(id);
    }
    // Secondary Eve personas run locally via npm run dev until their own proofs land.
    for (const id of ["bovada-odds", "canvas-scout"] as const) {
      const role = dockActorToRole(getDockActor(id)!);
      expect(role.runtimeTarget).toBe("windows-pty");
      expect(role.harnessKind).not.toBe("agentos");
      expect(role.agentosSoftware).toBeUndefined();
      expect(role.commandTemplate).toBe("npm run dev");
      expect(role.agentAdapter?.integrationMode).toBe("server");
      expect(role.startupPrompt).toBeUndefined();
    }
  });

  test("dock copy bans cable-coordination language for Hermes", () => {
    const hermes = getDockActor("hermes")!;
    const copy = `${hermes.description} ${hermes.startupPrompt ?? ""}`.toLowerCase();
    expect(copy).not.toContain("coordinate via cables");
    expect(copy).not.toContain("delegates via cables");
  });

  test("Eve personas resolve package cwd under eve-agents", () => {
    const previous = process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
    try {
      process.env.QUANTFLOW_DEV_WORKTREE_ROOT = "C:\\Users\\rybow\\QuantFlow";
      expect(resolveEveAgentCwd("bovada-odds")).toContain("eve-agents\\bovada-odds");
    } finally {
      if (previous == null) delete process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
      else process.env.QUANTFLOW_DEV_WORKTREE_ROOT = previous;
    }
  });

  test("Eve persona cwd recovers when dev worktree env points at electron package", () => {
    const previousDev = process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
    const previousCollab = process.env.COLLAB_DEV_WORKTREE_ROOT;
    const root = join(tmpdir(), `quantflow-eve-cwd-${Date.now()}`);
    const electronDir = join(root, "quantflow-electron");
    const agentDir = join(root, "eve-agents", "bovada-odds");
    mkdirSync(electronDir, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    try {
      delete process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
      process.env.COLLAB_DEV_WORKTREE_ROOT = electronDir;
      expect(resolveEveAgentCwd("bovada-odds")).toBe(agentDir);
    } finally {
      if (previousDev == null) delete process.env.QUANTFLOW_DEV_WORKTREE_ROOT;
      else process.env.QUANTFLOW_DEV_WORKTREE_ROOT = previousDev;
      if (previousCollab == null) delete process.env.COLLAB_DEV_WORKTREE_ROOT;
      else process.env.COLLAB_DEV_WORKTREE_ROOT = previousCollab;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("build helpers match registry vs verified dock spawn rail", () => {
    expect(buildDockRoles()).toHaveLength(7);
    expect(buildDockLegendRecipes()).toHaveLength(0);
  });

  test("claude-worker alias resolves to claude", () => {
    expect(getDockActor("claude-worker")?.id).toBe("claude");
  });

  test("legend recipe carries adapter + folded launch (spawn self-sufficiency)", () => {
    // #3: a legend/recipe spawn must not drop the adapter or folded prompt,
    // even on the synthesize fallback path where rolesList() is unavailable.
    const claudeRecipe = dockActorToLegendRecipe(getDockActor("claude")!);
    expect(claudeRecipe.agentAdapter?.integrationMode).toBe("native-tui");
    expect(claudeRecipe.agentAdapter).not.toHaveProperty("promptArg");
    expect(claudeRecipe.commandTemplate?.startsWith("claude")).toBe(true);
    expect(claudeRecipe.startupPrompt).toBeUndefined(); // folded into launch

    const codexRecipe = dockActorToLegendRecipe(getDockActor("codex")!);
    expect(codexRecipe.agentAdapter?.integrationMode).toBe("native-tui");
    expect(codexRecipe.commandTemplate).toBe("codex");
    expect(codexRecipe.startupPrompt).toBeTruthy(); // codex has no promptArg → sent after ready

    const eveRecipe = dockActorToLegendRecipe(getDockActor("eve")!);
    expect(eveRecipe.agentAdapter).toBeUndefined();
    expect(eveRecipe.commandTemplate).toBeUndefined();
    expect(eveRecipe.runtimeTarget).toBe("agentos");
    expect(eveRecipe.harnessKind).toBe("agentos");
    expect(eveRecipe.agentosSoftware).toBe("eve");
  });

  test("role and legend recipe projections are structured-clone safe for IPC", () => {
    const claude = getDockActor("claude")!;
    expect(() => structuredClone(dockActorToRole(claude))).not.toThrow();
    expect(() => structuredClone(dockActorToLegendRecipe(claude))).not.toThrow();
  });
  test("getAgentAdapterForRole resolves from the roster — single source of truth", () => {
    // #1: a2a/readiness resolves adapters from the SAME actor field used to
    // spawn. No separate hardcoded map to drift out of sync.
    expect(getAgentAdapterForRole("claude")?.launch).toBe("claude");
    expect(getAgentAdapterForRole("codex")?.launch).toBe("codex");
    expect(getAgentAdapterForRole("eve")).toBeNull();
    expect(getAgentAdapterForRole("nonexistent")).toBeNull();
    expect(getAgentAdapterForRole(undefined)).toBeNull();
  });
});
