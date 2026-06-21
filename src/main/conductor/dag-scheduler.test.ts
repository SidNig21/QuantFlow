import { describe, expect, test } from "bun:test";
import { schedulableTasks } from "./dag-scheduler";

// collect → analyze → synthesize, with `extract` as a parallel branch off collect:
//   collect ─┬─ analyze ──┐
//            └─ extract ──┴─ synthesize
const DEPS = [
  { taskId: "analyze", dependsOnTaskId: "collect", kind: "blocks" },
  { taskId: "extract", dependsOnTaskId: "collect", kind: "blocks" },
  { taskId: "synthesize", dependsOnTaskId: "analyze", kind: "blocks" },
  { taskId: "synthesize", dependsOnTaskId: "extract", kind: "blocks" },
];

function tasks(statuses: Record<string, string>) {
  return Object.entries(statuses).map(([id, status]) => ({ id, status }));
}

describe("dag-scheduler.schedulableTasks", () => {
  test("only the root is schedulable before anything completes", () => {
    const eligible = schedulableTasks({
      tasks: tasks({ collect: "open", analyze: "open", extract: "open", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: [],
    });
    expect(eligible).toEqual(["collect"]);
  });

  test("completing+verifying collect unblocks BOTH parallel branches at once", () => {
    const eligible = schedulableTasks({
      tasks: tasks({ collect: "complete", analyze: "open", extract: "open", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: ["collect"],
    });
    expect(eligible.sort()).toEqual(["analyze", "extract"]);
  });

  test("a complete-but-UNVERIFIED upstream does NOT unblock downstream", () => {
    const eligible = schedulableTasks({
      tasks: tasks({ collect: "complete", analyze: "open", extract: "open", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: [], // collect complete but no verification_passed
    });
    expect(eligible).toEqual([]);
  });

  test("synthesize is eligible only after BOTH upstreams are complete+verified", () => {
    const oneBranch = schedulableTasks({
      tasks: tasks({ collect: "complete", analyze: "complete", extract: "working", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: ["collect", "analyze"],
    });
    expect(oneBranch).toEqual([]); // extract not done yet

    const bothBranches = schedulableTasks({
      tasks: tasks({ collect: "complete", analyze: "complete", extract: "complete", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: ["collect", "analyze", "extract"],
    });
    expect(bothBranches).toEqual(["synthesize"]);
  });

  test("non-open tasks are never in the eligible set", () => {
    const eligible = schedulableTasks({
      tasks: tasks({ collect: "claimed", analyze: "open", extract: "open", synthesize: "open" }),
      dependencies: DEPS,
      verifiedTaskIds: [],
    });
    // collect is being worked (claimed), analyze/extract still blocked on it
    expect(eligible).toEqual([]);
  });
});
