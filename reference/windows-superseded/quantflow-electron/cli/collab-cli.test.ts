import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "qf.mjs");

function runCli(args: string[]) {
  const result = Bun.spawnSync(["node", cliPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("qf CLI", () => {
  test("help documents viewport and connection commands", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("connection list");
    expect(result.stdout).toContain("connection create <a> <b> [opts]");
    expect(result.stdout).toContain("connection label <id> <label>");
    expect(result.stdout).toContain("connection send <id> --from <tile> <message>");
    expect(result.stdout).toContain("connection log <id> [--limit N]");
    expect(result.stdout).toContain("relay log [--limit N]");
    expect(result.stdout).toContain("watchtower snapshot");
    expect(result.stdout).toContain("context preview [options]");
    expect(result.stdout).toContain("context inject <tile> [options]");
    expect(result.stdout).toContain("role list");
    expect(result.stdout).toContain("role spawn <id> [options]");
    expect(result.stdout).toContain("viewport set [--pan x,y] [--zoom z]");
  });

  test("validates connection create before opening the RPC socket", () => {
    const result = runCli(["connection", "create", "tile-a"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "connection create requires <tileA> <tileB>",
    );
  });

  test("validates viewport set arguments before opening the RPC socket", () => {
    const result = runCli(["viewport", "set"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "viewport set requires --pan x,y or --zoom n",
    );
  });

  test("validates connection send direction before opening the RPC socket", () => {
    const result = runCli(["connection", "send", "conn-1", "hello"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "connection send requires --from <tileId>",
    );
  });

  test("validates connection log before opening the RPC socket", () => {
    const result = runCli(["connection", "log"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("connection log requires a connection id");
  });

  test("validates log limits before opening the RPC socket", () => {
    const result = runCli(["relay", "log", "--limit", "0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--limit must be a positive integer");
  });

  test("validates watchtower subcommands before opening the RPC socket", () => {
    const result = runCli(["watchtower"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "watchtower requires a subcommand (snapshot)",
    );
  });

  test("validates role subcommands before opening the RPC socket", () => {
    const missingSubcommand = runCli(["role"]);
    expect(missingSubcommand.exitCode).toBe(1);
    expect(missingSubcommand.stderr).toContain(
      "role requires a subcommand (list, spawn)",
    );

    const missingRole = runCli(["role", "spawn"]);
    expect(missingRole.exitCode).toBe(1);
    expect(missingRole.stderr).toContain("role spawn requires a role id");
  });

  test("validates role spawn geometry before opening the RPC socket", () => {
    const invalidPos = runCli(["role", "spawn", "codex", "--pos", "a,1"]);
    expect(invalidPos.exitCode).toBe(1);
    expect(invalidPos.stderr).toContain("invalid position: a,1");

    const invalidSize = runCli(["role", "spawn", "codex", "--size", "20,no"]);
    expect(invalidSize.exitCode).toBe(1);
    expect(invalidSize.stderr).toContain("invalid size: 20,no");
  });

  test("validates context subcommands before opening the RPC socket", () => {
    const missingSubcommand = runCli(["context"]);
    expect(missingSubcommand.exitCode).toBe(1);
    expect(missingSubcommand.stderr).toContain(
      "context requires a subcommand (get, preview, pin, unpin, mode, decision, inject)",
    );

    const missingPin = runCli(["context", "pin"]);
    expect(missingPin.exitCode).toBe(1);
    expect(missingPin.stderr).toContain("context pin requires a file path");

    const missingInject = runCli(["context", "inject"]);
    expect(missingInject.exitCode).toBe(1);
    expect(missingInject.stderr).toContain("context inject requires a tile id");
  });

  test("validates context options before opening the RPC socket", () => {
    const badPreviewLimit = runCli(["context", "preview", "--max-chars", "0"]);
    expect(badPreviewLimit.exitCode).toBe(1);
    expect(badPreviewLimit.stderr).toContain(
      "--max-chars must be a positive integer",
    );

    const badMode = runCli(["context", "mode", "Specs/a.md", "summary"]);
    expect(badMode.exitCode).toBe(1);
    expect(badMode.stderr).toContain(
      "mode must be full, summary-header, or excerpt",
    );

    const missingDecision = runCli(["context", "decision", "--author", "codex"]);
    expect(missingDecision.exitCode).toBe(1);
    expect(missingDecision.stderr).toContain("context decision requires text");
  });
});
