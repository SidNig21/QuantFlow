import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { getCredential, hasCredential } from './credentials';

const KEYS = [
  'OPENROUTER_API_KEY',
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_API_KEY',
] as const;

describe('vault credentials accessor', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('returns trimmed env value', () => {
    process.env.OPENROUTER_API_KEY = '  test-key  ';
    expect(getCredential('OPENROUTER_API_KEY')).toBe('test-key');
  });

  test('returns undefined for empty or missing env', () => {
    expect(getCredential('OPENROUTER_API_KEY')).toBeUndefined();
    process.env.OPENROUTER_API_KEY = '   ';
    expect(getCredential('OPENROUTER_API_KEY')).toBeUndefined();
  });

  test('OPENCODE_ZEN_API_KEY resolves via OPENCODE_API_KEY alias', () => {
    process.env.OPENCODE_API_KEY = 'zen-key';
    expect(getCredential('OPENCODE_ZEN_API_KEY')).toBe('zen-key');
  });

  test('hasCredential mirrors getCredential', () => {
    expect(hasCredential('OPENROUTER_API_KEY')).toBe(false);
    process.env.OPENROUTER_API_KEY = 'k';
    expect(hasCredential('OPENROUTER_API_KEY')).toBe(true);
  });

  test('does not cache misses', () => {
    expect(getCredential('OPENROUTER_API_KEY')).toBeUndefined();
    process.env.OPENROUTER_API_KEY = 'late';
    expect(getCredential('OPENROUTER_API_KEY')).toBe('late');
  });
});
