/**
 * AgentOS harness service — lazy singleton for Electron main (P6 chunk A).
 *
 * Does not start the WSL host at app boot; host lifecycle begins on first
 * transport use (send/spawn path). Connection failures surface as
 * `agentos unavailable: …` without blocking app startup.
 */
import { createAgentOsHarness } from "@qf-harness/agentos/index";
import { createHttpAgentOsTransport } from "@qf-harness/agentos/http-transport";
import {
  createSimTransport,
  simStepsFromFixtureEvents,
} from "@qf-harness/agentos/sim-transport";
import agentosFixtureRaw from "../../../src/harness/agentos/fixtures/tier2-events-trimmed.jsonl?raw";
import {
  startAgentOsHost,
  stopAgentOsHost,
  type AgentOsHostHandle,
} from "@qf-harness/agentos/host-lifecycle";
import { resolveAgentOsCredential } from "@qf-harness/agentos/credential-order";
import type { AgentOsTransport } from "@qf-harness/agentos/transport";
import type {
  SpawnWorkerInput,
  WorkerHandle,
  WorkerHarness,
  WorkerMessage,
} from "@qf-harness/types";
import { QUANTFLOW_DIR } from "./paths";
import {
  createProductionApprovalGate,
  setActiveAgentOsContext,
  type AgentOsApprovalContext,
} from "./agentos-approval";

let harnessSingleton: WorkerHarness | null = null;
let hostHandle: AgentOsHostHandle | null = null;
let hostStartPromise: Promise<AgentOsHostHandle> | null = null;

function formatUnavailable(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/^agentos unavailable:/i.test(detail) || /^agentos-harness unavailable:/i.test(detail)) {
    return detail.replace(/^agentos-harness unavailable:/i, "agentos unavailable:");
  }
  return `agentos unavailable: ${detail}`;
}

async function ensureHostStarted(): Promise<AgentOsHostHandle> {
  if (hostHandle) return hostHandle;
  if (!hostStartPromise) {
    hostStartPromise = startAgentOsHost()
      .then((handle) => {
        hostHandle = handle;
        return handle;
      })
      .catch((error) => {
        hostStartPromise = null;
        throw new Error(formatUnavailable(error));
      });
  }
  return hostStartPromise;
}

function wrapTransportWithLazyHost(base: AgentOsTransport): AgentOsTransport {
  async function withHost<T>(operation: () => Promise<T>, startHost: boolean): Promise<T> {
    if (startHost) await ensureHostStarted();
    try {
      return await operation();
    } catch (error) {
      throw new Error(formatUnavailable(error));
    }
  }

  return {
    createSession(software, options) {
      return withHost(() => base.createSession(software, options), true);
    },
    prompt(sessionId, text) {
      return withHost(() => base.prompt(sessionId, text), true);
    },
    onSessionEvent(sessionId, handler) {
      return base.onSessionEvent(sessionId, handler);
    },
    onPermissionRequest(sessionId, handler) {
      return base.onPermissionRequest(sessionId, handler);
    },
    respondPermission(sessionId, requestId, approved) {
      return withHost(() => base.respondPermission(sessionId, requestId, approved), false);
    },
    readFile(path) {
      return withHost(() => base.readFile(path), false);
    },
    dispose() {
      return withHost(() => base.dispose(), false);
    },
    health() {
      return base.health();
    },
  };
}

function contextFromHandle(
  handle: WorkerHandle,
  message?: WorkerMessage,
): AgentOsApprovalContext {
  return {
    tileId: handle.tileId ?? null,
    workflowId: message?.workflowId ?? null,
    taskId: message?.taskId ?? null,
    workerId: handle.workerId ?? null,
  };
}

function wrapHarness(base: WorkerHarness): WorkerHarness {
  return {
    kind: base.kind,

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      try {
        const handle = await base.spawn(input);
        setActiveAgentOsContext({
          tileId: handle.tileId ?? input.tileId ?? null,
          workflowId: input.workflowId ?? null,
          taskId: null,
          workerId: handle.workerId ?? null,
        });
        return handle;
      } catch (error) {
        throw new Error(formatUnavailable(error));
      }
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      setActiveAgentOsContext(contextFromHandle(handle, message));
      try {
        await base.send(handle, message);
      } catch (error) {
        throw new Error(formatUnavailable(error));
      }
    },

    async readState(handle: WorkerHandle) {
      try {
        return await base.readState(handle);
      } catch (error) {
        throw new Error(formatUnavailable(error));
      }
    },

    async collectReceipts(handle: WorkerHandle) {
      try {
        return await base.collectReceipts(handle);
      } catch (error) {
        throw new Error(formatUnavailable(error));
      }
    },

    async stop(handle: WorkerHandle): Promise<void> {
      try {
        await base.stop(handle);
      } catch (error) {
        throw new Error(formatUnavailable(error));
      } finally {
        setActiveAgentOsContext(null);
      }
    },
  };
}

function loadSimFixtureEvents(): unknown[] {
  return agentosFixtureRaw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

/** Proof-only (QF_AGENTOS_SIM=1): deterministic sim transport, no WSL/network. */
function buildProofSimTransport(): AgentOsTransport {
  const events = loadSimFixtureEvents();
  return createSimTransport({
    steps: simStepsFromFixtureEvents(events, {
      permissionAtIndex: 5,
      permission: {
        requestId: "perm-loop-proof-1",
        action: "write tier2 result file",
        source: "acp",
      },
      artifactPath: "/workspace/tier2-result.txt",
      artifactBody: "bindings-approved-hello",
    }),
  });
}

function buildHarness(): WorkerHarness {
  // Proof-only seam — production path unchanged when QF_AGENTOS_SIM is unset.
  const transport = process.env.QF_AGENTOS_SIM === "1"
    ? buildProofSimTransport()
    : wrapTransportWithLazyHost(createHttpAgentOsTransport());
  const credential = resolveAgentOsCredential();
  const base = createAgentOsHarness({
    transport,
    approvalGate: createProductionApprovalGate(),
    workspace: QUANTFLOW_DIR,
    software: credential?.software ?? "pi",
  });
  return wrapHarness(base);
}

/** Lazy singleton — host is not started until the first transport operation. */
export function getAgentOsWorkerHarness(): WorkerHarness {
  if (!harnessSingleton) {
    harnessSingleton = buildHarness();
  }
  return harnessSingleton;
}

/** Stop WSL host and reset singleton; safe when never started. */
export async function disposeAgentOsService(): Promise<void> {
  harnessSingleton = null;
  setActiveAgentOsContext(null);
  if (hostHandle) {
    try {
      await stopAgentOsHost(hostHandle);
    } catch {
      // Host may already be gone.
    }
    hostHandle = null;
  }
  hostStartPromise = null;
}
