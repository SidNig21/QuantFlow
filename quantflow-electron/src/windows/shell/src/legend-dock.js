export const LEGEND_PREF_KEYS = {
	density: "legendV1.density",
	spawnMode: "legendV1.spawnMode",
};

/** Built-in seed — runtime list comes from main via getRecipes(); keep spawn ids in sync with DOCK_SPAWN_ACTOR_IDS. */
export const LEGEND_RECIPES = [];

export { mapHealthLevelToBadge, resolveRecipeCapabilityId, resolveReadinessBadge } from "./legend-readiness.js";

const TEMPLATE_ID = "rl-training";

const ICONS = {
	hermes: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2 L2 7.5 L6.5 9 L8 13.5 L14 2 M6.5 9 L9 7"></path></svg>`,
	codex: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5 H13 A1.5 1.5 0 0 1 14.5 6.5 V11 A1.5 1.5 0 0 1 13 12.5 H3 A1.5 1.5 0 0 1 1.5 11 V6.5 A1.5 1.5 0 0 1 3 5 Z M8 2 V5"></path><path d="M5 9 a 0.9 0.9 0 1 1 1.8 0 a 0.9 0.9 0 1 1 -1.8 0" fill="currentColor" stroke="none"></path><path d="M9.2 9 a 0.9 0.9 0 1 1 1.8 0 a 0.9 0.9 0 1 1 -1.8 0" fill="currentColor" stroke="none"></path><path d="M1.5 8 H0.5 M14.5 8 H15.5"></path></svg>`,
	claude: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 1.5 L14.5 7 L11 10.5 L8 7.5 L4.5 11 L1.5 8 L7 2.5 Z M5.5 4 L11 9.5"></path></svg>`,
	eve: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5"></circle><path d="M8 4.5 V8 L10.5 10"></path></svg>`,
	puffer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 1.5 L3 9 H7 L5.5 14.5 L11 7 H7 Z"></path></svg>`,
	agentos: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5"></circle><path d="M8 5.5 V8.5 M8 8.5 L10.5 10.5"></path><circle cx="8" cy="5.5" r="0.8" fill="currentColor" stroke="none"></circle></svg>`,
	python: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5 L1.5 8 L5 12.5 M11 3.5 L14.5 8 L11 12.5 M9.5 2.5 L6.5 13.5"></path></svg>`,
	shell: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4 L5.5 7.5 L2 11"></path><path d="M7 11 H13.5"></path></svg>`,
	memory: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3.5 H12 A1.5 1.5 0 0 1 13.5 5 V11 A1.5 1.5 0 0 1 12 12.5 H4 A1.5 1.5 0 0 1 2.5 11 V5 A1.5 1.5 0 0 1 4 3.5 Z"></path><path d="M5 6.5 H11 M5 9.5 H9"></path></svg>`,
	legend: `<svg class="lv1-dock__glyph" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9 L7 5 L11 9 L15 5"></path><path d="M3 13 L7 9 L11 13 L15 9" opacity="0.45"></path></svg>`,
	activity: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9 H5 L6.5 4 L9.5 12 L11 8 H14"></path></svg>`,
	connect: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="3.5" cy="8" r="1.7"></circle><circle cx="12.5" cy="8" r="1.7"></circle><path d="M5.2 8 H10.8"></path></svg>`,
	spawn: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5"></circle><path d="M8 5.4 V10.6 M5.4 8 H10.6"></path></svg>`,
	play: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2 L12 7 L3 12 Z"></path></svg>`,
	pause: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="3" height="8"></rect><rect x="8" y="3" width="3" height="8"></rect></svg>`,
	densityCompact: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2 4 H12"></path><path d="M2 7 H12"></path><path d="M2 10 H12"></path></svg>`,
	densityComfortable: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2 3 H12"></path><path d="M2 6.5 H12" stroke-width="2.2"></path><path d="M2 10 H12"></path></svg>`,
	spawnCenter: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="7" cy="7" r="5"></circle><circle cx="7" cy="7" r="1.4" fill="currentColor"></circle></svg>`,
	spawnClick: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11"></path><circle cx="7" cy="7" r="2.2"></circle></svg>`,
};

function safeGet(storage, key) {
	try {
		return storage?.getItem?.(key) ?? null;
	} catch {
		return null;
	}
}

function safeSet(storage, key, value) {
	try {
		storage?.setItem?.(key, value);
	} catch {
		// Preference persistence is best-effort; visual state still updates.
	}
}

export function normalizeLegendDensity(value) {
	return value === "comfortable" ? "comfortable" : "compact";
}

export function normalizeLegendSpawnMode(value) {
	return value === "click" ? "click" : "center";
}

export function getCommenceState(state) {
	if (state.running) return "running";
	if (state.armedTemplate === TEMPLATE_ID) return "armed";
	return "workflow";
}

export function getCommenceCopy(state) {
	const commenceState = getCommenceState(state);
	if (commenceState === "running") {
		return {
			state: "running",
			label: "Running",
			subLabel: "Workers live",
			compactLabel: "LIVE",
			icon: "pause",
			ariaDisabled: "true",
		};
	}
	if (commenceState === "armed") {
		return {
			state: "armed",
			label: "Commence",
			subLabel: "Start armed workers",
			compactLabel: "GO",
			icon: "play",
			ariaDisabled: "false",
		};
	}
	return {
		state: "workflow",
		label: "Run Workflow",
		subLabel: "Describe a task for Hermes",
		compactLabel: "RUN",
		icon: "play",
		ariaDisabled: "false",
	};
}

export function getDisabledRecipeIds(state, recipes = LEGEND_RECIPES) {
	const ids = new Set(recipes
		.filter((recipe) => recipe.disabled)
		.map((recipe) => recipe.id));
	if (state.armedTemplate === TEMPLATE_ID && state.running) {
		ids.add("hermes");
		ids.add("puffer");
	}
	return ids;
}

export function getSpawnModeChipText(spawnMode) {
	return spawnMode === "click"
		? "spawn - click-to-place"
		: "spawn - viewport center";
}

export function getToggleContent(state) {
	return {
		density: {
			icon: state.density === "comfortable" ? "densityComfortable" : "densityCompact",
			label: state.density === "comfortable" ? "Density - compact" : "Density - comfortable",
			title: state.density === "comfortable" ? "Compact density" : "Comfortable density",
			value: state.density,
		},
		spawnMode: {
			icon: state.spawnMode === "click" ? "spawnClick" : "spawnCenter",
			label: state.spawnMode === "click" ? "Spawn - click-to-place" : "Spawn - center",
			title: state.spawnMode === "click" ? "Viewport center" : "Click-to-place",
			value: state.spawnMode,
		},
	};
}

export function getLegendRootAttributes(state) {
	return {
		"data-density": state.density,
		"data-armed-template": state.armedTemplate ?? "",
		"data-running": state.running ? "true" : "false",
		"data-spawn-mode": state.spawnMode,
	};
}

export function createLegendState(options = {}) {
	const storage = options.storage ?? globalThis.localStorage;
	const listeners = new Set();
	const state = {
		density: normalizeLegendDensity(safeGet(storage, LEGEND_PREF_KEYS.density)),
		spawnMode: normalizeLegendSpawnMode(safeGet(storage, LEGEND_PREF_KEYS.spawnMode)),
		armedTemplate: null,
		running: false,
		hoveredRecipe: null,
		pendingRecipe: null,
	};

	function emit() {
		const snapshot = api.getSnapshot();
		for (const listener of listeners) listener(snapshot);
		options.onChange?.(snapshot);
	}

	function update(patch, persist = false) {
		Object.assign(state, patch);
		if (persist && Object.hasOwn(patch, "density")) {
			safeSet(storage, LEGEND_PREF_KEYS.density, state.density);
		}
		if (persist && Object.hasOwn(patch, "spawnMode")) {
			safeSet(storage, LEGEND_PREF_KEYS.spawnMode, state.spawnMode);
		}
		emit();
	}

	const api = {
		getSnapshot() {
			return { ...state };
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		setDensity(value) {
			update({ density: normalizeLegendDensity(value) }, true);
		},
		toggleDensity() {
			api.setDensity(state.density === "compact" ? "comfortable" : "compact");
		},
		setSpawnMode(value) {
			update({ spawnMode: normalizeLegendSpawnMode(value), pendingRecipe: null }, true);
		},
		toggleSpawnMode() {
			api.setSpawnMode(state.spawnMode === "center" ? "click" : "center");
		},
		toggleTemplate(templateId = TEMPLATE_ID) {
			if (state.armedTemplate === templateId) {
				update({ armedTemplate: null, running: false, pendingRecipe: null });
				return;
			}
			update({ armedTemplate: templateId, running: false, pendingRecipe: null });
		},
		commence() {
			if (getCommenceState(state) !== "armed") return false;
			update({ running: true, pendingRecipe: null });
			return true;
		},
		activateRecipe(recipeId, recipes = LEGEND_RECIPES) {
			if (getDisabledRecipeIds(state, recipes).has(recipeId)) return false;
			const pendingRecipe = state.spawnMode === "click" ? recipeId : null;
			state.pendingRecipe = pendingRecipe;
			return {
				recipeId,
				spawnMode: state.spawnMode,
				pendingRecipe,
			};
		},
		clearPendingRecipe() {
			state.pendingRecipe = null;
		},
	};

	return api;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function recipeButton(recipe, state, readinessBadge = "red", recipes = LEGEND_RECIPES) {
	const disabled = getDisabledRecipeIds(state, recipes).has(recipe.id);
	const recipeState = disabled ? "disabled" : "idle";
	const runtime = recipe.runtimeTarget === "agentos"
		? `AgentOS / ${recipe.agentosSoftware ?? "agent"}`
		: "Local / terminal";
	return `
		<button
			class="lv1-recipe"
			data-recipe="${escapeHtml(recipe.id)}"
			data-role-type="${escapeHtml(recipe.type ?? recipe.id)}"
			data-state="${recipeState}"
			data-role-color="${escapeHtml(recipe.color)}"
			data-runtime="${escapeHtml(runtime)}"
			data-readiness="${readinessBadge}"
			style="--role-color: ${escapeHtml(recipe.color)}"
			type="button"
			${disabled ? "disabled" : ""}
			aria-label="${disabled ? "Disabled" : "Spawn"} ${escapeHtml(recipe.name)} (${readinessBadge} readiness)"
			title="${escapeHtml(recipe.name)} - ${escapeHtml(runtime)}"
		>
			<span class="lv1-recipe__disc">${ICONS[recipe.icon] ?? ICONS.shell}</span>
			<span class="lv1-recipe__copy">
				<span class="lv1-recipe__name">${escapeHtml(recipe.name)}</span>
				<span class="lv1-recipe__desc">${escapeHtml(runtime)}</span>
			</span>
			<span class="lv1-recipe__badge lv1-recipe__badge--${readinessBadge}" aria-hidden="true"></span>
			<span class="lv1-recipe__tip" role="tooltip">
				<span class="lv1-recipe__tip-name">${escapeHtml(recipe.name)}</span>
				<span class="lv1-recipe__tip-desc">${escapeHtml(runtime)}</span>
			</span>
		</button>
	`;
}

export function renderDockHtml(state, recipes = LEGEND_RECIPES, readinessByRecipeId = {}) {
	const spawnRecipes = recipes.filter((recipe) => recipe.group === "spawn");
	const agentsEmpty = spawnRecipes.length === 0;

	return `
		<header class="lv1-dock__header">
			<span class="lv1-dock__brand">QF</span>
			<span class="lv1-dock__heading"><span>Dock</span><small>verified actors only</small></span>
			<button class="lv1-dock__tidy" type="button" data-action="tidy-grid" title="Tidy tiles to grid">Tidy</button>
		</header>
		<div class="lv1-dock__body">
			<section class="lv1-dock__section lv1-dock__section--agents" data-group="agents">
				<div class="lv1-dock__section-head">
					<span>Agents</span>
					<span>${spawnRecipes.length}</span>
				</div>
				<div class="lv1-dock__section-sub">${agentsEmpty
		? "No verified agents yet — promote after canvas proof"
		: "Click an agent to start a new tile"}</div>
				<div class="lv1-dock__scroll" data-scroll-region="agents">
					${agentsEmpty
		? `<div class="lv1-dock__empty" role="status">
						<span class="lv1-dock__empty-title">Runtime foundation ready</span>
						<span class="lv1-dock__empty-copy">Actors appear here one at a time after they pass live canvas proof in the AgentOS stack.</span>
					</div>`
		: spawnRecipes.map((recipe) => recipeButton(
			recipe,
			state,
			readinessByRecipeId[recipe.id] ?? "red",
			recipes,
		)).join("")}
				</div>
			</section>
			<section class="lv1-dock__section lv1-dock__section--templates" data-group="templates">
				<div class="lv1-dock__section-head">
					<span>Templates</span>
					<span>0</span>
				</div>
				<div class="lv1-dock__scroll" data-scroll-region="templates">
					<div class="lv1-dock__empty lv1-dock__empty--muted" role="status">
						<span class="lv1-dock__empty-copy">Workflow templates return after agent proofs land.</span>
					</div>
				</div>
			</section>
		</div>
		<footer class="lv1-dock__footer">
			<span>Fresh run per tile.</span>
			<span>Close = end run.</span>
		</footer>
	`;
}

function applyRootAttributes(root, state) {
	for (const [name, value] of Object.entries(getLegendRootAttributes(state))) {
		root.setAttribute(name, value);
	}
}

function bindDockEvents(root, stateStore, options = {}) {
	const getRecipes = options.getRecipes ?? (() => LEGEND_RECIPES);

	for (const button of root.querySelectorAll(".lv1-recipe")) {
		button.addEventListener("click", (event) => {
			const recipeId = button.getAttribute("data-recipe");
			if (!recipeId) return;
			const recipes = getRecipes();
			const result = stateStore.activateRecipe(recipeId, recipes);
			if (!result) return;
			button.dataset.state = "active";
			window.setTimeout?.(() => {
				if (button.isConnected && button.dataset.state === "active") {
					button.dataset.state = "idle";
				}
			}, 600);
			options.onRecipeActivate?.({
				recipeId,
				recipe: recipes.find((recipe) => recipe.id === recipeId) ?? null,
				state: stateStore.getSnapshot(),
				spawnMode: result.spawnMode,
				event,
			});
		});
	}

	root.querySelector('[data-action="add-agent"]')?.addEventListener("click", () => {
		options.onAddAgent?.();
	});

	root.querySelector('[data-action="tidy-grid"]')?.addEventListener("click", () => {
		options.onTidyGrid?.();
	});

	root.querySelector(".lv1-template")?.addEventListener("click", () => {
		stateStore.toggleTemplate(TEMPLATE_ID);
	});

	root.querySelector(".lv1-commence")?.addEventListener("click", () => {
		const commenceState = getCommenceState(stateStore.getSnapshot());
		if (commenceState === "armed") {
			stateStore.commence();
			return;
		}
		if (commenceState === "workflow") {
			options.onRunWorkflow?.();
		}
	});

	root.querySelector(".lv1-toggle--density")?.addEventListener("click", () => {
		stateStore.toggleDensity();
	});

	root.querySelector(".lv1-toggle--spawn")?.addEventListener("click", () => {
		stateStore.toggleSpawnMode();
	});
}

export function createLegendDock(options) {
	const {
		document,
		container,
		storage = globalThis.localStorage,
		getTileCount = () => 0,
		getRecipes = () => LEGEND_RECIPES,
		getReadinessByRecipeId = () => ({}),
		onRecipeActivate = null,
		onRunWorkflow = null,
		onAddAgent = null,
		onTidyGrid = null,
	} = options;
	if (!document || !container) {
		throw new Error("createLegendDock requires document and container");
	}

	const stateStore = createLegendState({ storage });
	const root = document.createElement("aside");
	root.className = "lv1-dock";
	root.setAttribute("role", "toolbar");
	root.setAttribute("aria-label", "Spawn dock");

	const chip = document.createElement("div");
	chip.className = "lv1-spawn-mode-chip";

	const emptyHint = document.createElement("div");
	emptyHint.className = "lv1-empty-canvas";
	emptyHint.innerHTML = `
		<div class="lv1-empty-canvas__title">Empty canvas</div>
		<div class="lv1-empty-canvas__sub">Click a spawn recipe to drop a tile - arm a template to chain</div>
	`;

	function updateEmptyHint() {
		emptyHint.hidden = Number(getTileCount()) > 0;
	}

	function render(snapshot = stateStore.getSnapshot()) {
		applyRootAttributes(root, snapshot);
		root.innerHTML = renderDockHtml(snapshot, getRecipes(), getReadinessByRecipeId());
		chip.textContent = getSpawnModeChipText(snapshot.spawnMode);
		bindDockEvents(root, stateStore, {
			onRecipeActivate,
			onRunWorkflow,
			onAddAgent,
			onTidyGrid,
			getRecipes,
		});
		updateEmptyHint();
	}

	stateStore.subscribe(render);
	render();
	container.append(root, chip, emptyHint);

	return {
		root,
		chip,
		emptyHint,
		state: stateStore,
		render,
		updateEmptyHint,
		refresh() {
			render(stateStore.getSnapshot());
		},
	};
}
