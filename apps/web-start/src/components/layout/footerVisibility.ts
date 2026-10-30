type FooterVisibilityListener = () => void;

const listeners = new Set<FooterVisibilityListener>();
let hideDepth = 0;
let showDepth = 0;

function emitVisibilityChange() {
	for (const listener of listeners) listener();
}

export function getFooterVisibilitySnapshot(): boolean {
	return hideDepth === 0 || showDepth > 0;
}

export function subscribeFooterVisibility(listener: FooterVisibilityListener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function registerVisibilityOverride(type: "hide" | "show") {
	if (type === "hide") hideDepth += 1;
	else showDepth += 1;
	emitVisibilityChange();

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		if (type === "hide") hideDepth = Math.max(0, hideDepth - 1);
		else showDepth = Math.max(0, showDepth - 1);
		emitVisibilityChange();
	};
}

export function registerHideFooter() {
	return registerVisibilityOverride("hide");
}

export function registerShowFooter() {
	return registerVisibilityOverride("show");
}
