export function normalizeToast(input) {
	const message = typeof input === "string" ? input : input?.message;
	const text = String(message ?? "").trim();
	return {
		message: text,
		tone: input?.tone === "error" || input?.tone === "warn" ? input.tone : "info",
		timeout: Number.isFinite(input?.timeout) ? Math.max(0, input.timeout) : 3200,
	};
}

export function createToastController({ document, parent = document.body } = {}) {
	const host = document.createElement("div");
	host.className = "toast-host";
	host.setAttribute("aria-live", "polite");
	host.setAttribute("aria-atomic", "false");
	parent.appendChild(host);

	function show(input) {
		const toast = normalizeToast(input);
		if (!toast.message) return null;
		const el = document.createElement("div");
		el.className = "app-toast";
		el.dataset.tone = toast.tone;
		el.textContent = toast.message;
		host.appendChild(el);
		if (toast.timeout > 0) {
			setTimeout(() => el.remove(), toast.timeout);
		}
		return el;
	}

	function destroy() {
		host.remove();
	}

	return { show, destroy, host };
}
