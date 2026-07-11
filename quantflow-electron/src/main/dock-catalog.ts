/** Full actor registry — launch profiles, roles, relay adapters. Not the Dock UI list. */
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

/**
 * Verified-only Dock spawn rail. Empty until an actor passes live canvas proof
 * (dock click → tile → AgentOS session → Kernel receipt). Promote one id at a
 * time after `docs/v7/V7_FIRST_PROOF.md` / P1d evidence — never pre-ship hope.
 */
export const DOCK_SPAWN_ACTOR_IDS = [] as const satisfies readonly DockActorId[];

export type DockActorKind = "codex" | "worker" | "agent" | "eve";

export interface DockActorCatalogEntry {
  id: DockActorId;
  name: string;
  description: string;
  dockSubtitle: string;
  color: string;
  roleColor: string;
  icon: string;
  kind: DockActorKind;
}

export const DOCK_ACTOR_CATALOG: readonly DockActorCatalogEntry[] = [
  {
    id: "pi-stick",
    name: "Pi Stick",
    description: "AgentOS projection proof — pi session, terminal tile, type to talk",
    dockSubtitle: "agentos · pi stick",
    color: "var(--rail-worker, #a3e635)",
    roleColor: "#a3e635",
    icon: "shell",
    kind: "worker",
  },
  {
    id: "codex",
    name: "Codex",
    description: "Codex agent (native CLI in tile PTY)",
    dockSubtitle: "windows-pty · codex",
    color: "var(--rail-codex, #14d9ff)",
    roleColor: "#38bdf8",
    icon: "codex",
    kind: "codex",
  },
  {
    id: "claude",
    name: "Claude Code",
    description: "Claude Code agent (native CLI in tile PTY)",
    dockSubtitle: "windows-pty · claude",
    color: "var(--rail-worker, #ffc24a)",
    roleColor: "#f97316",
    icon: "claude",
    kind: "worker",
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
  },
  {
    id: "eve",
    name: "Eve",
    description: "QuantFlow Eve agent (AgentOS eve software)",
    dockSubtitle: "agentos · eve",
    color: "var(--rail-agent, #6366f1)",
    roleColor: "#6366f1",
    icon: "eve",
    kind: "eve",
  },
  {
    id: "bovada-odds",
    name: "Bovada Odds",
    description: "Bovada odds Eve agent (npm run dev · eve-agents/bovada-odds)",
    dockSubtitle: "eve · bovada odds",
    color: "var(--rail-agent, #22c55e)",
    roleColor: "#22c55e",
    icon: "eve",
    kind: "eve",
  },
  {
    id: "canvas-scout",
    name: "Canvas Scout",
    description: "Canvas scout Eve agent (npm run dev · eve-agents/canvas-scout)",
    dockSubtitle: "eve · canvas scout",
    color: "var(--rail-agent, #a855f7)",
    roleColor: "#a855f7",
    icon: "eve",
    kind: "eve",
  },
] as const;
