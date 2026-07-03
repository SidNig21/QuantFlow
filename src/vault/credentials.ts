/**
 * F1 — single host-side credential accessor.
 *
 * Reads secrets from process.env only (host side). Never logs values.
 * Renderer/preload must not read secrets — use main-process IPC instead.
 * See docs/v5/SECRETS_BOUNDARY.md.
 */

export {
  getCredential,
  hasCredential,
  SECRET_ENV_NAMES,
} from './credentials-core.js';

/** Typed known credential env var names (first-class). */
export type KnownCredentialName =
  | 'OPENROUTER_API_KEY'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'OPENCODE_API_KEY'
  | 'OPENCODE_ZEN_API_KEY'
  | 'OPENCODE_GO_API_KEY'
  | 'QUANTFLOW_RELAY_TOKEN'
  | 'QUANTFLOW_RELAY_TOKEN_FILE'
  | 'GH_TOKEN'
  | 'GITHUB_TOKEN';

/** Known names plus escape hatch for dynamic env keys. */
export type CredentialName = KnownCredentialName | (string & {});
