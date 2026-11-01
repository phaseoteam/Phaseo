/** The region after (or before) the one holding focus, wrapping; from outside every region, the first (or last). */
export function adjacentRegion(count: number, current: number, direction: 1 | -1) {
	if (!count) return -1;
	if (current < 0) return direction > 0 ? 0 : count - 1;
	return (current + direction + count) % count;
}

const focusable = "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";

/**
 * F6 and Shift+F6: focus moves between the sidebar, the conversation, the message box and the right pane, the
 * parts marked `data-focus-region`, in the order they appear.
 */
export function moveRegionFocus(direction: 1 | -1) {
	const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-focus-region]")).filter(region => region.getClientRects().length > 0);
	const active = document.activeElement;
	const index = adjacentRegion(regions.length, regions.findIndex(region => region.contains(active)), direction);
	const region = regions[index];
	if (!region) return false;
	// A region that can take focus itself (the conversation) does; then the message box's text; then the first control.
	const target = region.hasAttribute("tabindex") ? region : region.querySelector<HTMLElement>("[contenteditable=\"true\"]") ?? region.querySelector<HTMLElement>(focusable) ?? region;
	target.focus({ preventScroll: true });
	return true;
}
