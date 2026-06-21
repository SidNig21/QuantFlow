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
			<p class="lv1-add-form__hint">Writes config to the role registry — no rebuild.</p>
		</header>
		<div class="lv1-add-form__body">
			${fieldRow("Kind", `
				<select name="kind" class="lv1-add-form__input">
					<option value="cli" selected>CLI role</option>
					<option value="eve">Eve package</option>
				</select>
			`)}
			${fieldRow("Id", `<input class="lv1-add-form__input" name="id" required pattern="[a-z][a-z0-9-]*" placeholder="odds-scraper" />`)}
			${fieldRow("Name", `<input class="lv1-add-form__input" name="name" required placeholder="Odds Scraper" />`)}
			${fieldRow("Description", `<input class="lv1-add-form__input" name="description" placeholder="one-shot script" />`)}
			${fieldRow("Command template", `<input class="lv1-add-form__input" name="commandTemplate" data-cli-only placeholder="python" />`)}
			${fieldRow("Runtime target", `
				<select name="runtimeTarget" class="lv1-add-form__input" data-cli-only>
					<option value="herdr-wsl" selected>herdr-wsl</option>
					<option value="windows-pty">windows-pty</option>
				</select>
			`)}
			${fieldRow("Eve endpoint", `<input class="lv1-add-form__input" name="endpoint" data-eve-only placeholder="http://127.0.0.1:3000" hidden />`)}
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

	function syncKindFields() {
		const isEve = kindSelect.value === "eve";
		for (const field of cliFields) field.hidden = isEve;
		for (const field of eveFields) field.hidden = !isEve;
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
		const payload = {
			id: String(data.get("id") ?? "").trim(),
			name: String(data.get("name") ?? "").trim(),
			description: String(data.get("description") ?? "").trim() || undefined,
			icon: String(data.get("icon") ?? "shell"),
			color: String(data.get("color") ?? "#6366f1"),
			startupPrompt: String(data.get("startupPrompt") ?? "").trim() || undefined,
		};
		if (kind === "eve") {
			payload.harnessKind = "eve-harness";
			payload.type = "eve";
			payload.endpoint = String(data.get("endpoint") ?? "").trim() || undefined;
			payload.modelHint = String(data.get("modelHint") ?? "").trim() || undefined;
		} else {
			payload.commandTemplate = String(data.get("commandTemplate") ?? "").trim() || undefined;
			payload.runtimeTarget = String(data.get("runtimeTarget") ?? "herdr-wsl");
			payload.type = "tool";
		}
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
