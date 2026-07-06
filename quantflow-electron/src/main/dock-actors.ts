/**

 * QF Dock — canonical actor roster (single source of truth).

 *

 * Agent actors (Claude/Codex/Hermes) run as AgentOS sessions on the canvas.
 * Scripts use herdr-wsl; Eve personas use windows-pty.

 */

import { homedir } from "node:os";

import { join, resolve } from "node:path";

import type { AgentOsSoftware, Role, RoleRuntimeTarget } from "./role-service";



export const DOCK_ACTOR_IDS = [

  "pi-stick",

  "codex",

  "claude",

  "hermes",

  "eve",

  "bovada-odds",

  "canvas-scout",

] as const;

export type DockActorId = (typeof DOCK_ACTOR_IDS)[number];



export type DockActorKind = "codex" | "worker" | "agent" | "eve";



/** One row in the spawn rail — maps 1:1 to a Role and LegendRecipe. */

export interface DockActorDefinition {

  id: DockActorId;

  name: string;

  /** Long description (settings, tooltips). */

  description: string;

  /** Short subtitle under the name in QF Dock. */

  dockSubtitle: string;

  color: string;

  /** Hex for role registry / readiness (legend may use CSS var separately). */

  roleColor: string;

  icon: string;

  kind: DockActorKind;

  runtimeTarget: RoleRuntimeTarget;

  harnessKind?: Role["harnessKind"];

  agentosSoftware?: AgentOsSoftware;

  agentosInstruction?: string;

  commandTemplate?: string;

  /** Static cwd, or resolved at read time (Eve package folder). */

  resolveCwd?: () => string;

  cwdPolicy?: Role["cwdPolicy"];

  defaultShell?: Role["defaultShell"];

  systemPrompt?: string;

  startupPrompt?: string;

  legacyRuntimeTarget?: RoleRuntimeTarget;

  envoyProfile?: string;

  modelHint?: string;

  statusParser?: Role["statusParser"];

}



/** Override with QUANTFLOW_EVE_DIR when the Eve package is not ~/quantflow-eve. */

export function resolveDefaultEveCwd(): string {

  const fromEnv = process.env.QUANTFLOW_EVE_DIR?.trim();

  if (fromEnv) return fromEnv;

  return join(homedir(), "quantflow-eve");

}



/** Resolve an Eve agent package folder (eve-agents/<id> under the repo by default). */

export function resolveEveAgentCwd(agentId: string): string {

  const fromEnv = process.env.QUANTFLOW_EVE_AGENTS_DIR?.trim();

  if (fromEnv) return join(fromEnv, agentId);

  const repoRoot = process.env.QUANTFLOW_DEV_WORKTREE_ROOT?.trim()

    || process.env.COLLAB_DEV_WORKTREE_ROOT?.trim();

  if (repoRoot) return join(resolve(repoRoot), "eve-agents", agentId);

  return join(homedir(), "QuantFlow", "eve-agents", agentId);

}



// Eve personas run on Eve's OWN rail — local `npm run dev` in their package
// folder, authed by each package's .env.local. NOT AgentOS sessions, NEVER pi.
// (Founder directive 2026-07-05: "Bovada Odds / Canvas Scout → same rail as Eve".)
const EVE_LOCAL_ACTOR = {

  runtimeTarget: "windows-pty" as const,

  commandTemplate: "npm run dev",

  cwdPolicy: "inherit" as const,

  defaultShell: "powershell" as const,

  kind: "eve" as const,

  modelHint: "deepseek-v4-pro",

  startupPrompt:

    "You are a QuantFlow Eve tile. Chat here; follow canvas cables and operator goals when wired.",

};



export const DOCK_ACTORS: readonly DockActorDefinition[] = [

  {

    id: "pi-stick",

    name: "Pi Stick",

    description: "AgentOS projection proof — pi session, terminal tile, type to talk",

    dockSubtitle: "agentos · pi stick",

    color: "var(--rail-worker, #a3e635)",

    roleColor: "#a3e635",

    icon: "shell",

    kind: "worker",

    runtimeTarget: "agentos",

    harnessKind: "agentos",

    agentosSoftware: "pi",

    cwdPolicy: "workspace",

    defaultShell: "auto",

    startupPrompt: "You are Pi Stick — a minimal AgentOS projection witness. Reply briefly.",

  },

  {

    id: "codex",

    name: "Codex",

    description: "Codex agent (AgentOS session · codex software)",

    dockSubtitle: "agentos · codex",

    color: "var(--rail-codex, #14d9ff)",

    roleColor: "#38bdf8",

    icon: "codex",

    kind: "codex",

    runtimeTarget: "agentos",

    harnessKind: "agentos",

    agentosSoftware: "codex",

    legacyRuntimeTarget: "herdr-wsl",

    cwdPolicy: "workspace",

    defaultShell: "auto",

    startupPrompt: "Review the current task context and wait for QuantFlow operator instructions.",

    statusParser: {

      waiting: ["approval required", "continue?", "waiting for", "confirm"],

      blocked: ["error:", "failed:", "panic", "traceback"],

    },

    envoyProfile: "codex-agent",

  },

  {

    id: "claude",

    name: "Claude Code",

    description: "Claude Code agent (AgentOS session · claude-code)",

    dockSubtitle: "agentos · claude-code",

    color: "var(--rail-worker, #ffc24a)",

    roleColor: "#f97316",

    icon: "claude",

    kind: "worker",

    runtimeTarget: "agentos",

    harnessKind: "agentos",

    agentosSoftware: "claude-code",

    legacyRuntimeTarget: "herdr-wsl",

    cwdPolicy: "workspace",

    defaultShell: "auto",

    startupPrompt: "Act as the implementation worker for this QuantFlow workspace.",

    statusParser: {

      waiting: ["do you want", "proceed?", "continue?", "yes/no"],

      blocked: ["error:", "failed:", "exception", "traceback"],

    },

    envoyProfile: "claude-worker",

  },

  {

    id: "hermes",

    name: "Hermes",

    description: "Hermes orchestrator lead (AgentOS claude-code session)",

    dockSubtitle: "agentos · hermes",

    color: "var(--rail-agent, #4fc3ff)",

    roleColor: "#06b6d4",

    icon: "hermes",

    kind: "agent",

    runtimeTarget: "agentos",

    harnessKind: "agentos",

    agentosSoftware: "claude-code",

    legacyRuntimeTarget: "herdr-wsl",

    cwdPolicy: "workspace",

    defaultShell: "auto",

    startupPrompt:

      "You are Hermes, the orchestrator lead on the QuantFlow canvas. Delegate work to worker sessions via AgentOS; wait for operator goals.",

    envoyProfile: "hermes-agent",

  },

  {

    id: "eve",

    name: "Eve",

    description: "QuantFlow Eve agent (OpenCode Go · npm run dev)",

    dockSubtitle: "eve · OpenCode Go",

    color: "var(--rail-agent, #6366f1)",

    roleColor: "#6366f1",

    icon: "eve",

    kind: "eve",

    runtimeTarget: "windows-pty",

    commandTemplate: "npm run dev",

    resolveCwd: resolveDefaultEveCwd,

    cwdPolicy: "inherit",

    defaultShell: "powershell",

    modelHint: "deepseek-v4-pro",

    startupPrompt:

      "You are Eve on the QuantFlow canvas (OpenCode Go). Respond in chat; wait for operator goals.",

    envoyProfile: "eve-agent",

  },

  {

    id: "bovada-odds",

    name: "Bovada Odds",

    description: "Bovada odds Eve agent (npm run dev · eve-agents/bovada-odds)",

    dockSubtitle: "eve · bovada odds",

    color: "var(--rail-agent, #22c55e)",

    roleColor: "#22c55e",

    icon: "eve",

    ...EVE_LOCAL_ACTOR,

    resolveCwd: () => resolveEveAgentCwd("bovada-odds"),

    startupPrompt:

      "You are Bovada Odds on the QuantFlow canvas. Research betting markets; report via chat and cables.",

    envoyProfile: "eve-bovada-odds",

  },

  {

    id: "canvas-scout",

    name: "Canvas Scout",

    description: "Canvas scout Eve agent (npm run dev · eve-agents/canvas-scout)",

    dockSubtitle: "eve · canvas scout",

    color: "var(--rail-agent, #a855f7)",

    roleColor: "#a855f7",

    icon: "eve",

    ...EVE_LOCAL_ACTOR,

    resolveCwd: () => resolveEveAgentCwd("canvas-scout"),

    modelHint: "deepseek-v4-flash",

    startupPrompt:

      "You are Canvas Scout on the QuantFlow canvas. Report canvas and workflow state to other actors.",

    envoyProfile: "eve-canvas-scout",

  },

] as const;



const DOCK_ACTOR_BY_ID = new Map(DOCK_ACTORS.map((actor) => [actor.id, actor]));



export function getDockActor(id: string): DockActorDefinition | undefined {

  if (id === "claude-worker") return DOCK_ACTOR_BY_ID.get("claude");

  return DOCK_ACTOR_BY_ID.get(id as DockActorId);

}



function runtimeLabel(actor: DockActorDefinition): string {

  if (actor.harnessKind === "agentos") return "agentos";

  if (actor.runtimeTarget === "windows-pty") return "windows-pty";

  if (actor.runtimeTarget === "herdr-wsl") return "herdr-wsl";

  return actor.runtimeTarget;

}



export function dockActorToRole(actor: DockActorDefinition): Role {

  return {

    id: actor.id,

    name: actor.name,

    description: actor.description,

    color: actor.roleColor,

    icon: actor.icon,

    commandTemplate: actor.commandTemplate,

    cwd: actor.resolveCwd?.(),

    cwdPolicy: actor.cwdPolicy,

    defaultShell: actor.defaultShell,

    runtimeTarget: actor.runtimeTarget,

    harnessKind: actor.harnessKind,

    agentosSoftware: actor.agentosSoftware,

    agentosInstruction: actor.agentosInstruction,

    legacyRuntimeTarget: actor.legacyRuntimeTarget,

    startupPrompt: actor.startupPrompt,

    systemPrompt: actor.systemPrompt,

    statusParser: actor.statusParser,

    envoyProfile: actor.envoyProfile,

    envoyWrapCommand: false,

    showInLegend: true,

    legendType: actor.kind,

    modelHint: actor.modelHint,

  };

}



export function dockActorToLegendRecipe(actor: DockActorDefinition) {

  const type =

    actor.kind === "codex" ? "codex"

      : actor.kind === "eve" ? "eve"

        : actor.kind === "agent" ? "agent"

          : "worker";

  return {

    id: actor.id,

    roleId: actor.id,

    group: "spawn",

    type,

    name: actor.name,

    description: actor.dockSubtitle,

    runtime: runtimeLabel(actor),

    color: actor.color,

    icon: actor.icon,

    commandTemplate: actor.commandTemplate,

    cwd: actor.resolveCwd?.(),

    runtimeTarget: actor.runtimeTarget,

    harnessKind: actor.harnessKind,

    agentosSoftware: actor.agentosSoftware,

    agentosInstruction: actor.agentosInstruction,

    modelHint: actor.modelHint,

  };

}



export function buildDockLegendRecipes() {

  return DOCK_ACTORS.map(dockActorToLegendRecipe);

}



export function buildDockRoles(): Role[] {

  return DOCK_ACTORS.map(dockActorToRole);

}


