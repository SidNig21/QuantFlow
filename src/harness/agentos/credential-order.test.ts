import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  getHostCredentialReport,
  hasAgentOsCredential,
  hasWindowsAgentOsCredential,
  recordHostCredentialReport,
  resolveAgentOsCredential,
} from './credential-order';

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

describe('agentos credential union (windows env × host report)', () => {
  test('windows set + host reports true → present', () => {
    process.env.OPENCODE_API_KEY = 'k';
    recordHostCredentialReport(true);
    expect(hasAgentOsCredential()).toBe(true);
  });

  test('windows set + host reports false → present (windows keys still count)', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    recordHostCredentialReport(false);
    expect(hasAgentOsCredential()).toBe(true);
  });

  test('windows set + host unreachable → present (pre-S2 behavior)', () => {
    process.env.OPENROUTER_API_KEY = 'k';
    recordHostCredentialReport(null);
    expect(hasAgentOsCredential()).toBe(true);
  });

  test('windows unset + host reports true → present (the WSL ~/.profile case)', () => {
    recordHostCredentialReport(true);
    expect(hasWindowsAgentOsCredential()).toBe(false);
    expect(hasAgentOsCredential()).toBe(true);
  });

  test('windows unset + host reports false → absent', () => {
    recordHostCredentialReport(false);
    expect(hasAgentOsCredential()).toBe(false);
  });

  test('windows unset + host unreachable → absent (pre-S2 behavior)', () => {
    recordHostCredentialReport(null);
    expect(hasAgentOsCredential()).toBe(false);
  });

  test('non-boolean report is treated as unknown', () => {
    recordHostCredentialReport(undefined);
    expect(getHostCredentialReport()).toBeNull();
    expect(hasAgentOsCredential()).toBe(false);
  });

  test('report cache round-trips booleans', () => {
    recordHostCredentialReport(true);
    expect(getHostCredentialReport()).toBe(true);
    recordHostCredentialReport(false);
    expect(getHostCredentialReport()).toBe(false);
  });

  test('resolveAgentOsCredential stays windows-env-only (software choice)', () => {
    recordHostCredentialReport(true);
    expect(resolveAgentOsCredential()).toBeNull();
    process.env.OPENCODE_API_KEY = 'k';
    expect(resolveAgentOsCredential()).toEqual({
      software: 'pi',
      credentialName: 'OPENCODE_API_KEY',
    });
  });
});
