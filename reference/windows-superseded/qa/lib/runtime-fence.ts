import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { runOneEventPathCheck } from './one-event-path';
import {
  detectHandleCommandSymbol,
  hasKernelDbCanonicalWrite,
  isHandleCommandAllowed,
  isKernelDbWriteAllowed,
} from './runtime-fence-allowlist';

const REPO_ROOT = join(import.meta.dir, '../..');

const FENCE_SCAN_ROOTS = [
  join(REPO_ROOT, 'src', 'harness'),
  join(REPO_ROOT, 'quantflow-electron', 'src', 'main'),
  join(REPO_ROOT, 'tools', 'quantflow-mcp'),
];

function walkSources(dir: string): string[] {
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
      if (entry.name === 'node_modules') continue;
      files.push(...walkSources(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function runRuntimeFenceCheck(): boolean {
  let ok = true;

  if (!runOneEventPathCheck()) {
    ok = false;
    console.error('runtime-fence: one-event-path sub-check failed');
  }

  const files = FENCE_SCAN_ROOTS.flatMap((root) => walkSources(root));

  for (const absPath of files) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    if (/\.test\.(ts|tsx|js)$/.test(rel)) continue;

    const text = readFileSync(absPath, 'utf-8');

    const symbol = detectHandleCommandSymbol(text);
    if (symbol && !isHandleCommandAllowed(rel, symbol)) {
      ok = false;
      console.error(
        `runtime-fence: ${symbol} outside Kernel command boundary: ${rel}`,
      );
    }

    if (/\bemitKernelEvent\s*\(/.test(text)) {
      ok = false;
      console.error(
        `runtime-fence: emitKernelEvent in external-runtime zone: ${rel}`,
      );
    }

    if (
      /\bgetKernelDb\s*\(/.test(text)
      && hasKernelDbCanonicalWrite(text)
      && !isKernelDbWriteAllowed(rel)
    ) {
      ok = false;
      console.error(
        `runtime-fence: direct Kernel DB canonical write outside allowlist: ${rel}`,
      );
    }
  }

  return ok;
}
