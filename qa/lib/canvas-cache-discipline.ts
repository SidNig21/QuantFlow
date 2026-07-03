import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import {
  CANVAS_CACHE_ALLOWLIST_FILES,
  CANVAS_CACHE_MUTATION_ALLOWLIST,
} from "./canvas-cache-allowlist";

const REPO_ROOT = join(import.meta.dir, "../..");
const SHELL_SRC = join(
  REPO_ROOT,
  "quantflow-electron",
  "src",
  "windows",
  "shell",
  "src",
);

const MUTATION_PATTERN =
  /\b(addTile|removeTile|addConnection|removeConnection|clearConnections|bringToFront|updateConnectionLabel)\s*\(|(?:^|[^\w.])(tiles|connections)\.(?:push|splice)\s*\(|(?:^|[^\w.])(tiles|connections)\.length\s*=/;

function walkShellSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkShellSources(full));
    } else if (/\.(js|ts)$/.test(entry.name) && !/\.test\.(js|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function runCanvasCacheDisciplineCheck(): boolean {
  const files = walkShellSources(SHELL_SRC);
  let ok = true;

  for (const absPath of files) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
    if (CANVAS_CACHE_ALLOWLIST_FILES.has(rel)) continue;

    const lines = readFileSync(absPath, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!MUTATION_PATTERN.test(line)) continue;
      ok = false;
      console.error(
        `canvas-cache-discipline: unallowlisted cache mutation ${rel}:${i + 1}: ${line.trim()}`,
      );
    }
  }

  if (!ok) {
    console.error("canvas-cache-discipline: allowed files:");
    for (const entry of CANVAS_CACHE_MUTATION_ALLOWLIST) {
      console.error(`  - ${entry.file} — ${entry.reason}`);
    }
  }

  return ok;
}
