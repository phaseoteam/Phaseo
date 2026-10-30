const VIEWPORT_MARGIN = 12;
const SELECTION_GAP = 8;

export type ChatSelectionAnchor = {
	anchorLeft: number;
	anchorTop: number;
	anchorBottom: number;
};

export function getChatSelectionToolbarPosition(
	selection: ChatSelectionAnchor,
	toolbar: { width: number; height: number },
	viewport: { width: number; height: number },
) {
	const halfWidth = toolbar.width / 2;
	const minLeft = VIEWPORT_MARGIN + halfWidth;
	const maxLeft = viewport.width - VIEWPORT_MARGIN - halfWidth;
	const left =
		minLeft > maxLeft
			? viewport.width / 2
			: Math.min(Math.max(selection.anchorLeft, minLeft), maxLeft);
	const belowTop = selection.anchorBottom + SELECTION_GAP;
	const aboveTop = selection.anchorTop - SELECTION_GAP - toolbar.height;
	const maxTop = viewport.height - VIEWPORT_MARGIN - toolbar.height;

	return {
		left,
		top:
			belowTop <= maxTop
				? belowTop
				: Math.max(VIEWPORT_MARGIN, aboveTop),
	};
}
