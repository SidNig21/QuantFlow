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

  const firstTask = (ctx, ...statuses) =>
    ctx?.tasks?.find((t) => statuses.includes(t.status)) ?? null;
  const firstWorkerTile = (ctx) =>
    ctx?.tiles?.find((t) => t.tileKind === "worker") ?? ctx?.tiles?.[0] ?? null;

  const actionHandlers = {
    "create-task": async () => {
      const title = window.prompt?.("New task title:");
      if (!title) return;
      const ctx = await kernelContext();
      await doAction("create_task", {
        workflowId: ctx?.workflow?.id ?? null,
        title,
        objective: title,
      }, "Create task");
    },
    spawn: async () => {
      const ctx = await kernelContext();
      const tile = firstWorkerTile(ctx);
      if (!tile) { foot.textContent = "Spawn: no worker tile to attach."; return; }
      await doAction("spawn_role", {
        tileId: tile.id,
        workflowId: ctx?.workflow?.id ?? null,
        roleName: tile.displayName,
        runtimeTarget: "local-shell",
      }, "Spawn worker");
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
