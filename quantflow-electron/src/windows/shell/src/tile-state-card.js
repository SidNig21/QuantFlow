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

  return back;
}

/**
 * Query the Kernel for the tile's State Card and render its canonical sections
 * into the back face. Safe to call repeatedly (e.g. on flip and on
 * state_card.updated events).
 */
export async function renderStateCardBack(backEl, tileId) {
  if (!backEl) return;
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
    const row = document.createElement("div");
    row.className = "tile-state-card-row";

    const label = document.createElement("div");
    label.className = "tile-state-card-label";
    label.textContent = section.label;

    const value = document.createElement("div");
    value.className = "tile-state-card-value";
    value.textContent = section.value;

    row.appendChild(label);
    row.appendChild(value);
    body.appendChild(row);
  }
}
