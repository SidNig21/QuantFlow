/**
 * Allowlist for qa/secrets-accessor (Stage F1).
 * process.env.<SECRET> reads outside src/vault/credentials.ts must be listed here.
 */

export type SecretsAccessorAllowlistEntry = {
  /** Repo-relative path with forward slashes */
  file: string;
  /** Env var name or pattern reason */
  env: string;
  reason: string;
};

/** Files entirely exempt from secret-env scan (tests, docs examples). */
export const SECRETS_SCAN_SKIP_SUFFIXES = [
  '.test.ts',
  '.test.js',
  '.test.tsx',
  '.spec.ts',
  '.spec.js',
];

export const SECRETS_SCAN_SKIP_PATH_PREFIXES = [
  'docs/',
  'reference/',
  'qa/lib/secrets-accessor',
  'src/vault/credentials.ts',
  'src/vault/credentials-core.js',
];

/** Per-file justified direct env reads (should trend toward zero). */
export const SECRET_ENV_READ_ALLOWLIST: SecretsAccessorAllowlistEntry[] = [
  {
    file: 'quantflow-electron/src/windows/shell/src/watchtower-view.test.ts',
    env: 'OPENAI_API_KEY',
    reason: 'Redaction test fixture string only — not a live read',
  },
];

export function isSecretsScanSkipped(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  if (SECRETS_SCAN_SKIP_PATH_PREFIXES.some((p) => norm.startsWith(p))) return true;
  return SECRETS_SCAN_SKIP_SUFFIXES.some((s) => norm.endsWith(s));
}

export function isSecretEnvReadAllowed(relPath: string, envName: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return SECRET_ENV_READ_ALLOWLIST.some(
    (e) => e.file === norm && e.env === envName,
  );
}
