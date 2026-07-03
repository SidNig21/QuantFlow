import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { SECRET_ENV_NAMES } from '../../src/vault/credentials';
import {
  isSecretEnvReadAllowed,
  isSecretsScanSkipped,
} from './secrets-accessor-allowlist';

const REPO_ROOT = join(import.meta.dir, '../..');

const SCAN_ROOTS = [
  join(REPO_ROOT, 'src'),
  join(REPO_ROOT, 'quantflow-electron', 'src'),
  join(REPO_ROOT, 'quantflow-electron', 'scripts'),
  join(REPO_ROOT, 'tools', 'quantflow-mcp'),
  join(REPO_ROOT, 'qa'),
];

/** Literal secret-shaped strings that must not appear in tracked source. */
const FORBIDDEN_LITERAL_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bsk-ant-[a-zA-Z0-9-]{20,}\b/,
  /\bghp_[a-zA-Z0-9]{20,}\b/,
  /\bgho_[a-zA-Z0-9]{20,}\b/,
  /\bxox[baprs]-[a-zA-Z0-9-]{20,}\b/,
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
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...walkSources(full));
    } else if (/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function buildSecretEnvPattern(): RegExp {
  const names = [...SECRET_ENV_NAMES, 'QUANTFLOW_RELAY_TOKEN_FILE'];
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`process\\.env\\.(${alt})\\b`, 'g');
}

export function runSecretsAccessorCheck(): boolean {
  let ok = true;
  const secretEnvRe = buildSecretEnvPattern();
  const files = SCAN_ROOTS.flatMap((root) => walkSources(root));

  for (const absPath of files) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    const skipAll = isSecretsScanSkipped(rel);
    if (skipAll) continue;

    const text = readFileSync(absPath, 'utf-8');
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let m: RegExpExecArray | null;
      secretEnvRe.lastIndex = 0;
      while ((m = secretEnvRe.exec(line)) !== null) {
        const envName = m[1]!;
        if (isSecretEnvReadAllowed(rel, envName)) continue;
        ok = false;
        console.error(
          `secrets-accessor: direct process.env.${envName} read outside accessor: ${rel}:${i + 1}`,
        );
      }
    }
  }

  for (const absPath of files) {
    const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    if (isSecretsScanSkipped(rel)) continue;
    const lines = readFileSync(absPath, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const pattern of FORBIDDEN_LITERAL_PATTERNS) {
        if (pattern.test(line)) {
          ok = false;
          console.error(
            `secrets-accessor: forbidden secret literal pattern in ${rel}:${i + 1}`,
          );
        }
      }
    }
  }

  return ok;
}
