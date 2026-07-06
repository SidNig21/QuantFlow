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

  test('prewarmAgentOsHost is on by default; QF_AGENTOS_PREWARM=0 disables', async () => {
    const mod = await import('./agentos-service');
    mod.setAgentOsPrewarmDryRun(true);
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(true);

    await mod.disposeAgentOsService();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    mod.setAgentOsPrewarmDryRun(true);
    process.env.QF_AGENTOS_PREWARM = '0';
    mod.prewarmAgentOsHost();
    expect(mod.wasAgentOsPrewarmInvoked()).toBe(false);

    await mod.disposeAgentOsService();
  });
});
