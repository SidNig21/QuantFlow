/**
 * V5 Hermes orchestrator — delegates across cabled worker tiles via tile relay dispatcher.
 */
import { sendTileDelegate } from './tile-relay-dispatcher';
import {
  appendRelayLog,
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

  const delegations: OrchestratorDelegationResult[] = [];

  for (let i = 0; i < input.workers.length; i++) {
    const worker = input.workers[i]!;
    const connectionId = input.connectionIds[i]!.trim();

    syncConnectionGraph([{
      id: connectionId,
      tileAId: orchestratorTileId,
      tileBId: worker.tileId,
    }]);

    const relay = await sendTileDelegate({
      fromTileId: orchestratorTileId,
      toTileId: worker.tileId,
      cableId: connectionId,
      text: goal,
    });

    if (relay.ok) {
      appendRelayLog({
        connectionId,
        fromTileId: orchestratorTileId,
        toTileId: worker.tileId,
        text: goal,
      });
      if (relay.reply) {
        appendRelayLog({
          connectionId,
          fromTileId: worker.tileId,
          toTileId: orchestratorTileId,
          text: relay.reply,
        });
      }
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
