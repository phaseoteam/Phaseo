/** How far a finger moves (dp) before the drawer takes a horizontal drag, and how far vertically before it gives up. */
export const DRAWER_ACTIVE_OFFSET = 20;
export const DRAWER_FAIL_OFFSET = 12;
/** A fling this fast (dp/s) opens or closes the drawer however short it was. */
export const DRAWER_FLING_VELOCITY = 500;

/** The drawer's width: most of a phone, never wider than 360. */
export const drawerWidth = (screenWidth: number) => Math.min(screenWidth - 56, 360);

/**
 * The drawer's swipe settings: a drag anywhere on the chat (the edge width is the whole screen), and a release past
 * half the drawer's width, or a fling, to open or close it; anything shorter snaps back.
 */
export function drawerSwipe(screenWidth: number) {
  const width = drawerWidth(screenWidth);
  return { width, swipeEdgeWidth: screenWidth, swipeMinDistance: width / 2, swipeMinVelocity: DRAWER_FLING_VELOCITY };
}

/**
 * When the drawer's pan takes over. Closed, only a clear drag to the right opens it, so drags left stay with the chat.
 * Open, a drag either way follows the finger. It fails on vertical movement first, so lists scroll; it activates later
 * than a native scroll view's own slop (8 dp), so a horizontal row (model chips, a code block) that starts scrolling
 * first keeps the drag.
 */
export function drawerPan(open: boolean) {
  return {
    activeOffsetX: open ? [-DRAWER_ACTIVE_OFFSET, DRAWER_ACTIVE_OFFSET] as [number, number] : DRAWER_ACTIVE_OFFSET,
    failOffsetY: [-DRAWER_FAIL_OFFSET, DRAWER_FAIL_OFFSET] as [number, number],
  };
}

