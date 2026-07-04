import { describe, expect, test } from 'bun:test';
import {
  classifyAgentOsFailure,
  formatAgentOsUnavailable,
} from './error-messages';

describe('agentos error-messages', () => {
  test('classifies host health timeout', () => {
    expect(classifyAgentOsFailure('agentos-host did not become healthy within 30000ms')).toBe('host');
  });

  test('classifies missing credential', () => {
    expect(classifyAgentOsFailure('No AgentOS credential in environment (OPENCODE_API_KEY)')).toBe('credential');
  });

  test('classifies model errors', () => {
    expect(classifyAgentOsFailure('CreditsError: insufficient credits')).toBe('model');
  });

  test('formatAgentOsUnavailable yields three distinct messages', () => {
    const host = formatAgentOsUnavailable('agentos-host did not become healthy within 90000ms', { hasCredential: true });
    const cred = formatAgentOsUnavailable('No AgentOS credential in environment', { hasCredential: false });
    const model = formatAgentOsUnavailable('session prompt failed: rate limited', { hasCredential: true });

    expect(host).toContain("WSL host didn't start");
    expect(cred).toContain('no API key set');
    expect(cred).toContain('OPENCODE_API_KEY');
    expect(model).toContain('model error');

    expect(host).not.toBe(cred);
    expect(cred).not.toBe(model);
    expect(host).not.toBe(model);
  });
});
