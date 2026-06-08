import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  EnvoyService,
  extractEnvoyMessageId,
  extractEnvoySpaceId,
  makeEnvoySpaceName,
  sanitizeEnvoyName,
  type EnvoyCliRunner,
} from "./envoy-service";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { closeDb } from "./runtime-state/database";
import {
  _resetForTesting as resetEnvoy,
  getEnvoySpace,
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
    const calls: string[][] = [];
    const runner: EnvoyCliRunner = async (args) => {
      calls.push(args);
      if (args.includes("spaces")) {
        return { stdout: JSON.stringify({ spaces: [] }), stderr: "", exitCode: 0 };
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
    expect(calls).toHaveLength(2);
    expect(getEnvoySpace("main")?.status).toBe("ready");
    expect(listEvents({ kind: "envoy.space.ready" })).toHaveLength(1);
  });
});
