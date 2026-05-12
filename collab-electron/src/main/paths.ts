import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const QUANTFLOW_HOME = join(homedir(), ".quantflow");

function normalizeWindowsPath(path: string): string {
  if (process.platform !== "win32") return path;
  if (path.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${path.slice("\\\\?\\UNC\\".length)}`;
  }
  if (path.startsWith("\\\\?\\")) {
    return path.slice("\\\\?\\".length);
  }
  return path;
}

function getDevWorktreeRoot(): string {
  const root =
    process.env["QUANTFLOW_DEV_WORKTREE_ROOT"] ||
    process.env["COLLAB_DEV_WORKTREE_ROOT"] ||
    process.cwd();
  return resolve(normalizeWindowsPath(root));
}

function getDevWorktreeId(): string {
  return createHash("sha256")
    .update(getDevWorktreeRoot())
    .digest("hex")
    .slice(0, 12);
}

export const DEV_WORKTREE_ID = import.meta.env?.DEV
  ? `worktree-${getDevWorktreeId()}`
  : null;

export const QUANTFLOW_DIR = import.meta.env?.DEV
  ? join(QUANTFLOW_HOME, "dev", DEV_WORKTREE_ID ?? "worktree-unknown")
  : QUANTFLOW_HOME;
