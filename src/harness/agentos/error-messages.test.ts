import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  classifyAgentOsFailure,
  formatAgentOsUnavailable,
} from './error-messages';
import { recordHostCredentialReport } from './credential-order';

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

describe('no-API-key message defers to the host credential report (S2)', () => {
  const CREDENTIAL_ENVS = [
    'OPENCODE_API_KEY',
    'OPENCODE_ZEN_API_KEY',
    'OPENROUTER_API_KEY',
    'ANTHROPIC_API_KEY',
  ] as const;
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {};
    for (const name of CREDENTIAL_ENVS) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    recordHostCredentialReport(null);
  });

  afterEach(() => {
    for (const name of CREDENTIAL_ENVS) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    recordHostCredentialReport(null);
  });

  test('windows env empty + host reports true → host error stays a host error', () => {
    recordHostCredentialReport(true);
    const msg = formatAgentOsUnavailable('agentos-host did not become healthy within 90000ms');
    expect(msg).toContain("WSL host didn't start");
    expect(msg).not.toContain('no API key set');
  });

  test('windows env empty + host reports true → model error stays a model error', () => {
    recordHostCredentialReport(true);
    const msg = formatAgentOsUnavailable('prompt failed: CreditsError');
    expect(msg).toContain('model error');
    expect(msg).not.toContain('no API key set');
  });

  test('no API key fires only when BOTH windows env and host report say absent', () => {
    recordHostCredentialReport(false);
    const msg = formatAgentOsUnavailable('prompt failed: something opaque');
    expect(msg).toContain('no API key set');
    expect(msg).toContain('OPENCODE_API_KEY');
    expect(msg).toContain('WSL');
  });

  test('windows env set + host reports false → not the no-API-key message', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    recordHostCredentialReport(false);
    const msg = formatAgentOsUnavailable('prompt failed: something opaque');
    expect(msg).toContain('model error');
  });

  test('host unreachable (no report) keeps pre-S2 windows-only behavior', () => {
    const msg = formatAgentOsUnavailable('prompt failed: something opaque');
    expect(msg).toContain('no API key set');
  });

  test('host-classified credential error still names the WSL fix', () => {
    recordHostCredentialReport(true);
    const msg = formatAgentOsUnavailable('No AgentOS credential in environment (OPENCODE_API_KEY)');
    expect(msg).toContain('no API key set');
    expect(msg).toContain('OPENCODE_API_KEY');
  });
});
