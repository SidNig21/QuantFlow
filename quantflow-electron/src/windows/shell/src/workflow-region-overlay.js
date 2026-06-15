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
 * @returns {Array<{id:string,title:string,summary:string,objective:string,status:string,hasBlockers:boolean,bounds:{x:number,y:number,width:number,height:number}}>}
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
			bounds: model.bounds,
		});
	}
	return models;
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

	const label = document.createElementNS(SVG_NS, "text");
	label.setAttribute("class", "region-label");
	g.appendChild(label);

	const sub = document.createElementNS(SVG_NS, "text");
	sub.setAttribute("class", "region-sub");
	g.appendChild(sub);

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

	// Header sits just inside the top-left of the soft box.
	const label = group.querySelector(".region-label");
	if (label) {
		label.setAttribute("x", String(x + 16));
		label.setAttribute("y", String(y + 24));
		label.textContent = model.title;
	}

	const sub = group.querySelector(".region-sub");
	if (sub) {
		sub.setAttribute("x", String(x + 16));
		sub.setAttribute("y", String(y + 42));
		const blockers = model.hasBlockers ? "  ⚠ blocked" : "";
		sub.textContent = `${model.status} · ${model.summary}${blockers}`;
	}
}

function cssEscape(value) {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return String(value).replace(/[^\w-]/g, (c) => `\\${c}`);
}
