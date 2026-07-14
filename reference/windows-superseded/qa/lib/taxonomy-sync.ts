import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { KERNEL_EVENT_KINDS } from "../../src/kernel/events/taxonomy";

const REPO_ROOT = join(import.meta.dir, "../..");
const TAXONOMY_DOC = join(REPO_ROOT, "docs/v4/EVENT_TAXONOMY.md");

const SEARCH_ROOTS = [
  join(REPO_ROOT, "src"),
  join(REPO_ROOT, "quantflow-electron", "src"),
  join(REPO_ROOT, "quantflow-electron", "scripts"),
  join(REPO_ROOT, "tools"),
];

function walkSourceFiles(dir: string): string[] {
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
      files.push(...walkSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function parseDocKinds(): string[] {
  const text = readFileSync(TAXONOMY_DOC, "utf-8");
  const kinds: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) kinds.push(m[1]!);
  }
  return kinds.sort();
}

function kindAppearsInSources(kind: string, corpus: string): boolean {
  const quoted = [`'${kind}'`, `"${kind}"`, `\`${kind}\``];
  return quoted.some((q) => corpus.includes(q));
}

export function runTaxonomySyncCheck(): boolean {
  const codeKinds = [...KERNEL_EVENT_KINDS].sort();
  const docKinds = parseDocKinds();

  const codeSet = new Set(codeKinds);
  const docSet = new Set(docKinds);

  let ok = true;

  const inCodeNotDoc = codeKinds.filter((k) => !docSet.has(k));
  const inDocNotCode = docKinds.filter((k) => !codeSet.has(k));

  if (inCodeNotDoc.length > 0) {
    ok = false;
    console.error("taxonomy-sync: in KERNEL_EVENT_KINDS but missing from EVENT_TAXONOMY.md:");
    for (const k of inCodeNotDoc) console.error(`  - ${k}`);
  }
  if (inDocNotCode.length > 0) {
    ok = false;
    console.error("taxonomy-sync: in EVENT_TAXONOMY.md but missing from KERNEL_EVENT_KINDS:");
    for (const k of inDocNotCode) console.error(`  - ${k}`);
  }

  const sourceFiles = SEARCH_ROOTS.flatMap((root) => walkSourceFiles(root));
  const corpus = sourceFiles
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");

  const deadKinds = codeKinds.filter((k) => !kindAppearsInSources(k, corpus));
  if (deadKinds.length > 0) {
    ok = false;
    console.error("taxonomy-sync: kind in KERNEL_EVENT_KINDS with no quoted call site in src/ or quantflow-electron/:");
    for (const k of deadKinds) console.error(`  - ${k}`);
  }

  if (ok) {
    console.log(`taxonomy-sync: OK (${codeKinds.length} kinds, doc == code, all have call sites)`);
  }

  return ok;
}
