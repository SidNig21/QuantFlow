import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { KERNEL_EVENT_KINDS } from "../../src/kernel/events/taxonomy";
import {
  allowedDeprecatedBusesForFile,
  DEPRECATED_BUS_LISTENER_ALLOWLIST,
  isEmitKernelEventAllowed,
} from "./one-event-path-allowlist";

const REPO_ROOT = join(import.meta.dir, "../..");
const SHELL_SRC = join(
  REPO_ROOT,
  "quantflow-electron",
  "src",
  "windows",
  "shell",
  "src",
);

const SEARCH_ROOTS = [
  join(REPO_ROOT, "src"),
  join(REPO_ROOT, "quantflow-electron", "src"),
  join(REPO_ROOT, "quantflow-electron", "scripts"),
];

/** shellApi/preload hooks that subscribe to non-kernel:event buses for canvas facts */
const DEPRECATED_LISTENER_HOOKS: Array<{ hook: RegExp; bus: string }> = [
  { hook: /onHerdrStatusChanged\s*\(/, bus: "herdr:status-changed" },
  { hook: /onPtyExit\s*\(/, bus: "pty:exit" },
  { hook: /watchtowerRuntimeEvents\s*\(/, bus: "qf:runtime:events.list" },
  { hook: /qf:runtime:events\.list/, bus: "qf:runtime:events.list" },
];

function walkSources(dir: string, ext = /\.(ts|tsx|js|jsx)$/): string[] {
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files.push(...walkSources(full, ext));
    } else if (ext.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function walkShellSources(): string[] {
  return walkSources(SHELL_SRC, /\.(js|ts)$/);
}

function extractAppendEventKinds(corpus: string): string[] {
  const kinds = new Set<string>();
  const re = /appendEvent\s*\(\s*\{[^}]*?\bkind:\s*["'`]([^"'`]+)["'`]/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    kinds.add(m[1]!);
  }
  return [...kinds];
}

export function runOneEventPathCheck(): boolean {
  let ok = true;

  // (a) Renderer deprecated-bus listeners for canonical facts
  for (const absPath of walkShellSources()) {
    if (/\.test\.(js|ts)$/.test(absPath)) continue;
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
    const text = readFileSync(absPath, "utf-8");
    const allowed = allowedDeprecatedBusesForFile(rel);

    for (const { hook, bus } of DEPRECATED_LISTENER_HOOKS) {
      if (!hook.test(text)) continue;
      if (allowed.has(bus)) continue;
      ok = false;
      console.error(
        `one-event-path: unallowlisted deprecated bus listener ${rel} → ${bus}`,
      );
    }
  }

  // (b) emitKernelEvent only from authorized modules
  const emitFiles = walkSources(join(REPO_ROOT, "src")).concat(
    walkSources(join(REPO_ROOT, "quantflow-electron", "scripts")),
  );
  for (const absPath of emitFiles) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
    const text = readFileSync(absPath, "utf-8");
    if (!/\bemitKernelEvent\s*\(/.test(text)) continue;
    if (isEmitKernelEventAllowed(rel)) continue;
    ok = false;
    console.error(
      `one-event-path: emitKernelEvent outside allowlist: ${rel}`,
    );
  }

  // (b) kernel:event IPC fan-out only in events/index.ts
  const electronMain = walkSources(join(REPO_ROOT, "quantflow-electron", "src"));
  for (const absPath of electronMain) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, "/");
    const text = readFileSync(absPath, "utf-8");
    if (!/send\s*\(\s*["']kernel:event["']/.test(text)) continue;
    if (rel === "src/kernel/events/index.ts") continue;
    ok = false;
    console.error(
      `one-event-path: kernel:event IPC send outside canonical module: ${rel}`,
    );
  }

  // (c) runtime events-repo kinds disjoint from KERNEL_EVENT_KINDS
  const kernelKindSet = new Set<string>(KERNEL_EVENT_KINDS);
  const runtimeCorpus = SEARCH_ROOTS.flatMap((root) => walkSources(root))
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  const runtimeKinds = extractAppendEventKinds(runtimeCorpus);
  const overlap = runtimeKinds.filter((k) => kernelKindSet.has(k));
  if (overlap.length > 0) {
    ok = false;
    console.error(
      "one-event-path: runtime appendEvent kinds overlap KERNEL_EVENT_KINDS:",
    );
    for (const k of overlap.sort()) console.error(`  - ${k}`);
  }

  if (!ok) {
    console.error("one-event-path: deprecated listener allowlist:");
    for (const entry of DEPRECATED_BUS_LISTENER_ALLOWLIST) {
      console.error(`  - ${entry.file} [${entry.bus}] — ${entry.reason}`);
    }
  }

  return ok;
}
