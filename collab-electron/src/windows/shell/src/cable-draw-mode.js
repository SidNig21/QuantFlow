function targetMatches(target, selector) {
	return Boolean(target?.matches?.(selector));
}

function targetHasClosest(target, selector) {
	return Boolean(target?.closest?.(selector));
}

export function isCableDrawBlockedTarget(target) {
	return (
		targetHasClosest(target, "webview") ||
		targetMatches(target, "input, textarea")
	);
}

export function shouldEnterCableDrawMode(event) {
	return (
		event?.code === "KeyC" &&
		!event?.repeat &&
		!isCableDrawBlockedTarget(event?.target)
	);
}

export function shouldCancelCableDrawMode(event, cableHeld) {
	return Boolean(cableHeld && event?.key === "Escape");
}

export function shouldExitCableDrawModeOnKeyup(event) {
	return event?.code === "KeyC";
}

export function shouldStartCableDraw({ cableHeld = false, force = false } = {}) {
	return Boolean(cableHeld || force);
}

export function shouldForwardCableDrawMouseDown(event) {
	return event?.button === 0;
}
