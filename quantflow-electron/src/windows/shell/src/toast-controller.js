export function normalizeToast(input) {
	const message = typeof input === "string" ? input : input?.message;
	const text = String(message ?? "").trim();
	const tone = input?.tone;
	return {
		message: text,
		tone: tone === "success" || tone === "error" ||
			tone === "warn" || tone === "info" ? tone : "info",
		timeout: Number.isFinite(input?.timeout) ? Math.max(0, input.timeout) : 3200,
		dismissible: input?.dismissible !== false,
	};
}

export function createToastController({
	document,
	parent = document.body,
	maxVisible = 4,
} = {}) {
	const host = document.createElement("div");
	host.className = "toast-host";
	host.setAttribute("aria-live", "polite");
	host.setAttribute("aria-atomic", "false");
	parent.appendChild(host);

	function dismiss(el) {
		el.remove();
	}

	function show(input) {
		const toast = normalizeToast(input);
		if (!toast.message) return null;
		const el = document.createElement("div");
		el.className = "app-toast";
		el.dataset.tone = toast.tone;
		el.setAttribute(
			"role",
			toast.tone === "error" || toast.tone === "warn" ? "alert" : "status",
		);

		const messageEl = document.createElement("div");
		messageEl.className = "app-toast-message";
		messageEl.textContent = toast.message;
		el.appendChild(messageEl);

		if (toast.dismissible) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "app-toast-dismiss";
			button.setAttribute("aria-label", "Dismiss notification");
			button.textContent = "x";
			button.addEventListener("click", () => dismiss(el));
			el.appendChild(button);
		}

		host.appendChild(el);
		while (host.children.length > maxVisible) {
			host.children[0].remove();
		}
		if (toast.timeout > 0) {
			setTimeout(() => dismiss(el), toast.timeout);
		}
		return el;
	}

	function destroy() {
		host.remove();
	}

	return { show, destroy, host };
}
