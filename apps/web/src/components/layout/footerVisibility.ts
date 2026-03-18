const HIDE_DEPTH_ATTR = "data-hide-footer-depth";
const SHOW_DEPTH_ATTR = "data-show-footer-depth";
const HIDE_FLAG_ATTR = "data-hide-footer";

function readCounter(attr: string): number {
	const raw = document.body.getAttribute(attr);
	const parsed = Number.parseInt(raw ?? "0", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function writeCounter(attr: string, value: number) {
	if (value > 0) {
		document.body.setAttribute(attr, String(value));
		return;
	}
	document.body.removeAttribute(attr);
}

function updateFooterVisibility() {
	const hideDepth = readCounter(HIDE_DEPTH_ATTR);
	const showDepth = readCounter(SHOW_DEPTH_ATTR);
	if (hideDepth > 0 && showDepth === 0) {
		document.body.setAttribute(HIDE_FLAG_ATTR, "true");
		return;
	}
	document.body.removeAttribute(HIDE_FLAG_ATTR);
}

export function registerHideFooter() {
	writeCounter(HIDE_DEPTH_ATTR, readCounter(HIDE_DEPTH_ATTR) + 1);
	updateFooterVisibility();

	return () => {
		writeCounter(HIDE_DEPTH_ATTR, readCounter(HIDE_DEPTH_ATTR) - 1);
		updateFooterVisibility();
	};
}

export function registerShowFooter() {
	writeCounter(SHOW_DEPTH_ATTR, readCounter(SHOW_DEPTH_ATTR) + 1);
	updateFooterVisibility();

	return () => {
		writeCounter(SHOW_DEPTH_ATTR, readCounter(SHOW_DEPTH_ATTR) - 1);
		updateFooterVisibility();
	};
}
