/**
 * QuantFlow AgentOS host — WSL-only sidecar.
 * Exposes localhost HTTP + SSE matching src/harness/agentos/transport.ts.
 * Credentials read from inherited env at session create; never logged.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { AgentOs, toolKit, hostTool, nodeModulesMount } from "@rivet-dev/agentos-core";
import pi from "@agentos-software/pi";
import opencode from "@agentos-software/opencode";
import claudeCode from "@agentos-software/claude-code";
import { z } from "zod";

const HOST = process.env.AGENTOS_HOST_BIND ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.AGENTOS_HOST_PORT ?? "7430", 10);
const PERMISSION_TIMEOUT_MS = 120_000;

/** @type {import('@rivet-dev/agentos-core').AgentOs | null} */
let vm = null;
/** @type {Promise<import('@rivet-dev/agentos-core').AgentOs> | null} */
let vmInitPromise = null;

/** @type {Map<string, { subscribers: Set<import('node:http').ServerResponse>, software: string }>} */
const sessions = new Map();

/** @type {Map<string, { sessionId: string, unsub: () => void }>} */
const terminals = new Map();

/**
 * @type {Map<string, { sessionId: string, kind: 'toolkit' | 'acp', resolve: (approved: boolean) => void, timer: NodeJS.Timeout }>}
 */
const pendingPermissions = new Map();

/** @type {string | null} */
let activePromptSessionId = null;

/** @type {Map<string, string>} AgentOS sessionId → canvas tileId */
const sessionToTile = new Map();
/** @type {Map<string, string>} canvas tileId → AgentOS sessionId */
const tileToSession = new Map();
/** @type {Map<string, { tileAId: string, tileBId: string }>} synced from Electron Kernel cables */
const hostConnectionGraph = new Map();

function registerHostTileSession(tileId, sessionId) {
  const tile = String(tileId ?? "").trim();
  const session = String(sessionId ?? "").trim();
  if (!tile || !session) return;
  sessionToTile.set(session, tile);
  tileToSession.set(tile, session);
}

function syncHostConnectionGraph(connections) {
  hostConnectionGraph.clear();
  if (!Array.isArray(connections)) return;
  for (const conn of connections) {
    const id = String(conn?.id ?? "").trim();
    const tileAId = String(conn?.tileAId ?? "").trim();
    const tileBId = String(conn?.tileBId ?? "").trim();
    if (!id || !tileAId || !tileBId) continue;
    hostConnectionGraph.set(id, { tileAId, tileBId });
  }
}

function resolveSoftwareAndEnv() {
  const opencodeKey =
    (process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY ?? "").trim();
  if (opencodeKey) {
    // OpenCode Zen via pi's custom-provider mechanism. The `opencode` AgentOS
    // software cannot be used: its bundled ACP adapter hardcodes an Anthropic
    // catalog and ignores OPENCODE_CONFIG_CONTENT for provider selection
    // (verified 2026-07-03). Instead we register a `zen` provider in pi's
    // ~/.pi/agent/models.json inside the VM (written by piVmFiles below) and
    // pass only OPENCODE_API_KEY as session env.
    const model = (process.env.AGENTOS_MODEL ?? "big-pickle").trim();
    return {
      software: "pi",
      env: { OPENCODE_API_KEY: opencodeKey },
      piVmFiles: buildZenPiFiles(model),
    };
  }
  const openrouterKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (openrouterKey) {
    return {
      software: "pi",
      env: {
        OPENROUTER_API_KEY: openrouterKey,
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_API_KEY: openrouterKey,
      },
    };
  }
  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropicKey) {
    return { software: "pi", env: { ANTHROPIC_API_KEY: anthropicKey } };
  }
  throw new Error(
    "No AgentOS credential in environment (OPENCODE_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY)",
  );
}

/** Error whose message is safe to return to the client as a 400. */
class SessionConfigError extends Error {}

/**
 * S3 — honor the software requested by the role/tile instead of forcing the
 * credential-order default onto every session. Named tiles get their real
 * identities; unavailable software is rejected EXPLICITLY (never silently pi).
 */
function resolveSessionConfig(requested) {
  const software = (requested ?? "").trim();
  if (!software || software === "pi") {
    return resolveSoftwareAndEnv();
  }
  if (software === "claude" || software === "claude-code") {
    // First choice: the founder's own Claude subscription. `claude setup-token`
    // mints a long-lived OAuth token the CLI accepts headlessly — no API key,
    // no third-party billing.
    const oauthToken = (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim();
    if (oauthToken) {
      return { software: "claude", env: { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } };
    }
    const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (anthropicKey) {
      return { software: "claude", env: { ANTHROPIC_API_KEY: anthropicKey } };
    }
    const zenKey =
      (process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY ?? "").trim();
    if (zenKey) {
      // OpenCode Zen speaks the Anthropic protocol at /zen/v1/messages
      // (probed 2026-07-04: well-formed anthropic error envelope; the only
      // barrier was workspace credits). claude CLI appends /v1/messages.
      return {
        software: "claude",
        env: { ANTHROPIC_API_KEY: zenKey, ANTHROPIC_BASE_URL: "https://opencode.ai/zen" },
      };
    }
    throw new SessionConfigError(
      "claude session needs ANTHROPIC_API_KEY or OPENCODE_API_KEY in the host env",
    );
  }
  if (software === "codex") {
    // A real codex agent exists upstream (repo main: examples/codex — codex is
    // a first-class createSession agent), but the pinned @agentos-software/codex
    // @0.3.1 is a stub (no agent block, verified 2026-07-04). Real seat is blocked
    // on a codex-agent version compatible with core 0.2.4 (T009). NEVER fall back
    // to pi — that impostor path is banned (roster policy 2026-07-05).
    throw new SessionConfigError(
      "codex agent not yet available: pinned @agentos-software/codex@0.3.1 is a stub; " +
        "needs a core-0.2.4-compatible codex-agent pin (T009). No pi fallback.",
    );
  }
  if (software === "opencode") {
    // Known upstream bug: bundled ACP adapter hardcodes an Anthropic catalog
    // and ignores provider config (verified 2026-07-03). Explicit rejection
    // beats a silently broken actor; role stays on herdr-wsl.
    throw new SessionConfigError(
      "opencode software adapter cannot route providers at 0.2.x — role stays on herdr-wsl",
    );
  }
  throw new SessionConfigError(`unknown software '${software}'`);
}

/**
 * BOOLEAN ONLY — /health credential report. Mirrors resolveSoftwareAndEnv's
 * order (OPENCODE_API_KEY/OPENCODE_ZEN_API_KEY → OPENROUTER_API_KEY →
 * ANTHROPIC_API_KEY) but never exposes which name matched, any value, or any
 * length. The Windows side is blind to WSL ~/.profile keys; this is its only
 * window, and it must stay a single boolean.
 */
function hostHasCredential() {
  return Boolean(
    (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim()
    || (process.env.OPENCODE_API_KEY ?? "").trim()
    || (process.env.OPENCODE_ZEN_API_KEY ?? "").trim()
    || (process.env.OPENROUTER_API_KEY ?? "").trim()
    || (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  );
}

/** pi config files written into the VM for the OpenCode Zen provider. */
function buildZenPiFiles(model) {
  const modelsJson = JSON.stringify({
    providers: {
      zen: {
        baseUrl: "https://opencode.ai/zen/v1",
        apiKey: "OPENCODE_API_KEY",
        api: "openai-completions",
        models: [
          { id: model, name: `OpenCode Zen ${model}`, contextWindow: 128000, maxTokens: 8192 },
        ],
      },
    },
  });
  const settingsJson = JSON.stringify({ defaultProvider: "zen", defaultModel: model });
  const files = [];
  for (const home of ["/root", "/home/agentos"]) {
    files.push({ path: `${home}/.pi/agent/models.json`, content: modelsJson });
    files.push({ path: `${home}/.pi/agent/settings.json`, content: settingsJson });
  }
  return files;
}

async function ensureVm() {
  if (vm) return vm;
  if (!vmInitPromise) {
    vmInitPromise = AgentOs.create({
      software: [pi, opencode, claudeCode],
      toolKits: [buildQuantflowKit(), buildCableKit(), buildDelegateKit()],
      // claude-code's ACP adapter resolves its package through /root/node_modules;
      // mount the host's own node_modules read-only (S3 compat-gate finding).
      mounts: [nodeModulesMount(new URL("./node_modules", import.meta.url).pathname)],
    }).then((instance) => {
      vm = instance;
      return instance;
    });
  }
  return vmInitPromise;
}

/**
 * S4 — agent-callable A2A: canvas cable = permission to message the peer tile.
 * Validates against the synced Kernel connection graph; never writes cables.
 */
async function executeCableSend({ connectionId, fromTileId, text, fromSessionId }) {
  const connId = String(connectionId ?? "").trim();
  const msg = String(text ?? "").trim();
  let from = String(fromTileId ?? "").trim();
  if (!from && fromSessionId) {
    from = sessionToTile.get(fromSessionId) ?? "";
  }
  if (!connId) throw new Error("connectionId required");
  if (!from) throw new Error("fromTileId required (session has no tile binding)");
  if (!msg) throw new Error("text required");

  const conn = hostConnectionGraph.get(connId);
  if (!conn) throw new Error(`no canvas cable: ${connId}`);
  if (from !== conn.tileAId && from !== conn.tileBId) {
    throw new Error("fromTileId is not on this connection");
  }
  const targetTileId = from === conn.tileAId ? conn.tileBId : conn.tileAId;
  const targetSessionId = tileToSession.get(targetTileId);
  if (!targetSessionId) {
    throw new Error(`target tile has no AgentOS session: ${targetTileId}`);
  }

  const instance = await ensureVm();
  const delegated = `[a2a ${from}→${targetTileId}] ${msg}`;
  let targetResult;
  try {
    targetResult = await instance.prompt(targetSessionId, delegated);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }

  let replyPayload =
    typeof targetResult?.text === "string" && targetResult.text.trim()
      ? targetResult.text.trim()
      : "";
  if (process.env.QF_AGENTOS_SIM === "1") {
    replyPayload = `ack: ${msg.slice(0, 120)}`;
  } else if (!replyPayload) {
    replyPayload = "(no reply text)";
  }

  const sourceSessionId = fromSessionId ?? tileToSession.get(from);
  if (sourceSessionId) {
    const back = `[a2a ${targetTileId}→${from}] ${replyPayload}`;
    try {
      await instance.prompt(sourceSessionId, back);
    } catch {
      // Reply is still returned to the toolkit caller.
    }
  }

  return { ok: true, targetTileId, reply: replyPayload };
}

async function executeDelegateSend({ fromTileId, connectionId, goal }) {
  const tileId = String(fromTileId ?? "").trim();
  const fromSessionId = tileToSession.get(tileId);
  if (!fromSessionId) {
    throw new Error(`no AgentOS session for orchestrator tile ${tileId}`);
  }
  const prev = activePromptSessionId;
  activePromptSessionId = fromSessionId;
  try {
    return await executeCableSend({
      connectionId,
      fromTileId: tileId,
      text: goal,
      fromSessionId,
    });
  } finally {
    activePromptSessionId = prev;
  }
}

function buildCableKit() {
  return toolKit({
    name: "cable",
    description: "Send a message to an agent on the other end of a canvas cable.",
    tools: {
      send: hostTool({
        description:
          "Send text to the cabled peer. Requires an existing canvas cable (connection id).",
        inputSchema: z.object({
          connectionId: z.string(),
          text: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS * 2,
        execute: async ({ connectionId, text }) => {
          const fromSessionId = activePromptSessionId;
          if (!fromSessionId) {
            throw new Error("agentos-cable send outside active session prompt");
          }
          return executeCableSend({
            connectionId,
            fromTileId: null,
            text,
            fromSessionId,
          });
        },
      }),
    },
  });
}

/** S5 — Hermes orchestrator seat delegates via the same cable bridge. */
function buildDelegateKit() {
  return toolKit({
    name: "delegate",
    description: "Delegate work to a cabled legend actor tile.",
    tools: {
      send: hostTool({
        description: "Delegate a goal to the worker on the other end of a canvas cable.",
        inputSchema: z.object({
          connectionId: z.string(),
          goal: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS * 2,
        execute: async ({ connectionId, goal }) => {
          const fromSessionId = activePromptSessionId;
          if (!fromSessionId) {
            throw new Error("agentos-delegate send outside active session prompt");
          }
          return executeCableSend({
            connectionId,
            fromTileId: null,
            text: goal,
            fromSessionId,
          });
        },
      }),
    },
  });
}

function buildQuantflowKit() {
  return toolKit({
    name: "quantflow",
    description: "QuantFlow kernel bridge — receipt emit and operator approval.",
    tools: {
      "receipt-emit": hostTool({
        description: "Record a receipt milestone in the QuantFlow kernel.",
        inputSchema: z.object({
          kind: z.string(),
          detail: z.string(),
        }),
        execute: ({ kind, detail }) => ({ ok: true, kind, detail }),
      }),
      "approval-request": hostTool({
        description: "Ask the operator for approval before a sensitive action. Blocks until answered.",
        inputSchema: z.object({
          action: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS,
        execute: async ({ action }) => {
          const sessionId = activePromptSessionId;
          if (!sessionId) {
            throw new Error("approval-request outside active session prompt");
          }
          const requestId = randomUUID();
          emitPermissionRequest(sessionId, {
            requestId,
            action,
            source: "toolkit",
          });
          const approved = await waitForPermission(sessionId, requestId, "toolkit");
          return { approved, action };
        },
      }),
    },
  });
}

function waitForPermission(sessionId, requestId, kind) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPermissions.delete(requestId);
      reject(new Error(`permission timeout: ${requestId}`));
    }, PERMISSION_TIMEOUT_MS);
    pendingPermissions.set(requestId, { sessionId, kind, resolve, timer });
  });
}

async function fulfillPermission(sessionId, requestId, approved) {
  const entry = pendingPermissions.get(requestId);
  if (!entry || entry.sessionId !== sessionId) {
    return false;
  }
  clearTimeout(entry.timer);
  pendingPermissions.delete(requestId);
  if (entry.kind === "acp" && vm) {
    await vm.respondPermission(sessionId, requestId, approved ? "once" : "reject");
  }
  entry.resolve(approved);
  return true;
}

function emitSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSession(sessionId, payload) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const res of session.subscribers) {
    try {
      emitSse(res, payload);
    } catch {
      session.subscribers.delete(res);
    }
  }
}

function emitPermissionRequest(sessionId, request) {
  broadcastSession(sessionId, {
    kind: "permission-request",
    requestId: request.requestId,
    action: request.action,
    source: request.source ?? "acp",
    toolCallId: request.toolCallId ?? null,
    raw: request.raw ?? null,
  });
}

function wireSessionHandlers(instance, sessionId) {
  instance.onSessionEvent(sessionId, (event) => {
    broadcastSession(sessionId, { kind: "session-event", event });
  });

  instance.onPermissionRequest(sessionId, (request) => {
    const requestId = request.permissionId;
    emitPermissionRequest(sessionId, {
      requestId,
      action: request.description ?? "acp permission",
      source: "acp",
      raw: request,
    });
    waitForPermission(sessionId, requestId, "acp").catch(() => {
      if (vm) {
        vm.respondPermission(sessionId, requestId, "reject").catch(() => {});
      }
    });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/health") {
      // No credential required to answer; hasCredential is a boolean only.
      sendJson(res, 200, { ok: true, hasCredential: hostHasCredential() });
      return;
    }

    if (req.method === "POST" && path === "/dispose") {
      if (vm) {
        await vm.dispose();
        vm = null;
        vmInitPromise = null;
      }
      sessions.clear();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && path === "/file") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        sendJson(res, 400, { error: "path query required" });
        return;
      }
      const instance = await ensureVm();
      const raw = await instance.readFile(filePath);
      const buf = Buffer.from(raw);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": buf.length,
      });
      res.end(buf);
      return;
    }

    if (req.method === "POST" && path === "/connections/sync") {
      const body = await readJsonBody(req);
      syncHostConnectionGraph(body?.connections);
      sendJson(res, 200, { ok: true, count: hostConnectionGraph.size });
      return;
    }

    if (req.method === "POST" && path === "/tile-registry") {
      const body = await readJsonBody(req);
      const tileId = typeof body?.tileId === "string" ? body.tileId : "";
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      if (!tileId.trim() || !sessionId.trim()) {
        sendJson(res, 400, { error: "tileId and sessionId required" });
        return;
      }
      registerHostTileSession(tileId, sessionId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/cable/send") {
      const body = await readJsonBody(req);
      try {
        const result = await executeCableSend({
          connectionId: body?.connectionId,
          fromTileId: body?.fromTileId,
          text: body?.text,
          fromSessionId: null,
        });
        sendJson(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { ok: false, message });
      }
      return;
    }

    if (req.method === "POST" && path === "/delegate/send") {
      const body = await readJsonBody(req);
      try {
        const result = await executeDelegateSend({
          fromTileId: body?.fromTileId,
          connectionId: body?.connectionId,
          goal: body?.goal ?? body?.text,
        });
        sendJson(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { ok: false, message });
      }
      return;
    }

    if (req.method === "POST" && path === "/session") {
      const body = await readJsonBody(req);
      let picked;
      try {
        picked = resolveSessionConfig(body?.software);
      } catch (err) {
        if (err instanceof SessionConfigError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        throw err;
      }
      const instance = await ensureVm();
      if (picked.piVmFiles) {
        for (const file of picked.piVmFiles) {
          try {
            await instance.writeFile(file.path, file.content);
          } catch {
            // Best-effort pi config seeding.
          }
        }
      }
      const { sessionId } = await instance.createSession(picked.software, {
        env: picked.env,
      });
      sessions.set(sessionId, { subscribers: new Set(), software: picked.software });
      wireSessionHandlers(instance, sessionId);
      const tileId = typeof body?.tileId === "string" ? body.tileId.trim() : "";
      if (tileId) registerHostTileSession(tileId, sessionId);
      sendJson(res, 200, { sessionId, software: picked.software });
      return;
    }

    const sessionMatch = path.match(/^\/session\/([^/]+)\/(prompt|permission|events|terminal)$/);
    const terminalOpenMatch = path.match(/^\/session\/([^/]+)\/terminal\/open$/);
    const terminalShellMatch = path.match(/^\/session\/([^/]+)\/terminal\/([^/]+)\/(write|resize|close)$/);
    if (terminalShellMatch) {
      const sessionId = decodeURIComponent(terminalShellMatch[1]);
      const shellId = decodeURIComponent(terminalShellMatch[2]);
      const action = terminalShellMatch[3];
      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const instance = await ensureVm();
      if (action === "write" && req.method === "POST") {
        const body = await readJsonBody(req);
        const data = typeof body.data === "string" ? body.data : "";
        instance.writeShell(shellId, data);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === "resize" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cols = Number.parseInt(String(body.cols ?? "80"), 10);
        const rows = Number.parseInt(String(body.rows ?? "24"), 10);
        instance.resizeShell(shellId, cols, rows);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === "close" && req.method === "POST") {
        const entry = terminals.get(shellId);
        entry?.unsub?.();
        terminals.delete(shellId);
        instance.closeShell(shellId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (terminalOpenMatch && req.method === "POST") {
      const sessionId = decodeURIComponent(terminalOpenMatch[1]);
      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const body = await readJsonBody(req);
      const cols = Number.parseInt(String(body.cols ?? "80"), 10);
      const rows = Number.parseInt(String(body.rows ?? "24"), 10);
      const instance = await ensureVm();
      const { shellId } = instance.openShell({ cols, rows });
      const unsub = instance.onShellData(shellId, (chunk) => {
        broadcastSession(sessionId, {
          kind: "terminal-data",
          shellId,
          data: Buffer.from(chunk).toString("base64"),
        });
      });
      terminals.set(shellId, { sessionId, unsub });
      sendJson(res, 200, { shellId });
      return;
    }

    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const action = sessionMatch[2];

      if (!sessions.has(sessionId) && action !== "terminal") {
        sendJson(res, 404, { error: "session not found" });
        return;
      }

      if (action === "terminal" && req.method === "POST") {
        if (!sessions.has(sessionId)) {
          sendJson(res, 404, { error: "session not found" });
          return;
        }
        const body = await readJsonBody(req);
        const cols = Number.parseInt(String(body.cols ?? "80"), 10);
        const rows = Number.parseInt(String(body.rows ?? "24"), 10);
        const instance = await ensureVm();
        const { shellId } = instance.openShell({ cols, rows });
        const unsub = instance.onShellData(shellId, (chunk) => {
          broadcastSession(sessionId, {
            kind: "terminal-data",
            shellId,
            data: Buffer.from(chunk).toString("base64"),
          });
        });
        terminals.set(shellId, { sessionId, unsub });
        sendJson(res, 200, { shellId });
        return;
      }

      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }

      if (action === "events" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        const session = sessions.get(sessionId);
        session.subscribers.add(res);
        req.on("close", () => {
          session.subscribers.delete(res);
        });
        return;
      }

      if (action === "prompt" && req.method === "POST") {
        const body = await readJsonBody(req);
        const text = typeof body.text === "string" ? body.text : "";
        const instance = await ensureVm();
        activePromptSessionId = sessionId;
        try {
          const result = await instance.prompt(sessionId, text);
          sendJson(res, 200, {
            ok: true,
            text: result?.text ?? "",
            response: result?.response ?? null,
          });
        } finally {
          activePromptSessionId = null;
        }
        return;
      }

      if (action === "permission" && req.method === "POST") {
        const body = await readJsonBody(req);
        const requestId = typeof body.requestId === "string" ? body.requestId : "";
        const approved = body.approved === true;
        if (!requestId) {
          sendJson(res, 400, { error: "requestId required" });
          return;
        }
        const ok = await fulfillPermission(sessionId, requestId, approved);
        sendJson(res, ok ? 200 : 404, { ok });
        return;
      }
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`agentos-host listening on http://${HOST}:${PORT}`);
});
