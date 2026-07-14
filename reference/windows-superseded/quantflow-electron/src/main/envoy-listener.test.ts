import { describe, expect, test } from "bun:test";
import { normalizeEnvoyPacket } from "./envoy-listener";

describe("normalizeEnvoyPacket", () => {
  test("pulls ids from nested Envoy packet data", () => {
    const packet = normalizeEnvoyPacket("space-1", {
      message_id: "msg-1",
      data: {
        correlation_id: "corr-1",
        connection_id: "conn-1",
      },
    });

    expect(packet.envoySpaceId).toBe("space-1");
    expect(packet.packetId).toBe("msg-1");
    expect(packet.correlationId).toBe("corr-1");
    expect(packet.connectionId).toBe("conn-1");
    expect(packet.raw).toBeObject();
  });
});
