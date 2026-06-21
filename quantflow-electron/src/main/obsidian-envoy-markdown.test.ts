import { describe, expect, test } from "bun:test";
import { buildTaskResultNote, safeEnvoyResultFilePart } from "./obsidian-envoy-mirror";
import type { EnvoyReceiptRow, EnvoyTaskRow } from "./runtime-state/types";

describe("obsidian envoy markdown", () => {
  test("renders a completed Envoy task as human-readable run results", () => {
    const task: EnvoyTaskRow = {
      task_id: "task-fable-links",
      envoy_task_id: "msg-fable",
      canvas_id: "main",
      envoy_space_id: "space-test",
      source_tile_id: "operator",
      target_tile_id: null,
      connection_id: null,
      correlation_id: "corr-fable",
      title: "Find Fable tool links",
      instruction: "Rank Fable URL List candidates for QuantFlow.",
      acceptance_criteria: JSON.stringify(["Return 5-10 candidates"]),
      status: "done",
      claimed_by: "Hermes",
      claimed_at: 1781588127197,
      result_summary: "MotherDuck, Braintrust, and SkillOpt are the top picks.",
      receipt_ids: JSON.stringify(["receipt-start", "receipt-complete"]),
      artifact_paths: JSON.stringify(["vault/Fable URL List.md"]),
      created_at: 1781588053809,
      updated_at: 1781588205644,
    };
    const receipts: EnvoyReceiptRow[] = [
      {
        receipt_id: "receipt-start",
        task_id: task.task_id,
        canvas_id: task.canvas_id,
        envoy_space_id: task.envoy_space_id,
        correlation_id: task.correlation_id,
        connection_id: null,
        kind: "progress",
        actor_tile_id: "tile-hermes",
        agent_name: "Hermes",
        envoy_message_id: null,
        payload: JSON.stringify({ summary: "Searched Fable URL List." }),
        created_at: 1781588173326,
      },
      {
        receipt_id: "receipt-complete",
        task_id: task.task_id,
        canvas_id: task.canvas_id,
        envoy_space_id: task.envoy_space_id,
        correlation_id: task.correlation_id,
        connection_id: null,
        kind: "complete",
        actor_tile_id: "tile-hermes",
        agent_name: "Hermes",
        envoy_message_id: null,
        payload: JSON.stringify({
          result_summary: "Sent ranked candidates back through Envoy.",
        }),
        created_at: 1781588205644,
      },
    ];

    const markdown = buildTaskResultNote(task, receipts);

    expect(markdown).toContain("# Find Fable tool links");
    expect(markdown).toContain("Status: done");
    expect(markdown).toContain("## Result");
    expect(markdown).toContain("MotherDuck, Braintrust, and SkillOpt are the top picks.");
    expect(markdown).toContain("- Return 5-10 candidates");
    expect(markdown).toContain("- vault/Fable URL List.md");
    expect(markdown).toContain("progress - Hermes - Searched Fable URL List.");
    expect(markdown).toContain("complete - Hermes - Sent ranked candidates back through Envoy.");
  });

  test("sanitizes result filenames for Obsidian-safe links", () => {
    expect(safeEnvoyResultFilePart("Find: Fable / tool links?")).toBe("Find--Fable---tool-links-");
  });
});
