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
      <span class="cdr-mode">read-only</span>
      <div class="cdr-actions">
        <button class="cdr-run" type="button" title="Generate plan + post planning receipt">Generate plan</button>
        <button class="cdr-refresh" type="button" title="Refresh from Kernel">Refresh</button>
        <button class="cdr-close" type="button" aria-label="Close Conductor">x</button>
      </div>
    </div>
    <div class="cdr-workflow"></div>
    <div class="cdr-body"></div>
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
