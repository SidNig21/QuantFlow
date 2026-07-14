/**
 * Conductor panel (Goal 5A) — live read-only surface.
 *
 * Displays the embedded Conductor's planning view (plan / state reads / tool
 * calls / delegations / receipts reviewed / blockers / next action) entirely
 * from Kernel-backed data via window.conductorApi. "Generate plan" appends a
 * single planning receipt through the Kernel; nothing else mutates.
 *
 * Section formatting is the shared renderer projector contract in src/renderer
 * (via @qf-renderer), so this panel and any future framework renderer agree.
 */

import { formatConductorView } from "@qf-renderer/components/ConductorTile/conductor-view";

export function createConductorPanel() {
  const el = document.createElement("div");
  el.id = "conductor-panel";
  el.hidden = true;
  el.innerHTML = `
    <div class="cdr-header">
      <span class="cdr-title">Conductor</span>
      <span class="cdr-mode">single-step</span>
      <div class="cdr-actions">
        <button class="cdr-run" type="button" title="Generate plan + post planning receipt">Generate plan</button>
        <button class="cdr-refresh" type="button" title="Refresh from Kernel">Refresh</button>
        <button class="cdr-close" type="button" aria-label="Close Conductor">x</button>
      </div>
    </div>
    <div class="cdr-workflow"></div>
    <div class="cdr-body"></div>
    <div class="cdr-action-bar" aria-label="Conductor actions (one at a time)">
      <button data-act="create-task" type="button">Create task</button>
      <button data-act="spawn" type="button">Spawn worker</button>
      <button data-act="assign" type="button">Assign next</button>
      <button data-act="submit" type="button">Submit</button>
      <button data-act="verify" type="button">Verify</button>
      <button data-act="ready" type="button">Mark ready</button>
    </div>
    <div class="cdr-loop-bar" aria-label="Conductor loop (approval-gated)">
      <button data-loop="step" type="button">Loop step</button>
      <button data-loop="approve" type="button" disabled>Approve</button>
      <button data-loop="deny" type="button" disabled>Deny</button>
    </div>
    <div class="cdr-foot"></div>
  `;
  document.body.appendChild(el);

  const body = el.querySelector(".cdr-body");
  const workflowLine = el.querySelector(".cdr-workflow");
  const foot = el.querySelector(".cdr-foot");
  let visible = false;
  let lastView = null;

  function renderView(view) {
    lastView = view ?? null;
    const wf = view?.workflow ?? null;
    workflowLine.textContent = wf
      ? `Workflow: ${wf.name} (${wf.status}) — ${wf.taskCount} tasks, ${wf.blockedTaskCount} blocked`
      : "No active workflow scope — reading all tiles.";

    const sections = formatConductorView(view ?? null);
    body.textContent = "";
    for (const section of sections) {
      const row = document.createElement("div");
      row.className = "cdr-row";
      const label = document.createElement("div");
      label.className = "cdr-label";
      label.textContent = section.label;
      const value = document.createElement("div");
      value.className = "cdr-value";
      value.textContent = section.value;
      row.appendChild(label);
      row.appendChild(value);
      body.appendChild(row);
    }
    if (view?.generatedAt) {
      foot.textContent = `Generated ${new Date(view.generatedAt).toLocaleTimeString()}`;
    }
  }

  async function refresh() {
    if (!window.conductorApi) {
      renderView(null);
      foot.textContent = "Conductor API unavailable.";
      return;
    }
    try {
      const view = await window.conductorApi.readView({});
      renderView(view);
    } catch (err) {
      foot.textContent = `Read failed: ${err?.message || err}`;
    }
  }

  async function run() {
    if (!window.conductorApi) return;
    foot.textContent = "Generating plan…";
    try {
      const result = await window.conductorApi.run({});
      renderView(result?.view ?? lastView);
      foot.textContent = result?.receiptId
        ? `Planning receipt posted: ${result.receiptId}`
        : "Plan generated (no receipt id returned).";
    } catch (err) {
      foot.textContent = `Run failed: ${err?.message || err}`;
    }
  }

  el.querySelector(".cdr-run").addEventListener("click", () => void run());
  el.querySelector(".cdr-refresh").addEventListener("click", () => void refresh());
  el.querySelector(".cdr-close").addEventListener("click", () => hide());

  // -- Goal 5C: operator-triggered single-step actions --
  async function kernelContext() {
    return (await window.kernelApi?.sendQuery?.("kernel.conductor.context", {})) ?? null;
  }

  async function doAction(action, args, label) {
    if (!window.conductorApi?.action) return;
    foot.textContent = `${label}…`;
    try {
      const result = await window.conductorApi.action(action, args);
      foot.textContent = result?.ok
        ? `${label} ok${result.id ? ` (${result.id})` : ""}`
        : `${label} rejected: ${result?.error ?? "unknown"}`;
    } catch (err) {
      foot.textContent = `${label} failed: ${err?.message || err}`;
    }
    await refresh();
  }

  // Electron disables window.prompt(), so operator inputs use a small inline
  // prompt rendered inside the panel. Resolves the trimmed value, or null on
  // empty/Cancel/Escape.
  function askText(label, defaultValue = "") {
    return new Promise((resolve) => {
      const row = document.createElement("div");
      row.className = "cdr-prompt";
      const lbl = document.createElement("div");
      lbl.className = "cdr-prompt-label";
      lbl.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cdr-prompt-input";
      input.value = defaultValue;
      const actions = document.createElement("div");
      actions.className = "cdr-prompt-actions";
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "OK";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      actions.appendChild(ok);
      actions.appendChild(cancel);
      row.appendChild(lbl);
      row.appendChild(input);
      row.appendChild(actions);
      el.appendChild(row);
      input.focus();
      const done = (value) => { row.remove(); resolve(value); };
      ok.addEventListener("click", () => done(input.value.trim() || null));
      cancel.addEventListener("click", () => done(null));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); done(input.value.trim() || null); }
        else if (e.key === "Escape") { e.preventDefault(); done(null); }
        e.stopPropagation();
      });
    });
  }

  const firstTask = (ctx, ...statuses) =>
    ctx?.tasks?.find((t) => statuses.includes(t.status)) ?? null;
  const firstWorkerTile = (ctx) =>
    ctx?.tiles?.find((t) => t.tileKind === "worker") ?? ctx?.tiles?.[0] ?? null;

  const actionHandlers = {
    "create-task": async () => {
      const title = await askText("New task title:");
      if (!title) return;
      const ctx = await kernelContext();
      await doAction("create_task", {
        workflowId: ctx?.workflow?.id ?? null,
        title,
        objective: title,
      }, "Create task");
    },
    spawn: async () => {
      // Spawn through the approved shell role-spawn path (creates the tile +
      // runtime, gated by kernel.worker.spawn). Operator picks the role; the
      // active workflow id is threaded so the worker is tied to the workflow.
      const roles = (await window.shellApi?.rolesList?.()) ?? [];
      if (!roles.length) { foot.textContent = "Spawn: no roles available."; return; }
      const names = roles.map((r) => r.id).join(", ");
      const roleId = await askText(`Role to spawn (${names}):`, roles[0].id);
      if (!roleId) return;
      const ctx = await kernelContext();
      const workflowId = ctx?.workflow?.id ?? null;
      await doAction(
        "spawn_role",
        { roleId, ...(workflowId ? { workflowId } : {}) },
        `Spawn ${roleId}`,
      );
    },
    assign: async () => {
      const ctx = await kernelContext();
      const task = firstTask(ctx, "open");
      const tile = firstWorkerTile(ctx);
      if (!task || !tile) { foot.textContent = "Assign: need an open task and a tile."; return; }
      await doAction("assign_task", { taskId: task.id, tileId: tile.id }, "Assign task");
    },
    submit: async () => {
      const ctx = await kernelContext();
      const task = firstTask(ctx, "working");
      if (!task) { foot.textContent = "Submit: no working task."; return; }
      await doAction("submit_task", { taskId: task.id, summary: "submitted via Conductor" }, "Submit task");
    },
    verify: async () => {
      const ctx = await kernelContext();
      const task = firstTask(ctx, "submitted", "verifying");
      if (!task) { foot.textContent = "Verify: no submitted task."; return; }
      await doAction("verify_task", { taskId: task.id, verdict: "pass", operatorOverride: true }, "Verify task");
    },
    ready: () => run(),
  };

  for (const btn of el.querySelectorAll(".cdr-action-bar button")) {
    btn.addEventListener("click", () => void actionHandlers[btn.dataset.act]?.());
  }

  // -- Goal 5D: approval-gated loop controls --
  const approveBtn = el.querySelector('[data-loop="approve"]');
  const denyBtn = el.querySelector('[data-loop="deny"]');
  // The token of the high-risk proposal currently awaiting approval. Approve/
  // Deny send it back so the decision binds to the exact proposal shown; if the
  // world drifted, the loop returns 'stale' and nothing high-risk runs.
  let pendingToken = null;

  async function loopStep(approve) {
    if (!window.conductorApi?.loopStep) { foot.textContent = "Loop API unavailable."; return; }
    foot.textContent = approve === undefined ? "Loop step…" : (approve ? "Approving…" : "Denying…");
    try {
      const input = approve === undefined
        ? {}
        : { approve, ...(pendingToken ? { proposalToken: pendingToken } : {}) };
      const r = await window.conductorApi.loopStep(input);
      const what = r?.proposal?.action ?? "pause";
      foot.textContent = `[${r?.status}] ${what} — ${r?.proposal?.rationale ?? ""}`;
      // Approve/Deny only enabled while a high-risk proposal awaits approval;
      // remember its token so the decision is bound to that exact proposal.
      const awaiting = r?.status === "awaiting-approval";
      pendingToken = awaiting ? (r?.proposalToken ?? null) : null;
      approveBtn.disabled = !awaiting;
      denyBtn.disabled = !awaiting;
    } catch (err) {
      foot.textContent = `Loop step failed: ${err?.message || err}`;
    }
    await refresh();
  }

  el.querySelector('[data-loop="step"]').addEventListener("click", () => void loopStep(undefined));
  approveBtn.addEventListener("click", () => void loopStep(true));
  denyBtn.addEventListener("click", () => void loopStep(false));

  function show() {
    visible = true;
    el.hidden = false;
    void refresh();
  }
  function hide() {
    visible = false;
    el.hidden = true;
  }
  function toggle() {
    if (visible) hide();
    else show();
  }
  function isVisible() {
    return visible;
  }

  // Live-ish: when visible, refresh on Kernel events that change the world.
  if (window.kernelApi?.onEvent) {
    window.kernelApi.onEvent((payload) => {
      if (!visible) return;
      const kind = String(payload?.kind ?? "");
      if (
        kind.startsWith("task.") ||
        kind.startsWith("state_card.") ||
        kind === "receipt.posted" ||
        kind.startsWith("tile.") ||
        kind.startsWith("conductor.")
      ) {
        void refresh();
      }
    });
  }

  return { el, show, hide, toggle, isVisible, refresh };
}
