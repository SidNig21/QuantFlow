/**
 * AgentOS credential order — first present wins (mirrors FABLED_MISSION §4 P5).
 * Host process duplicates this logic in tools/agentos-host/host.js (WSL env).
 */
import { getCredential } from '../../vault/credentials.js';

export type AgentOsSoftware = 'opencode' | 'pi';

export interface AgentOsCredentialChoice {
  software: AgentOsSoftware;
  credentialName: string;
}

export function resolveAgentOsCredential(): AgentOsCredentialChoice | null {
  if (getCredential('OPENCODE_API_KEY') || getCredential('OPENCODE_ZEN_API_KEY')) {
    // OpenCode Zen keys ride through `pi` with a custom zen provider; the
    // `opencode` software's ACP adapter cannot select non-Anthropic providers.
    return { software: 'pi', credentialName: 'OPENCODE_API_KEY' };
  }
  if (getCredential('OPENROUTER_API_KEY')) {
    return { software: 'pi', credentialName: 'OPENROUTER_API_KEY' };
  }
  if (getCredential('ANTHROPIC_API_KEY')) {
    return { software: 'pi', credentialName: 'ANTHROPIC_API_KEY' };
  }
  return null;
}

export function hasAgentOsCredential(): boolean {
  return resolveAgentOsCredential() !== null;
}
