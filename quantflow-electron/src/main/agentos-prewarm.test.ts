import { describe, expect, test, beforeEach } from 'bun:test';

describe('agentos pre-warm hook', () => {
  beforeEach(async () => {
    delete process.env.QF_AGENTOS_SIM;
    delete process.env.QF_AGENTOS_LOOP_PROOF;
    delete process.env.QF_AGENTOS_PREWARM;
    const mod = await import('./agentos-service');
    mod.setAgentOsPrewarmDryRun(false);
    await mod.disposeAgentOsService();
  });

  test('prewarmAgentOsHost is opt-in via QF_AGENTOS_PREWARM=1', async () => {
    const mod = await import('./agentos-service');
    mod.setAgentOsPrewarmDryRun(true);
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    process.env.QF_AGENTOS_PREWARM = '1';
    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(true);

    await mod.disposeAgentOsService();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);
  });
});
