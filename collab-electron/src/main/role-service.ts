import { readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { COLLAB_DIR } from "./paths";

const ROLES_DIR = join(COLLAB_DIR, "roles");

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  systemPrompt?: string;
}

const BUILT_IN_ROLES: Role[] = [
  {
    id: "coder",
    name: "Coder",
    description: "Writes and debugs code",
    color: "#6366f1",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "Reviews code and gives feedback",
    color: "#10b981",
  },
  {
    id: "planner",
    name: "Planner",
    description: "Plans tasks and breaks down work",
    color: "#f59e0b",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Researches topics and synthesizes information",
    color: "#8b5cf6",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Writes documentation and content",
    color: "#ec4899",
  },
];

export async function listRoles(): Promise<Role[]> {
  try {
    await mkdir(ROLES_DIR, { recursive: true });
    const files = await readdir(ROLES_DIR);
    const roleMap = new Map<string, Role>(
      BUILT_IN_ROLES.map((r) => [r.id, r]),
    );
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(ROLES_DIR, file), "utf-8");
        const parsed: Role = JSON.parse(raw);
        if (parsed.id && parsed.name && parsed.color) {
          roleMap.set(parsed.id, parsed);
        }
      } catch { /* skip invalid */ }
    }
    return [...roleMap.values()];
  } catch {
    return [...BUILT_IN_ROLES];
  }
}

export async function getRole(id: string): Promise<Role | null> {
  const roles = await listRoles();
  return roles.find((r) => r.id === id) ?? null;
}
