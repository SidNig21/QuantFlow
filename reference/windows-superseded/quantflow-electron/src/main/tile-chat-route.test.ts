import { describe, expect, test } from "bun:test";
import type { ConnectionGraphEntry } from "./tile-session-registry";
import { resolveTileChatRoute } from "./tile-chat-route";

const connA: ConnectionGraphEntry = { id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" };
const connB: ConnectionGraphEntry = { id: "conn-b", tileAId: "tile-c", tileBId: "tile-a" };

describe("resolveTileChatRoute", () => {
  test("routes non-cable input locally unchanged", () => {
    expect(resolveTileChatRoute("tile-a", "hello", [connA])).toEqual({
      kind: "local",
      text: "hello",
    });
    expect(resolveTileChatRoute("tile-a", "   ", [connA])).toEqual({
      kind: "local",
      text: "   ",
    });
    expect(resolveTileChatRoute("tile-a", "/cables ping", [connA])).toEqual({
      kind: "local",
      text: "/cables ping",
    });
    expect(resolveTileChatRoute("tile-a", "/Cable ping", [connA])).toEqual({
      kind: "local",
      text: "/Cable ping",
    });
  });

  test("routes /cable text to the connected peer", () => {
    expect(resolveTileChatRoute("tile-a", "/cable hello peer", [connA])).toEqual({
      kind: "cable",
      text: "hello peer",
      connectionId: "conn-a",
      toTileId: "tile-b",
      notice: undefined,
    });
    expect(resolveTileChatRoute("tile-b", "/cable hello back", [connA])).toEqual({
      kind: "cable",
      text: "hello back",
      connectionId: "conn-a",
      toTileId: "tile-a",
      notice: undefined,
    });
  });

  test("uses the most recently synced connection when multiple cables exist", () => {
    expect(resolveTileChatRoute("tile-a", "/cable newest", [connA, connB])).toEqual({
      kind: "cable",
      text: "newest",
      connectionId: "conn-b",
      toTileId: "tile-c",
      notice: "2 cables on this tile — using conn-b",
    });
  });

  test("returns handled errors for invalid cable commands", () => {
    expect(resolveTileChatRoute("tile-a", "/cable", [connA])).toEqual({
      kind: "cable-error",
      text: "",
      notice: "usage: /cable <message>",
    });
    expect(resolveTileChatRoute("tile-a", "/cable    ", [connA])).toEqual({
      kind: "cable-error",
      text: "",
      notice: "usage: /cable <message>",
    });
    expect(resolveTileChatRoute("tile-a", "/cable ping", [])).toEqual({
      kind: "cable-error",
      text: "ping",
      notice: "no canvas cable on this tile",
    });
    expect(resolveTileChatRoute("tile-x", "/cable ping", [connA])).toEqual({
      kind: "cable-error",
      text: "ping",
      notice: "no canvas cable on this tile",
    });
  });
});
