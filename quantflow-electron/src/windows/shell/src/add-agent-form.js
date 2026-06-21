import { LEGEND_ICON_OPTIONS } from "./legend-readiness.js";

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function fieldRow(label, body) {
	return `
		<label class="lv1-add-form__field">
			<span class="lv1-add-form__label">${escapeHtml(label)}</span>
			${body}
		</label>
	`;
}

// Eve defaults (R8.5): a persona is a role that runs `npm run dev` in its package
// folder via a local PowerShell PTY (Windows has Node 24). No harnessKind, no endpoint —
// that was the broken Mode-2 leak. See docs/v4/SPAWN_MODEL.md + EVE_SETUP.md.
const EVE_DEFAULTS = Object.freeze({
	commandTemplate: "npm run dev",
	runtimeTarget: "windows-pty",
	defaultShell: "powershell",
});

export function createAddAgentForm(options = {}) {
	const {
		document,
		onSubmit = null,
		onCancel = null,
	} = options;
	if (!document) throw new Error("createAddAgentForm requires document");

	const overlay = document.createElement("div");
	overlay.className = "lv1-add-form-overlay";
	overlay.hidden = true;

	const dialog = document.createElement("form");
	dialog.className = "lv1-add-form";
	dialog.innerHTML = `
		<header class="lv1-add-form__header">
			<h2 class="lv1-add-form__title">Add agent / tool</h2>
			<p class="lv1-add-form__hint">Writes a role to the registry — legend click opens a terminal tile. No rebuild.</p>
		</header>
		<div class="lv1-add-form__body">
			${fieldRow("Kind", `
				<select name="kind" class="lv1-add-form__input">
					<option value="cli" selected>CLI role</option>
					<option value="eve">Eve agent</option>
				</select>
			`)}
			${fieldRow("Id", `<input class="lv1-add-form__input" name="id" required pattern="[a-z][a-z0-9-]*" placeholder="quantflow-eve" />`)}
			${fieldRow("Name", `<input class="lv1-add-form__input" name="name" required placeholder="QuantFlow Eve" />`)}
			${fieldRow("Description", `<input class="lv1-add-form__input" name="description" placeholder="Eve · OpenCode" />`)}
			${fieldRow("Folder (cwd)", `<input class="lv1-add-form__input" name="cwd" data-eve-required placeholder="C:\\Users\\you\\quantflow-eve" />`)}
			${fieldRow("Command template", `<input class="lv1-add-form__input" name="commandTemplate" placeholder="npm run dev" />`)}
			${fieldRow("Runtime target", `
				<select name="runtimeTarget" class="lv1-add-form__input">
					<option value="herdr-wsl" selected>herdr-wsl</option>
					<option value="windows-pty">windows-pty</option>
				</select>
			`)}
			${fieldRow("Shell", `
				<select name="defaultShell" class="lv1-add-form__input">
					<option value="auto" selected>auto</option>
					<option value="powershell">powershell</option>
					<option value="wsl">wsl</option>
					<option value="shell">shell</option>
				</select>
			`)}
			${fieldRow("Model hint", `<input class="lv1-add-form__input" name="modelHint" data-eve-only placeholder="deepseek-v4-pro" hidden />`)}
			${fieldRow("Icon", `
				<select name="icon" class="lv1-add-form__input">
					${LEGEND_ICON_OPTIONS.map((icon) => `<option value="${icon}">${icon}</option>`).join("")}
				</select>
			`)}
			${fieldRow("Color", `<input class="lv1-add-form__input" name="color" type="color" value="#6366f1" />`)}
			${fieldRow("Startup prompt", `<textarea class="lv1-add-form__input lv1-add-form__textarea" name="startupPrompt" rows="2" data-cli-only placeholder="Optional activation prompt"></textarea>`)}
		</div>
		<footer class="lv1-add-form__footer">
			<button class="lv1-add-form__btn lv1-add-form__btn--ghost" type="button" data-action="cancel">Cancel</button>
			<button class="lv1-add-form__btn lv1-add-form__btn--primary" type="submit">Save recipe</button>
		</footer>
	`;

	overlay.appendChild(dialog);
	document.body.appendChild(overlay);

	const kindSelect = dialog.querySelector('select[name="kind"]');
	const cliFields = [...dialog.querySelectorAll("[data-cli-only]")];
	const eveFields = [...dialog.querySelectorAll("[data-eve-only]")];
	const commandInput = dialog.querySelector('input[name="commandTemplate"]');
	const runtimeSelect = dialog.querySelector('select[name="runtimeTarget"]');
	const shellSelect = dialog.querySelector('select[name="defaultShell"]');

	function syncKindFields() {
		const isEve = kindSelect.value === "eve";
		for (const field of cliFields) field.hidden = isEve;
		for (const field of eveFields) field.hidden = !isEve;
		// Prefill the proven Eve shape so the operator can't accidentally make a
		// broken (no-command / wrong-shell) Eve row.
		if (isEve) {
			if (!commandInput.value.trim()) commandInput.value = EVE_DEFAULTS.commandTemplate;
			runtimeSelect.value = EVE_DEFAULTS.runtimeTarget;
			shellSelect.value = EVE_DEFAULTS.defaultShell;
		}
	}

	kindSelect.addEventListener("change", syncKindFields);
	syncKindFields();

	function close() {
		overlay.hidden = true;
		dialog.reset();
		syncKindFields();
	}

	dialog.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
		close();
		onCancel?.();
	});

	overlay.addEventListener("click", (event) => {
		if (event.target === overlay) {
			close();
			onCancel?.();
		}
	});

	dialog.addEventListener("submit", async (event) => {
		event.preventDefault();
		const data = new FormData(dialog);
		const kind = String(data.get("kind") ?? "cli");
		const isEve = kind === "eve";
		const cwd = String(data.get("cwd") ?? "").trim() || undefined;
		// An Eve row needs a folder; without it `npm run dev` runs in the wrong place.
		if (isEve && !cwd) {
			dialog.querySelector('input[name="cwd"]')?.focus();
			return;
		}
		const payload = {
			id: String(data.get("id") ?? "").trim(),
			name: String(data.get("name") ?? "").trim(),
			description: String(data.get("description") ?? "").trim() || undefined,
			icon: String(data.get("icon") ?? "shell"),
			color: String(data.get("color") ?? "#6366f1"),
			cwd,
			commandTemplate: String(data.get("commandTemplate") ?? "").trim()
				|| (isEve ? EVE_DEFAULTS.commandTemplate : undefined),
			runtimeTarget: String(data.get("runtimeTarget") ?? "herdr-wsl"),
			defaultShell: String(data.get("defaultShell") ?? "auto"),
			type: isEve ? "agent" : "tool",
		};
		if (isEve) {
			payload.modelHint = String(data.get("modelHint") ?? "").trim() || undefined;
		} else {
			payload.startupPrompt = String(data.get("startupPrompt") ?? "").trim() || undefined;
		}
		// Note: no harnessKind / endpoint — the legend is Mode 1 only (terminal summon).
		await onSubmit?.(payload);
		close();
	});

	return {
		root: overlay,
		open() {
			overlay.hidden = false;
			dialog.querySelector('input[name="id"]')?.focus();
		},
		close,
	};
}
