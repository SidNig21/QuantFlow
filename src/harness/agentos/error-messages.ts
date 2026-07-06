/**
 * AgentOS user-facing failure taxonomy (V0.3).
 * Three distinct classes: WSL host, missing credential, model/runtime.
 */
import { hasAgentOsCredential } from './credential-order';

export type AgentOsFailureKind = 'host' | 'credential' | 'model';

const UNAVAILABLE_PREFIX = /^agentos(-harness)? unavailable:\s*/i;

export const AGENTOS_NO_CLAUDE_CREDENTIAL_MESSAGE =
  'AgentOS unavailable: no Claude credential. Run claude setup-token in WSL and add CLAUDE_CODE_OAUTH_TOKEN to ~/.profile.';

export const AGENTOS_HOST_DOWN_MESSAGE =
  'AgentOS unavailable — start the fabric.';

export function stripAgentOsUnavailablePrefix(detail: string): string {
  return detail.replace(UNAVAILABLE_PREFIX, '').trim();
}

export function classifyAgentOsFailure(detail: string): AgentOsFailureKind {
  const clean = stripAgentOsUnavailablePrefix(detail).toLowerCase();
  if (
    /no agentos credential|no api key set|no claude credential|claude_code_oauth_token|setup-token/.test(clean)
    || /opencode_api_key|openrouter_api_key|anthropic_api_key/.test(clean)
    || /credential in environment/.test(clean)
  ) {
    return 'credential';
  }
  if (
    /did not become healthy|health check failed|econnrefused|wsl host|cannot convert repo path|wsl\.exe|host didn't start/.test(clean)
  ) {
    return 'host';
  }
  return 'model';
}

export function formatAgentOsUnavailable(
  detail: string,
  options: { hasCredential?: boolean } = {},
): string {
  const clean = stripAgentOsUnavailablePrefix(detail);
  // Default = union of Windows env AND the host's /health hasCredential report
  // (S2): the "no API key" fallback below only fires when BOTH say absent.
  // A detail the host itself classified as a credential failure still wins —
  // that IS the host reporting its env lacks a key.
  const hasCredential = options.hasCredential ?? hasAgentOsCredential();
  const kind = classifyAgentOsFailure(clean);

  if (kind === 'credential' || !hasCredential) {
    return AGENTOS_NO_CLAUDE_CREDENTIAL_MESSAGE;
  }
  if (kind === 'host') {
    return `${AGENTOS_HOST_DOWN_MESSAGE} (${clean})`;
  }
  return `AgentOS unavailable: model error — ${clean}`;
}
