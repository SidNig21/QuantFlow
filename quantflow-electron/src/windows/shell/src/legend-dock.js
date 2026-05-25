export const LEGEND_PREF_KEYS = {
	density: "legendV1.density",
	spawnMode: "legendV1.spawnMode",
};

export const LEGEND_RECIPES = [
	{
		id: "hermes",
		roleId: "hermes",
		group: "agents",
		name: "Hermes",
		description: "Sync · gossip rooms",
		color: "#06b6d4",
		icon: "hermes",
	},
	{
		id: "codex",
		roleId: "codex",
		group: "agents",
		name: "Codex CLI",
		description: "Local Codex agent",
		color: "#38bdf8",
		icon: "codex",
	},
	{
		id: "claude",
		roleId: "claude-worker",
		group: "agents",
		name: "Claude Code",
		description: "Implementation agent",
		color: "#f97316",
		icon: "claude",
	},
	{
		id: "puffer",
		roleId: "puffer",
		group: "workers",
		name: "PufferLib worker",
		description: "RL training · dumb",
		color: "#f59e0b",
		icon: "puffer",
	},
	{
		id: "python",
		roleId: "python",
		group: "workers",
		name: "Python script",
		description: "One-shot script",
		color: "#6366f1",
		icon: "python",
	},
	{
		id: "shell",
		roleId: "shell",
		group: "shell",
		name: "Generic CLI",
		description: "Plain shell terminal",
		color: "#64748b",
		icon: "shell",
	},
];

const GROUPS = [
	{ id: "agents", label: "Agents" },
	{ id: "workers", label: "Workers" },
	{ id: "shell", label: "Shell" },
];

const TEMPLATE_ID = "rl-training";

const ICONS = {
	hermes: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2 L2 7.5 L6.5 9 L8 13.5 L14 2 M6.5 9 L9 7"></path></svg>`,
	codex: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5 H13 A1.5 1.5 0 0 1 14.5 6.5 V11 A1.5 1.5 0 0 1 13 12.5 H3 A1.5 1.5 0 0 1 1.5 11 V6.5 A1.5 1.5 0 0 1 3 5 Z M8 2 V5"></path><path d="M5 9 a 0.9 0.9 0 1 1 1.8 0 a 0.9 0.9 0 1 1 -1.8 0" fill="currentColor" stroke="none"></path><path d="M9.2 9 a 0.9 0.9 0 1 1 1.8 0 a 0.9 0.9 0 1 1 -1.8 0" fill="currentColor" stroke="none"></path><path d="M1.5 8 H0.5 M14.5 8 H15.5"></path></svg>`,
	claude: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 1.5 L14.5 7 L11 10.5 L8 7.5 L4.5 11 L1.5 8 L7 2.5 Z M5.5 4 L11 9.5"></path></svg>`,
	puffer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 1.5 L3 9 H7 L5.5 14.5 L11 7 H7 Z"></path></svg>`,
	python: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.5 L1.5 8 L5 12.5 M11 3.5 L14.5 8 L11 12.5 M9.5 2.5 L6.5 13.5"></path></svg>`,
	shell: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4 L5.5 7.5 L2 11"></path><path d="M7 11 H13.5"></path></svg>`,
	legend: `<svg class="lv1-dock__glyph" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9 L7 5 L11 9 L15 5"></path><path d="M3 13 L7 9 L11 13 L15 9" opacity="0.45"></path></svg>`,
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
	return "idle";
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
		state: "idle",
		label: "Commence",
		subLabel: "Arm a template first",
		compactLabel: "GO",
		icon: "play",
		ariaDisabled: "true",
	};
}

export function getDisabledRecipeIds(state) {
	if (state.armedTemplate === TEMPLATE_ID && state.running) {
		return new Set(["hermes", "puffer"]);
	}
	return new Set();
}

export function getSpawnModeChipText(spawnMode) {
	return spawnMode === "click"
		? "spawn · click-to-place"
		: "spawn · viewport center";
}

export function getToggleContent(state) {
	return {
		density: {
			icon: state.density === "comfortable" ? "densityComfortable" : "densityCompact",
			label: state.density === "comfortable" ? "Density · compact" : "Density · comfortable",
			title: state.density === "comfortable" ? "Compact density" : "Comfortable density",
			value: state.density,
		},
		spawnMode: {
			icon: state.spawnMode === "click" ? "spawnClick" : "spawnCenter",
			label: state.spawnMode === "click" ? "Spawn · click-to-place" : "Spawn · center",
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
		activateRecipe(recipeId) {
			if (getDisabledRecipeIds(state).has(recipeId)) return false;
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

function recipeButton(recipe, state) {
	const disabled = getDisabledRecipeIds(state).has(recipe.id);
	const recipeState = disabled ? "disabled" : "idle";
	return `
		<button
			class="lv1-recipe"
			data-recipe="${escapeHtml(recipe.id)}"
			data-state="${recipeState}"
			data-role-color="${escapeHtml(recipe.color)}"
			style="--role-color: ${escapeHtml(recipe.color)}"
			type="button"
			aria-label="Spawn ${escapeHtml(recipe.name)}"
			title="${escapeHtml(recipe.name)} — ${escapeHtml(recipe.description)}"
		>
			<span class="lv1-recipe__disc">${ICONS[recipe.icon]}</span>
			<span class="lv1-recipe__copy">
				<span class="lv1-recipe__name">${escapeHtml(recipe.name)}</span>
				<span class="lv1-recipe__desc">${escapeHtml(recipe.description)}</span>
			</span>
			<span class="lv1-recipe__tip" role="tooltip">
				<span class="lv1-recipe__tip-name">${escapeHtml(recipe.name)}</span>
				<span class="lv1-recipe__tip-desc">${escapeHtml(recipe.description)}</span>
			</span>
		</button>
	`;
}

function renderDockHtml(state) {
	const commence = getCommenceCopy(state);
	const toggles = getToggleContent(state);
	const armed = state.armedTemplate === TEMPLATE_ID;
	const groups = GROUPS.map((group) => `
		<section class="lv1-group" data-group="${group.id}">
			<div class="lv1-group__label">${group.label}</div>
			${LEGEND_RECIPES.filter((recipe) => recipe.group === group.id)
				.map((recipe) => recipeButton(recipe, state)).join("")}
		</section>
	`).join("");

	return `
		<header class="lv1-dock__header">
			<span class="lv1-dock__title">Legend</span>
			<span class="lv1-dock__eyebrow">spawn</span>
			${ICONS.legend}
		</header>
		<div class="lv1-dock__body">
			${groups}
			<section class="lv1-group lv1-group--templates" data-group="templates">
				<div class="lv1-group__label lv1-group__label--templates">
					<span>Templates</span>
					<span class="lv1-group__count">1</span>
					<span class="lv1-group__compact-label">TMPL</span>
				</div>
				<button
					class="lv1-template"
					data-template="${TEMPLATE_ID}"
					${armed ? "data-armed" : ""}
					type="button"
					aria-pressed="${armed ? "true" : "false"}"
				>
					<span class="lv1-template__glyph" aria-hidden="true">
						<span class="lv1-template__glyph-box lv1-template__glyph-box--hermes"></span>
						<span class="lv1-template__glyph-box lv1-template__glyph-box--puffer"></span>
					</span>
					<span class="lv1-template__copy">
						<span class="lv1-template__name">RL Training</span>
						<span class="lv1-template__summary">Hermes ↔ PufferLib · paper trade loop</span>
						<span class="lv1-template__meta">2 tiles · 1 string</span>
					</span>
					<span class="lv1-template__compact-label">RL</span>
					<span class="lv1-template__armed-badge">● ARMED</span>
				</button>
			</section>
		</div>
		<footer class="lv1-dock__footer">
			<button
				class="lv1-commence"
				data-state="${commence.state}"
				type="button"
				aria-disabled="${commence.ariaDisabled}"
			>
				<span class="lv1-commence__icon">${ICONS[commence.icon]}</span>
				<span class="lv1-commence__copy">
					<span class="lv1-commence__label">${commence.label}</span>
					<span class="lv1-commence__sub">${commence.subLabel}</span>
				</span>
				<span class="lv1-commence__compact-label">${commence.compactLabel}</span>
			</button>
			<div class="lv1-dock__toggles">
				<button
					class="lv1-toggle lv1-toggle--density"
					data-density-value="${toggles.density.value}"
					type="button"
					title="${toggles.density.title}"
					aria-label="${toggles.density.title}"
				>
					${ICONS[toggles.density.icon]}
					<span class="lv1-toggle__label">${toggles.density.label}</span>
				</button>
				<button
					class="lv1-toggle lv1-toggle--spawn"
					data-spawn-value="${toggles.spawnMode.value}"
					type="button"
					title="${toggles.spawnMode.title}"
					aria-label="${toggles.spawnMode.title}"
				>
					${ICONS[toggles.spawnMode.icon]}
					<span class="lv1-toggle__label">${toggles.spawnMode.label}</span>
				</button>
			</div>
		</footer>
	`;
}

function applyRootAttributes(root, state) {
	for (const [name, value] of Object.entries(getLegendRootAttributes(state))) {
		root.setAttribute(name, value);
	}
}

function bindDockEvents(root, stateStore, options = {}) {
	for (const button of root.querySelectorAll(".lv1-recipe")) {
		button.addEventListener("click", (event) => {
			const recipeId = button.getAttribute("data-recipe");
			if (!recipeId) return;
			const result = stateStore.activateRecipe(recipeId);
			if (!result) return;
			button.dataset.state = "active";
			window.setTimeout?.(() => {
				if (button.isConnected && button.dataset.state === "active") {
					button.dataset.state = "idle";
				}
			}, 600);
			options.onRecipeActivate?.({
				recipeId,
				recipe: LEGEND_RECIPES.find((recipe) => recipe.id === recipeId) ?? null,
				state: stateStore.getSnapshot(),
				spawnMode: result.spawnMode,
				event,
			});
		});
	}

	root.querySelector(".lv1-template")?.addEventListener("click", () => {
		stateStore.toggleTemplate(TEMPLATE_ID);
	});

	root.querySelector(".lv1-commence")?.addEventListener("click", () => {
		stateStore.commence();
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
		onRecipeActivate = null,
	} = options;
	if (!document || !container) {
		throw new Error("createLegendDock requires document and container");
	}

	const stateStore = createLegendState({ storage });
	const root = document.createElement("aside");
	root.className = "lv1-dock";
	root.setAttribute("role", "toolbar");
	root.setAttribute("aria-label", "Spawn legend");

	const chip = document.createElement("div");
	chip.className = "lv1-spawn-mode-chip";

	const emptyHint = document.createElement("div");
	emptyHint.className = "lv1-empty-canvas";
	emptyHint.innerHTML = `
		<div class="lv1-empty-canvas__title">Empty canvas</div>
		<div class="lv1-empty-canvas__sub">Click a spawn recipe to drop a tile · arm a template to chain</div>
	`;

	function updateEmptyHint() {
		emptyHint.hidden = Number(getTileCount()) > 0;
	}

	function render(snapshot = stateStore.getSnapshot()) {
		applyRootAttributes(root, snapshot);
		root.innerHTML = renderDockHtml(snapshot);
		chip.textContent = getSpawnModeChipText(snapshot.spawnMode);
		bindDockEvents(root, stateStore, { onRecipeActivate });
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
	};
}
