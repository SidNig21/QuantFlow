/**
 * AgentOS credential order — first present wins (mirrors FABLED_MISSION §4 P5).
 * Host process duplicates this logic in tools/agentos-host/host.js (WSL env).
 *
 * S2 Windows-blindness fix: the founder's key may legitimately live only in the
 * WSL environment (~/.profile), where the sidecar host CAN see it while the
 * Windows process env cannot. The host reports a BOOLEAN `hasCredential` on
 * GET /health; health probes cache that report here and `hasAgentOsCredential`
 * unions it with the Windows env check. Only a boolean ever crosses — never a
 * name-with-value, value, or length.
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

/** Windows-process-env check only (the pre-S2 behavior). */
export function hasWindowsAgentOsCredential(): boolean {
  return resolveAgentOsCredential() !== null;
}

/**
 * Last host-reported credential boolean. `null` = unknown (host unreachable,
 * never probed, or host predates the report) — callers then fall back to the
 * Windows env check alone, i.e. pre-S2 behavior.
 */
let lastHostCredentialReport: boolean | null = null;

/** Record the host's /health `hasCredential` boolean. Non-boolean → unknown. */
export function recordHostCredentialReport(report: boolean | null | undefined): void {
  lastHostCredentialReport = typeof report === 'boolean' ? report : null;
}

export function getHostCredentialReport(): boolean | null {
  return lastHostCredentialReport;
}

/**
 * Union of Windows env keys and the host's last reachable report. Windows env
 * keys still count; host-only WSL keys now count too. Host unreachable (null
 * report) keeps the original Windows-only behavior.
 */
export function hasAgentOsCredential(): boolean {
  return hasWindowsAgentOsCredential() || lastHostCredentialReport === true;
}
