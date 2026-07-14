import { describe, expect, test } from "bun:test";
import {
  preflightFromResults,
  renderPreflightReport,
  runPreflight,
} from "./preflight";
import type { HealthResult, ProbeContext } from "./types";
import type { Role } from "../role-service";

const checkedAt = "2026-06-20T00:00:00.000Z";

function ctx(): ProbeContext {
  return {
    now: () => Date.parse(checkedAt),
    quantflowHome: "/tmp/qf-home",
    quantflowDir: "/tmp/qf-dir",
    runtimeDbPath: "/tmp/qf-dir/runtime.db",
    socketPathFile: "/tmp/qf-home/socket-path",
    relayTokenFile: "/tmp/qf-home/relay-token",
    tcpHost: "127.0.0.1",
    tcpPort: 9811,
    mcpToolDefinitionPaths: [],
  };
}

function result(name: string, level: "healthy" | "degraded" | "down"): HealthResult {
  return {
    name,
    group: "capability",
    description: name,
    ok: level === "healthy",
    level,
    message: `${name} ${level}`,
    durationMs: 1,
    checkedAt,
    detail: {
      capabilityId: name,
      kind: "role",
      present: level !== "down",
      reachable: level !== "down",
      authed: level === "healthy",
      ready: level === "healthy",
      checkedAt,
    },
  };
}

function role(): Role {
  return {
    id: "codex",
    name: "Codex",
    description: "Codex",
    color: "#fff",
    commandTemplate: "codex",
  };
}

describe("capability preflight", () => {
  test("runPreflight aggregates worst-of deterministically", async () => {
    const health = await runPreflight({
      ctx: ctx(),
      deps: {
        listRoles: async () => [role()],
        commandExists: () => true,
        checkCliAuth: async () => ({ authed: true, message: "codex ready" }),
        checkHerdrReachability: async () => ({
          present: true,
          reachable: false,
          message: "herdr down",
        }),
        checkOpenRouter: async () => ({
          present: false,
          reachable: false,
          authed: false,
          message: "missing key",
        }),
        checkEve: async () => ({
          present: true,
          reachable: true,
          authed: true,
          message: "eve ready",
        }),
      },
    });

    expect(health.level).toBe("down");
    expect(health.summary).toEqual({
      total: 6,
      healthy: 4,
      degraded: 0,
      down: 2,
    });
  });

  test("renderPreflightReport is sorted and excludes timestamps from body", () => {
    const health = preflightFromResults([
      result("capability.role.zed", "healthy"),
      {
        ...result("capability.role.aaa", "degraded"),
        remediation: "Run login.",
      },
    ]);

    expect(renderPreflightReport(health)).toBe([
      "QuantFlow capability preflight: degraded (1 healthy, 1 degraded, 0 down)",
      "[degraded] capability.role.aaa present=true reachable=true authed=false ready=false - capability.role.aaa degraded",
      "  remediation: Run login.",
      "[healthy] capability.role.zed present=true reachable=true authed=true ready=true - capability.role.zed healthy",
    ].join("\n"));
  });
});
