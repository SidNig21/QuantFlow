import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  EnvoyService,
  extractEnvoyInviteCode,
  extractEnvoyMessageId,
  extractEnvoySpaceId,
  isEnvoyEpochRevokedError,
  makeEnvoySpaceName,
  sanitizeEnvoyName,
  type EnvoyCliRunner,
} from "./envoy-service";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { closeDb } from "./runtime-state/database";
import {
  _resetForTesting as resetEnvoy,
  getEnvoySpace,
  upsertEnvoySpace,
} from "./runtime-state/envoy-repo";
import { _resetForTesting as resetEvents, listEvents } from "./runtime-state/events-repo";

beforeEach(() => {
  installTestRuntimeDb();
  resetEvents();
  resetEnvoy();
});

afterAll(() => {
  closeDb();
});

describe("EnvoyService", () => {
  test("builds deterministic safe space names", () => {
    expect(sanitizeEnvoyName("Main Canvas!")).toBe("main-canvas");
    expect(makeEnvoySpaceName({ canvasId: "Main Canvas", workspaceId: "workspace-a" }))
      .toMatch(/^qf\.[a-f0-9]{10}\.main-canvas$/);
  });

  test("extracts Envoy ids from known JSON shapes", () => {
    expect(extractEnvoySpaceId(JSON.stringify({
      spaces: [{ space_name: "qf.test", space_id: "space-1" }],
    }), "qf.test")).toBe("space-1");
    expect(extractEnvoySpaceId(JSON.stringify({ room_id: "room-1" }))).toBe("room-1");
    expect(extractEnvoyMessageId(JSON.stringify({ message_id: "msg-1" }))).toBe("msg-1");
  });

  test("creates and persists one Envoy space per canvas", async () => {
    const spaceName = makeEnvoySpaceName({ canvasId: "main" });
    const calls: string[][] = [];
    const runner: EnvoyCliRunner = async (args) => {
      calls.push(args);
      if (args.includes("spaces")) {
        const hasSpace = calls.filter((entry) => entry.includes("spaces")).length > 1;
        return {
          stdout: hasSpace
            ? JSON.stringify({
                spaces: [{ space_name: spaceName, space_id: "space-created" }],
              })
            : JSON.stringify({ spaces: [] }),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: JSON.stringify({ space_id: "space-created" }),
        stderr: "",
        exitCode: 0,
      };
    };
    const service = new EnvoyService({ runner });

    const first = await service.ensureEnvoySpace({ canvasId: "main" });
    const second = await service.ensureEnvoySpace({ canvasId: "main" });

    expect(first.envoy_space_id).toBe("space-created");
    expect(second.envoy_space_id).toBe("space-created");
    expect(calls.filter((entry) => entry.includes("spaces"))).toHaveLength(2);
    expect(getEnvoySpace("main")?.status).toBe("ready");
    expect(listEvents({ kind: "envoy.space.ready" })).toHaveLength(1);
  });

  test("rebinds a stale cached space id to the live Envoy space name", async () => {
    const spaceName = makeEnvoySpaceName({ canvasId: "main" });
    upsertEnvoySpace({
      canvasId: "main",
      spaceName,
      envoySpaceId: "room-revoked",
      status: "ready",
      error: null,
    });

    const runner: EnvoyCliRunner = async (args) => {
      if (args.includes("spaces")) {
        return {
          stdout: JSON.stringify({
            spaces: [{ space_name: spaceName, space_id: "room-live" }],
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const service = new EnvoyService({ runner });
    const row = await service.ensureEnvoySpace({ canvasId: "main" });

    expect(row.envoy_space_id).toBe("room-live");
    expect(listEvents({ kind: "envoy.space.rebound" })).toHaveLength(1);
  });

  test("detects revoked Envoy epochs from CLI errors", () => {
    expect(isEnvoyEpochRevokedError("permission denied: EPOCH_REVOKED")).toBe(true);
    expect(isEnvoyEpochRevokedError("{\"error_code\":\"epoch_revoked\"}")).toBe(true);
    expect(isEnvoyEpochRevokedError("not found")).toBe(false);
  });

  test("extracts invite codes from envoy invite JSON", () => {
    expect(extractEnvoyInviteCode(JSON.stringify({
      invites: [{ code: "ABCD-1234" }],
    }))).toBe("ABCD-1234");
  });

  test("joins a profile when its capability epoch was revoked", async () => {
    const runner: EnvoyCliRunner = async (args) => {
      if (args.includes("history")) {
        return {
          stdout: "",
          stderr: JSON.stringify({ error_code: "epoch_revoked" }),
          exitCode: 1,
        };
      }
      if (args.includes("invite")) {
        return {
          stdout: JSON.stringify({ invites: [{ code: "JOIN-CODE" }] }),
          stderr: "",
          exitCode: 0,
        };
      }
      if (args.includes("join")) {
        return { stdout: JSON.stringify({ space_id: "room-live" }), stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const service = new EnvoyService({ runner });
    await service.ensureEnvoyProfileInSpace({
      envoySpaceId: "room-live",
      profile: "hermes-agent",
    });
    expect(listEvents({ kind: "envoy.profile.joined" })).toHaveLength(1);
  });
});
