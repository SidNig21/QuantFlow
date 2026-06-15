/**
 * Workflow region overlay (Goal 7) — live shell projector.
 *
 * Draws each Kernel workflow region as a SOFT boundary behind the tiles: a
 * rounded, dashed box around the workflow's tiles plus a header line with the
 * name and a counts/blockers summary. The boundary and all text come from the
 * Kernel `kernel.workflow.region_list` query via the shared renderer projector
 * (`@qf-renderer`); this module only turns that into SVG. It owns no state.
 *
 * Boxes are drawn in WORLD coordinates inside <g id="region-layer-content">,
 * which is transformed by the viewport pan/zoom — same contract as cables.
 */

import { formatWorkflowRegion } from "@qf-renderer/components/WorkflowRegion/workflow-region-view";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Pure: project Kernel regions into drawable models. Regions with no tiles
 * (null bounds) are dropped — an empty workflow has nothing to outline.
 *
 * @param {Array<object>} regions - kernel.workflow.region_list result
 * @returns {Array<{id:string,title:string,summary:string,objective:string,status:string,hasBlockers:boolean,blockedTaskIds:string[],bounds:{x:number,y:number,width:number,height:number}}>}
 */
export function getRegionRenderModels(regions) {
	if (!Array.isArray(regions)) return [];
	const models = [];
	for (const region of regions) {
		const model = formatWorkflowRegion(region);
		if (!model.bounds) continue;
		models.push({
			id: model.id,
			title: model.title,
			summary: model.summary,
			objective: model.objective,
			status: model.status,
			hasBlockers: model.hasBlockers,
			blockedTaskIds: model.blockedTaskIds,
			bounds: model.bounds,
		});
	}
	return models;
}

/** Truncate a string for the compact on-canvas line; full text lives in <title>. */
function truncate(text, max) {
	const value = String(text ?? "");
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Compact "which task is blocked" line, e.g. "⚠ blocked: k2, k7". */
export function blockedLine(blockedTaskIds) {
	const ids = Array.isArray(blockedTaskIds) ? blockedTaskIds : [];
	if (ids.length === 0) return "";
	const shown = ids.slice(0, 3).join(", ");
	const extra = ids.length > 3 ? ` +${ids.length - 3}` : "";
	return `⚠ blocked: ${shown}${extra}`;
}

/**
 * Render workflow region boxes into the region layer SVG, reconciling against
 * what is already drawn (create/update/remove by region id).
 *
 * @param {SVGElement} contentG - the <g> child of #region-layer
 * @param {Array<object>} regions - kernel.workflow.region_list result
 * @param {{panX:number,panY:number,zoom:number}} viewport
 */
export function renderWorkflowRegions(contentG, regions, viewport) {
	if (!contentG) return;
	const { panX, panY, zoom } = viewport;
	contentG.setAttribute("transform", `translate(${panX} ${panY}) scale(${zoom})`);

	const models = new Map();
	for (const model of getRegionRenderModels(regions)) {
		models.set(model.id, model);
	}

	// Remove regions that no longer exist.
	for (const node of Array.from(contentG.querySelectorAll("[data-region-id]"))) {
		const id = node.getAttribute("data-region-id");
		if (!models.has(id)) node.remove();
	}

	for (const [id, model] of models) {
		let group = contentG.querySelector(`g[data-region-id="${cssEscape(id)}"]`);
		if (!group) {
			group = createRegionGroup(id);
			contentG.appendChild(group);
		}
		updateRegionGroup(group, model);
	}
}

function createRegionGroup(id) {
	const g = document.createElementNS(SVG_NS, "g");
	g.setAttribute("data-region-id", id);
	g.setAttribute("class", "region-group");

	const box = document.createElementNS(SVG_NS, "rect");
	box.setAttribute("class", "region-box");
	box.setAttribute("rx", "18");
	box.setAttribute("ry", "18");
	g.appendChild(box);

	// Hover tooltip carries the full objective + blocked task ids when the
	// on-canvas text is truncated to stay compact/soft.
	const titleEl = document.createElementNS(SVG_NS, "title");
	titleEl.setAttribute("class", "region-title");
	g.appendChild(titleEl);

	const label = document.createElementNS(SVG_NS, "text");
	label.setAttribute("class", "region-label");
	g.appendChild(label);

	const objective = document.createElementNS(SVG_NS, "text");
	objective.setAttribute("class", "region-objective");
	g.appendChild(objective);

	const sub = document.createElementNS(SVG_NS, "text");
	sub.setAttribute("class", "region-sub");
	g.appendChild(sub);

	const blocked = document.createElementNS(SVG_NS, "text");
	blocked.setAttribute("class", "region-blocked-line");
	g.appendChild(blocked);

	return g;
}

function updateRegionGroup(group, model) {
	const { x, y, width, height } = model.bounds;
	group.setAttribute(
		"class",
		model.hasBlockers ? "region-group region-blocked" : "region-group",
	);

	const box = group.querySelector(".region-box");
	if (box) {
		box.setAttribute("x", String(x));
		box.setAttribute("y", String(y));
		box.setAttribute("width", String(Math.max(0, width)));
		box.setAttribute("height", String(Math.max(0, height)));
	}

	const blocked = blockedLine(model.blockedTaskIds);
	const objective = model.objective && model.objective !== "—" ? model.objective : "";

	// Full detail on hover so the on-canvas text can stay short and soft.
	const titleEl = group.querySelector(".region-title");
	if (titleEl) {
		const lines = [model.title];
		if (objective) lines.push(`Objective: ${objective}`);
		lines.push(`${model.status} · ${model.summary}`);
		if (blocked) lines.push(blocked);
		titleEl.textContent = lines.join("\n");
	}

	// Header block sits just inside the top-left of the soft box.
	const label = group.querySelector(".region-label");
	if (label) {
		label.setAttribute("x", String(x + 16));
		label.setAttribute("y", String(y + 24));
		label.textContent = model.title;
	}

	const objectiveEl = group.querySelector(".region-objective");
	if (objectiveEl) {
		objectiveEl.setAttribute("x", String(x + 16));
		objectiveEl.setAttribute("y", String(y + 41));
		objectiveEl.textContent = truncate(objective, 48);
	}

	const sub = group.querySelector(".region-sub");
	if (sub) {
		sub.setAttribute("x", String(x + 16));
		sub.setAttribute("y", String(y + 57));
		sub.textContent = `${model.status} · ${model.summary}`;
	}

	// Name which task is blocked (Goal 7 acceptance), only when blocked.
	const blockedEl = group.querySelector(".region-blocked-line");
	if (blockedEl) {
		blockedEl.setAttribute("x", String(x + 16));
		blockedEl.setAttribute("y", String(y + 73));
		blockedEl.textContent = blocked;
	}
}

function cssEscape(value) {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return String(value).replace(/[^\w-]/g, (c) => `\\${c}`);
}
