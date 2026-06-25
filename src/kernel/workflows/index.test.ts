import { describe, expect, test } from 'bun:test';

import { normalizeWorkflowStatus } from './index';

describe('normalizeWorkflowStatus', () => {
  test('maps legacy paused to suspended', () => {
    expect(normalizeWorkflowStatus('paused')).toBe('suspended');
  });

  test('passes through frozen enum values', () => {
    expect(normalizeWorkflowStatus('active')).toBe('active');
    expect(normalizeWorkflowStatus('suspended')).toBe('suspended');
    expect(normalizeWorkflowStatus('complete')).toBe('complete');
    expect(normalizeWorkflowStatus('archived')).toBe('archived');
  });
});
