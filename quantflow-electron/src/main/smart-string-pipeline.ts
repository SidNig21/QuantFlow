import { listConnections } from "./runtime-state/connections-repo";
import { appendEvent } from "./runtime-state/events-repo";
import { terminalPtyDeliver } from "./string-adapters/terminal-adapter";
import { agentTileDeliver } from "./string-adapters/agent-adapter";
import { runtimeEventDeliver } from "./string-adapters/runtime-event-adapter";
import { envoyStubDeliver } from "./string-adapters/envoy-stub-adapter";
import type { SmartStringConfig, SmartStringMatchRule, SmartStringTransform, ConnectionConfig } from "./runtime-state/types";
import type { AdapterContext, DeliveryRequest, AdapterResult } from "./string-adapters/types";
import type { RelayConnectionRequest, RelayResult } from "./string-relay";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PipelineSourceContext {
  tileId: string;
  sessionId: string;
}

export interface PipelineDeps {
  getSessionForTile: (tileId: string) => string | null;
  relayFn: (req: RelayConnectionRequest) => RelayResult;
}

// ─── Match ────────────────────────────────────────────────────────────────────

export function matchLine(line: string, rule: SmartStringMatchRule): boolean {
  if (rule.type === "contains") {
    return line.includes(rule.pattern);
  }
  if (rule.type === "regex") {
    try {
      return new RegExp(rule.pattern).test(line);
    } catch {
      return false;
    }
  }
  return false;
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformLine(line: string, transform: SmartStringTransform): string {
  if (transform.type === "passthrough") return line;
  if (transform.type === "structured-message") {
    const template = transform.template ?? "{text}";
    return template.replace("{text}", line);
  }
  return line;
}

// ─── Deliver ──────────────────────────────────────────────────────────────────

function deliver(
  text: string,
  connectionId: string,
  sourceTileId: string,
  targetTileId: string | null,
  config: SmartStringConfig,
  deps: PipelineDeps,
): AdapterResult {
  const ctx: AdapterContext = {
    connectionId,
    tileId: sourceTileId,
  };
  const req: DeliveryRequest = { text, config, ctx, targetTileId: targetTileId ?? undefined };

  const targetAdapter = config.target_adapter;

  if (targetAdapter === "terminal-pty") {
    const sessionId = targetTileId ? deps.getSessionForTile(targetTileId) : null;
    const reqWithSession: DeliveryRequest = {
      ...req,
      targetTileId: targetTileId ?? undefined,
      config: {
        ...config,
        metadata: { ...(config.metadata ?? {}), sessionId: sessionId ?? "" },
      },
    };
    return terminalPtyDeliver(reqWithSession);
  }

  if (targetAdapter === "agent-tile") {
    return agentTileDeliver(req, ({ connectionId: cId, fromTileId, text: t }) => {
      const result = deps.relayFn({ connectionId: cId, fromTileId, text: t });
      return { ok: result.ok, message: result.message, eventId: result.eventId };
    });
  }

  if (targetAdapter === "envoy-shared-space") {
    return envoyStubDeliver(req);
  }

  // Default: runtime-event (also covers "runtime-event" and "mcp-send" which logs too)
  return runtimeEventDeliver(req);
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function runSmartStringPipeline(
  ctx: PipelineSourceContext,
  line: string,
  deps: PipelineDeps,
): void {
  // Find connections where this tile is the source
  const connections = listConnections({ tileId: ctx.tileId });

  for (const conn of connections) {
    let config: SmartStringConfig | undefined;
    try {
      const parsed = JSON.parse(conn.config || "{}") as ConnectionConfig;
      config = parsed.smartString;
    } catch {
      continue;
    }

    if (!config || !config.enabled) continue;

    // Authorize: source adapter must be terminal-pty (or unspecified)
    if (config.source_adapter && config.source_adapter !== "terminal-pty") continue;

    // Only process connections where this tile is the directional source
    const isSource =
      conn.from_tile_id === ctx.tileId ||
      (conn.from_tile_id == null && conn.tile_a_id === ctx.tileId);
    if (!isSource) continue;

    const targetTileId = conn.to_tile_id ?? conn.tile_b_id;

    try {
      // Match
      if (config.match_rule) {
        const matched = matchLine(line, config.match_rule);
        appendEvent({
          kind: "string.pipeline.match",
          tileId: ctx.tileId,
          cableId: conn.id,
          level: matched ? "info" : "debug",
          data: {
            line,
            pattern: config.match_rule.pattern,
            match_type: config.match_rule.type,
            matched,
          },
        });
        if (!matched) continue;
      }

      // Transform
      const text = config.transform
        ? transformLine(line, config.transform)
        : line;

      appendEvent({
        kind: "string.pipeline.transform",
        tileId: ctx.tileId,
        cableId: conn.id,
        level: "info",
        data: { input: line, output: text, transform_type: config.transform?.type ?? "none" },
      });

      // Deliver
      const result = deliver(text, conn.id, ctx.tileId, targetTileId, config, deps);

      appendEvent({
        kind: "string.pipeline.deliver",
        tileId: ctx.tileId,
        cableId: conn.id,
        level: result.ok ? "info" : "warn",
        data: {
          ok: result.ok,
          target_adapter: config.target_adapter ?? null,
          target_tile_id: targetTileId,
          ...(result.ok ? result.detail : { code: result.code, message: result.message }),
        },
      });
    } catch (err) {
      appendEvent({
        kind: "string.pipeline.error",
        tileId: ctx.tileId,
        cableId: conn.id,
        level: "error",
        data: {
          message: err instanceof Error ? err.message : "pipeline error",
          line,
        },
      });
    }
  }
}
