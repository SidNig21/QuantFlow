/** Host-side env credential reader — shared by credentials.ts and Node adapters. */

const ENV_ALIASES = {
  OPENCODE_ZEN_API_KEY: 'OPENCODE_API_KEY',
};

const OPENCODE_ENV_NAMES = ['OPENCODE_API_KEY', 'OPENCODE_ZEN_API_KEY', 'OPENCODE_GO_API_KEY'];

function getOpencodeCredential() {
  for (const envKey of OPENCODE_ENV_NAMES) {
    const raw = process.env[envKey];
    if (raw == null || raw === '') continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function getCredential(name) {
  if (name === 'OPENCODE_API_KEY' || name === 'OPENCODE_ZEN_API_KEY' || name === 'OPENCODE_GO_API_KEY') {
    return getOpencodeCredential();
  }
  const envKey = ENV_ALIASES[name] ?? name;
  const raw = process.env[envKey];
  if (raw == null || raw === '') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function hasCredential(name) {
  return getCredential(name) !== undefined;
}

export const SECRET_ENV_NAMES = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENCODE_API_KEY',
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_GO_API_KEY',
  'QUANTFLOW_RELAY_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
];
