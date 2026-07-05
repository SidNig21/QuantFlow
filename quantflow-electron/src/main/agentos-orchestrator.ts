/**
 * V5 Hermes orchestrator — recruits worker tiles, delegates via agentos-delegate toolkit (S5).
 */
import { postHostDelegateSend, sendConnectionRelay } from './agentos-a2a-relay';
import { getAgentOsTileAttach, prepareAgentOsTerminalAttach } from './agentos-terminal-bridge';
import {
  appendRelayLog,
  registerHostTileSession,
  syncConnectionGraph,
} from './tile-session-registry';
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
  reply?: string;
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
    instruction: `Hermes orchestrator (interim pi seat). Delegate via agentos-delegate on cabled workers. Goal: ${goal}`,
  });
  const orchAttach = getAgentOsTileAttach(orchestratorTileId);
  if (orchAttach?.sessionId) {
    await registerHostTileSession(orchestratorTileId, orchAttach.sessionId);
  }

  const delegations: OrchestratorDelegationResult[] = [];

  for (let i = 0; i < input.workers.length; i++) {
    const worker = input.workers[i]!;
    const connectionId = input.connectionIds[i]!.trim();
    await prepareAgentOsTerminalAttach({
      tileId: worker.tileId,
      software: worker.software ?? 'pi',
      instruction: worker.instruction ?? `Worker for: ${goal}`,
    });
    const workerAttach = getAgentOsTileAttach(worker.tileId);
    if (workerAttach?.sessionId) {
      await registerHostTileSession(worker.tileId, workerAttach.sessionId);
    }

    // Re-sync right before relay — renderer IPC may have cleared the graph during prepare.
    syncConnectionGraph([{
      id: connectionId,
      tileAId: orchestratorTileId,
      tileBId: worker.tileId,
    }]);

    let relay;
    if (process.env.QF_AGENTOS_SIM === '1') {
      relay = await sendConnectionRelay({
        connectionId,
        fromTileId: orchestratorTileId,
        text: goal,
      });
    } else {
      relay = await postHostDelegateSend({
        fromTileId: orchestratorTileId,
        connectionId,
        goal,
      });
    }
    if (relay.ok && relay.reply) {
      appendRelayLog({
        connectionId,
        fromTileId: orchestratorTileId,
        toTileId: worker.tileId,
        text: goal,
      });
      appendRelayLog({
        connectionId,
        fromTileId: worker.tileId,
        toTileId: orchestratorTileId,
        text: relay.reply,
      });
    }
    delegations.push({
      workerTileId: worker.tileId,
      connectionId,
      ok: relay.ok,
      message: relay.message,
      reply: relay.reply,
    });
  }

  return { ok: delegations.every((d) => d.ok), delegations };
}
