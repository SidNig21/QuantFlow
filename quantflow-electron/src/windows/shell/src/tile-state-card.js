/**
 * Tile State Card back face (Goal 4).
 *
 * Renders the Kernel-owned State Card for a tile on the tile's back face.
 * Data comes from the Kernel query boundary (kernel.state_card.get); the
 * renderer is a projector and stores nothing. Section formatting is the shared
 * projector contract in src/renderer (via the @qf-renderer alias), so the live
 * shell and any future framework renderer agree on what the card shows.
 */

import { formatStateCard } from "@qf-renderer/components/StateCardView/state-card-view";

const RECEIPT_TIMELINE_LIMIT = 8;

/** Build the (empty, hidden-by-CSS) back-face element for a tile. */
export function createStateCardBack() {
  const back = document.createElement("div");
  back.className = "tile-state-card";

  const header = document.createElement("div");
  header.className = "tile-state-card-header";
  header.textContent = "State Card";
  back.appendChild(header);

  const body = document.createElement("div");
  body.className = "tile-state-card-body";
  back.appendChild(body);

  bindAgentOsApprovalActions(back);

  return back;
}

function formatRelativeTime(createdAt) {
  if (!Number.isFinite(createdAt)) return "";
  const deltaMs = Date.now() - createdAt;
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function isAgentOsApprovalBlocked(card) {
  return card?.status === "blocked"
    && typeof card?.blocker === "string"
    && card.blocker.startsWith("AgentOS approval:");
}

async function fetchReceiptTimeline(tileId) {
  const kapi = window.kernelApi;
  if (!kapi?.sendQuery) return [];

  let workflowId = null;
  try {
    const workers = await kapi.sendQuery("kernel.worker.list", {});
    if (Array.isArray(workers)) {
      const worker = workers.find((entry) => entry?.tileId === tileId);
      workflowId = worker?.workflowId ?? null;
    }
  } catch {
    // Worker lookup is best-effort for scoping receipt.list.
  }

  try {
    const params = workflowId
      ? { workflowId, limit: 100 }
      : { limit: 200 };
    const receipts = await kapi.sendQuery("kernel.receipt.list", params);
    if (!Array.isArray(receipts)) return [];
    const forTile = receipts.filter((entry) => entry?.tileId === tileId);
    return forTile.slice(0, RECEIPT_TIMELINE_LIMIT).reverse();
  } catch (err) {
    console.warn("[state-card] receipt timeline failed:", err);
    return [];
  }
}

async function resolveAgentOsApprovalForTile(tileId, approved) {
  const shell = window.shellApi;
  if (!shell?.agentosListApprovals || !shell?.agentosApprove) return;
  const pending = await shell.agentosListApprovals();
  if (!Array.isArray(pending) || pending.length === 0) return;
  let match = pending.find((entry) => entry?.tileId === tileId) ?? null;
  if (!match && pending.length === 1) match = pending[0];
  if (!match?.requestId) return;
  await shell.agentosApprove({ requestId: match.requestId, approved });
}

function bindAgentOsApprovalActions(backEl) {
  if (backEl.dataset.agentosBound === "1") return;
  backEl.dataset.agentosBound = "1";
  backEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-agentos-approval]");
    if (!button || !backEl.dataset.tileId) return;
    event.stopPropagation();
    const approved = button.dataset.agentosApproval === "approve";
    void resolveAgentOsApprovalForTile(backEl.dataset.tileId, approved);
  });
}

function appendSectionRow(body, label, value) {
  const row = document.createElement("div");
  row.className = "tile-state-card-row";

  const labelEl = document.createElement("div");
  labelEl.className = "tile-state-card-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "tile-state-card-value";
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  body.appendChild(row);
}

function appendApprovalActions(body, blocker) {
  const row = document.createElement("div");
  row.className = "tile-state-card-approval";

  const prompt = document.createElement("div");
  prompt.className = "tile-state-card-approval-prompt";
  prompt.textContent = blocker.replace(/^AgentOS approval:\s*/, "");

  const actions = document.createElement("div");
  actions.className = "tile-state-card-approval-actions";

  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "tile-state-card-approval-btn tile-state-card-approval-btn--approve";
  approve.dataset.agentosApproval = "approve";
  approve.textContent = "Approve";

  const deny = document.createElement("button");
  deny.type = "button";
  deny.className = "tile-state-card-approval-btn tile-state-card-approval-btn--deny";
  deny.dataset.agentosApproval = "deny";
  deny.textContent = "Deny";

  actions.append(approve, deny);
  row.append(prompt, actions);
  body.appendChild(row);
}

function appendReceiptTimeline(body, receipts) {
  const section = document.createElement("div");
  section.className = "tile-state-card-timeline";

  const heading = document.createElement("div");
  heading.className = "tile-state-card-timeline-heading";
  heading.textContent = "Receipt timeline";

  section.appendChild(heading);

  if (receipts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tile-state-card-timeline-empty";
    empty.textContent = "—";
    section.appendChild(empty);
    body.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "tile-state-card-timeline-list";

  for (const receipt of receipts) {
    const row = document.createElement("div");
    row.className = "tile-state-card-receipt-row";

    const type = document.createElement("span");
    type.className = "tile-state-card-receipt-type";
    type.textContent = receipt.type ?? "receipt";

    const summary = document.createElement("span");
    summary.className = "tile-state-card-receipt-summary";
    summary.textContent = receipt.summary ?? "";

    const when = document.createElement("span");
    when.className = "tile-state-card-receipt-time";
    when.textContent = formatRelativeTime(receipt.createdAt);

    row.append(type, summary, when);
    list.appendChild(row);
  }

  section.appendChild(list);
  body.appendChild(section);
}

/**
 * Query the Kernel for the tile's State Card and render its canonical sections
 * into the back face. Safe to call repeatedly (e.g. on flip and on
 * state_card.updated events).
 */
export async function renderStateCardBack(backEl, tileId) {
  if (!backEl) return;
  backEl.dataset.tileId = tileId;
  const body = backEl.querySelector(".tile-state-card-body");
  if (!body) return;

  let card = null;
  try {
    card = await window.kernelApi?.sendQuery?.("kernel.state_card.get", { tileId });
  } catch (err) {
    console.warn("[state-card] query failed:", err);
  }

  const sections = formatStateCard(card ?? null);
  body.textContent = "";
  for (const section of sections) {
    appendSectionRow(body, section.label, section.value);
  }

  if (isAgentOsApprovalBlocked(card)) {
    appendApprovalActions(body, card.blocker);
  }

  const receipts = await fetchReceiptTimeline(tileId);
  appendReceiptTimeline(body, receipts);
}
