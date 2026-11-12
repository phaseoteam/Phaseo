/** A view's rectangle in window coordinates (from measureInWindow). */
export type Anchor = { x: number; y: number; width: number; height: number };

export type DropdownPlacement = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const MARGIN = 8;
const GAP = 4;
const MIN_WIDTH = 224;
const MAX_WIDTH = 360;
const MAX_HEIGHT = 420;
/** Below this much room under the trigger, a taller space above wins. */
const COMFORTABLE_HEIGHT = 240;

/**
 * Where a dropdown sits for its trigger, like the website's selects: under the trigger, left-aligned,
 * at least as wide as it, kept on screen. It opens upwards when there is clearly more room above.
 */
export function placeDropdown(anchor: Anchor, window: { width: number; height: number }, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }): DropdownPlacement {
  const width = Math.min(Math.max(anchor.width, MIN_WIDTH), MAX_WIDTH, window.width - MARGIN * 2);
  const left = Math.min(Math.max(anchor.x, MARGIN), window.width - width - MARGIN);
  const below = window.height - insets.bottom - MARGIN - (anchor.y + anchor.height + GAP);
  const above = anchor.y - GAP - insets.top - MARGIN;
  if (below >= COMFORTABLE_HEIGHT || below >= above) {
    return { left, width, top: anchor.y + anchor.height + GAP, maxHeight: Math.max(0, Math.min(MAX_HEIGHT, below)) };
  }
  return { left, width, bottom: window.height - anchor.y + GAP, maxHeight: Math.max(0, Math.min(MAX_HEIGHT, above)) };
}

export type DialogSize = "fit" | "tall";

/**
 * The centred dialog used on tablets: up to 560 dp wide and 85% of the window high. "tall" dialogs
 * (long lists, pickers, forms with a keyboard) take that height; "fit" ones grow with their content.
 */
export function dialogFrame(window: { width: number; height: number }, size: DialogSize) {
  const maxHeight = Math.round(window.height * 0.85);
  return {
    width: Math.min(560, window.width - 48),
    maxHeight,
    height: size === "tall" ? Math.min(maxHeight, 760) : undefined,
  };
}
