export const WORKFLOW_MODAL_COPY = {
	title: "What do you want to work on?",
	hint: "Enter to run - Shift+Enter for a new line - Esc to cancel",
	placeholder: "Describe the task for Hermes...",
	submitLabel: "Run Workflow",
	cancelLabel: "Cancel",
};

export function normalizeWorkflowPrompt(value) {
	return String(value ?? "").trim();
}

/**
 * Decide what a keydown inside the modal should do.
 * Enter submits, Shift+Enter inserts a newline, Escape cancels.
 */
export function resolveWorkflowModalKeyAction(key, modifiers = {}) {
	if (key === "Escape") return "cancel";
	if (key === "Enter" && !modifiers.shiftKey) return "submit";
	return null;
}

export function renderWorkflowModalHtml(copy = WORKFLOW_MODAL_COPY) {
	return `
		<div class="qf-workflow-backdrop"></div>
		<div class="qf-workflow-modal" role="dialog" aria-modal="true" aria-label="${copy.title}">
			<div class="qf-workflow-title">${copy.title}</div>
			<textarea
				class="qf-workflow-input"
				rows="3"
				placeholder="${copy.placeholder}"
				aria-label="${copy.title}"
			></textarea>
			<div class="qf-workflow-hint">${copy.hint}</div>
			<div class="qf-workflow-actions">
				<button type="button" class="qf-workflow-cancel">${copy.cancelLabel}</button>
				<button type="button" class="qf-workflow-submit">${copy.submitLabel}</button>
			</div>
		</div>
	`;
}

/**
 * Overlay modal that captures one operator prompt.
 * open() resolves with the trimmed prompt, or null on cancel.
 */
export function createWorkflowModal({ document }) {
	if (!document) {
		throw new Error("createWorkflowModal requires document");
	}

	const overlay = document.createElement("div");
	overlay.className = "qf-workflow-overlay";
	overlay.hidden = true;
	overlay.innerHTML = renderWorkflowModalHtml();
	document.body.appendChild(overlay);

	const input = overlay.querySelector(".qf-workflow-input");
	let resolveOpen = null;

	function close(value) {
		overlay.hidden = true;
		const resolve = resolveOpen;
		resolveOpen = null;
		resolve?.(value);
	}

	function submit() {
		const prompt = normalizeWorkflowPrompt(input.value);
		if (!prompt) {
			input.focus?.();
			return;
		}
		close(prompt);
	}

	overlay.querySelector(".qf-workflow-submit")
		?.addEventListener("click", submit);
	overlay.querySelector(".qf-workflow-cancel")
		?.addEventListener("click", () => close(null));
	overlay.querySelector(".qf-workflow-backdrop")
		?.addEventListener("click", () => close(null));
	overlay.addEventListener("keydown", (event) => {
		const action = resolveWorkflowModalKeyAction(event.key, event);
		if (!action) return;
		event.preventDefault();
		event.stopPropagation();
		if (action === "submit") submit();
		else close(null);
	});

	return {
		element: overlay,
		isOpen: () => !overlay.hidden,
		open() {
			if (resolveOpen) {
				return Promise.resolve(null);
			}
			overlay.hidden = false;
			input.value = "";
			input.focus?.();
			return new Promise((resolve) => {
				resolveOpen = resolve;
			});
		},
		cancel: () => close(null),
	};
}
