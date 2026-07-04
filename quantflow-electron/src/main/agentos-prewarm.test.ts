import { describe, expect, test, beforeEach } from 'bun:test';

describe('agentos pre-warm hook', () => {
  beforeEach(async () => {
    delete process.env.QF_AGENTOS_SIM;
    delete process.env.QF_AGENTOS_LOOP_PROOF;
    const mod = await import('./agentos-service');
    mod.setAgentOsPrewarmDryRun(false);
    await mod.disposeAgentOsService();
  });

  test('prewarmAgentOsHost sets invoked flag without starting host in dry-run', async () => {
    const mod = await import('./agentos-service');
    mod.setAgentOsPrewarmDryRun(true);
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    process.env.QF_AGENTOS_SIM = '1';
    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    delete process.env.QF_AGENTOS_SIM;
    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(true);

    await mod.disposeAgentOsService();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);
  });
});
