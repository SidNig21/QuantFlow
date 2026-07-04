/**
 * V5 minimal Hermes orchestrator — spawns worker terminal attaches and delegates via A2A relay.
 */
import { sendConnectionRelay } from './agentos-a2a-relay';
import { prepareAgentOsTerminalAttach } from './agentos-terminal-bridge';
import type { AgentOsSoftware } from './role-service';

export interface OrchestratorWorkerSpec {
  tileId: string;
  software?: AgentOsSoftware;
  instruction?: string;
}

export interface OrchestratorRunInput {
  orchestratorTileId: string;
  goal: string;
  workers: OrchestratorWorkerSpec[];
  /** connectionIds[i] links orchestratorTileId to workers[i].tileId */
  connectionIds: string[];
}

export interface OrchestratorDelegationResult {
  workerTileId: string;
  connectionId: string;
  ok: boolean;
  message?: string;
}

export interface OrchestratorRunResult {
  ok: boolean;
  delegations: OrchestratorDelegationResult[];
}

export async function runHermesOrchestrator(input: OrchestratorRunInput): Promise<OrchestratorRunResult> {
  const orchestratorTileId = input.orchestratorTileId.trim();
  const goal = input.goal.trim();
  if (!orchestratorTileId) {
    return { ok: false, delegations: [{ workerTileId: '', connectionId: '', ok: false, message: 'orchestratorTileId required' }] };
  }
  if (!goal) {
    return { ok: false, delegations: [{ workerTileId: '', connectionId: '', ok: false, message: 'goal required' }] };
  }
  if (input.workers.length === 0) {
    return { ok: false, delegations: [{ workerTileId: '', connectionId: '', ok: false, message: 'workers required' }] };
  }
  if (input.connectionIds.length !== input.workers.length) {
    return {
      ok: false,
      delegations: [{ workerTileId: '', connectionId: '', ok: false, message: 'connectionIds length must match workers' }],
    };
  }

  await prepareAgentOsTerminalAttach({
    tileId: orchestratorTileId,
    software: 'pi',
    instruction: `Orchestrator goal: ${goal}`,
  });

  const delegations: OrchestratorDelegationResult[] = [];
  for (let i = 0; i < input.workers.length; i++) {
    const worker = input.workers[i]!;
    const connectionId = input.connectionIds[i]!.trim();
    await prepareAgentOsTerminalAttach({
      tileId: worker.tileId,
      software: worker.software ?? 'pi',
      instruction: worker.instruction ?? `Worker for: ${goal}`,
    });

    const relay = await sendConnectionRelay({
      connectionId,
      fromTileId: orchestratorTileId,
      text: goal,
    });
    delegations.push({
      workerTileId: worker.tileId,
      connectionId,
      ok: relay.ok,
      message: relay.message,
    });
  }

  return { ok: delegations.every((d) => d.ok), delegations };
}
