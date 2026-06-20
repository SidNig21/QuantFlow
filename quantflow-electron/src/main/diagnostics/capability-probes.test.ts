import { describe, expect, test } from "bun:test";
import { createStaticCapabilityProbes, type CapabilityProbeDeps } from "./capability-probes";
import type { ProbeContext } from "./types";
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

function role(id: string, commandTemplate: string): Role {
  return {
    id,
    name: id,
    description: id,
    color: "#fff",
    commandTemplate,
  };
}

async function run(name: string, roles: Role[], deps: CapabilityProbeDeps = {}) {
  const probe = createStaticCapabilityProbes(roles, deps).find((item) =>
    item.name === name
  );
  if (!probe) throw new Error(`Missing probe ${name}`);
  return probe.check(ctx());
}

describe("capability probes", () => {
  test("role present + authed + reachable maps to ready/healthy", async () => {
    const result = await run("capability.role.codex", [role("codex", "codex")], {
      commandExists: () => true,
      checkCliAuth: async () => ({ authed: true, message: "authed" }),
    });

    expect(result.level).toBe("healthy");
    expect(result.detail).toMatchObject({
      capabilityId: "role:codex",
      kind: "role",
      present: true,
      reachable: true,
      authed: true,
      ready: true,
      checkedAt,
    });
  });

  test("role present but not authed maps to degraded with remediation", async () => {
    const result = await run("capability.role.claude-worker", [
      role("claude-worker", "claude"),
    ], {
      commandExists: () => true,
      checkCliAuth: async () => ({
        authed: false,
        message: "present, not authenticated",
        remediation: "Run claude login.",
      }),
    });

    expect(result.level).toBe("degraded");
    expect(result.remediation).toBe("Run claude login.");
    expect(result.detail).toMatchObject({
      authed: false,
      ready: false,
    });
  });

  test("absent role command maps to down and present false", async () => {
    const result = await run("capability.role.opencode", [
      role("opencode", "opencode"),
    ], {
      commandExists: () => false,
    });

    expect(result.level).toBe("down");
    expect(result.detail).toMatchObject({
      capabilityId: "role:opencode",
      present: false,
      reachable: false,
      ready: false,
    });
  });

  test("existing prompt readiness can prove a role without spawning", async () => {
    const result = await run("capability.role.codex", [role("codex", "codex")], {
      commandExists: () => true,
      readExistingPromptText: async () =>
        `codex ${"ready ".repeat(40)}`,
      checkCliAuth: async () => {
        throw new Error("auth command should not run when prompt is ready");
      },
    });

    expect(result.level).toBe("healthy");
    expect(result.detail).toMatchObject({
      capabilityId: "role:codex",
      authed: true,
      ready: true,
      promptReady: true,
    });
  });

  test("herdr unreachable maps to down with remediation", async () => {
    const result = await run("capability.harness.herdr-shell", [], {
      checkHerdrReachability: async () => ({
        present: true,
        reachable: false,
        message: "UNC cwd blocked",
        remediation: "Normalize UNC to drive path.",
      }),
    });

    expect(result.level).toBe("down");
    expect(result.remediation).toBe("Normalize UNC to drive path.");
    expect(result.detail).toMatchObject({
      capabilityId: "harness:herdr-shell",
      authed: null,
      ready: false,
    });
  });

  test("local-shell and manual provider are non-auth-bearing ready baselines", async () => {
    const localShell = await run("capability.harness.local-shell", []);
    const manual = await run("capability.provider.manual", []);

    expect(localShell.level).toBe("healthy");
    expect(localShell.detail).toMatchObject({ authed: null, ready: true });
    expect(manual.level).toBe("healthy");
    expect(manual.detail).toMatchObject({ authed: null, ready: true });
  });

  test("OpenRouter provider uses injected readiness and keeps auth in detail", async () => {
    const result = await run("capability.provider.openrouter", [], {
      checkOpenRouter: async () => ({
        present: true,
        reachable: true,
        authed: true,
        message: "models reachable",
      }),
    });

    expect(result.level).toBe("healthy");
    expect(result.detail).toMatchObject({
      capabilityId: "provider:openrouter",
      kind: "provider",
      present: true,
      reachable: true,
      authed: true,
      ready: true,
    });
  });

  test("OpenRouter provider uses injected fetch and safeStorage accessor", async () => {
    let requestedUrl = "";
    const result = await run("capability.provider.openrouter", [], {
      credentialStorage: {
        isEncryptionAvailable: () => true,
        readEncrypted: async () => Buffer.from("encrypted"),
        decryptString: () => "openrouter-key",
      },
      fetch: (async (url, init) => {
        requestedUrl = String(url);
        expect((init?.headers as Record<string, string>).Authorization)
          .toBe("Bearer openrouter-key");
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });

    expect(requestedUrl).toBe("https://openrouter.ai/api/v1/models");
    expect(result.level).toBe("healthy");
    expect(result.detail).toMatchObject({
      capabilityId: "provider:openrouter",
      authed: true,
      ready: true,
    });
  });
});
