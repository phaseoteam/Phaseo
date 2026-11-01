/** The composer's text box: one line beside the controls, or full width above them once the text wraps. */
export const LINE_HEIGHT = 22;
export const EDITOR_INSET = 7;
/** Lines the full-width box grows to before it scrolls. */
export const MAX_LINES = 4;
export const ROW_HEIGHT = 44;
export const TOOLBAR_HEIGHT = 48;

export type EditorLayout = { expanded: boolean; /** The text's length when it first wrapped beside the controls. */ expandedAt: number };

/**
 * Whether the box is full width. It widens when the text wraps in its one-line slot; it narrows again only when the
 * text is shorter than when it wrapped (and has no line break), so the wider box fitting the line can't bounce it back.
 */
export function nextEditorLayout(current: EditorLayout, text: string, contentHeight: number, lineHeight = LINE_HEIGHT): EditorLayout {
  if (!text) return current.expanded ? { expanded: false, expandedAt: 0 } : current;
  if (!current.expanded) return contentHeight > lineHeight * 1.5 || text.includes("\n") ? { expanded: true, expandedAt: text.length } : current;
  return !text.includes("\n") && text.length < current.expandedAt ? { expanded: false, expandedAt: 0 } : current;
}

/** The box's height: one line when narrow; up to MAX_LINES when full width. */
export function editorHeight(expanded: boolean, contentHeight: number, lineHeight = LINE_HEIGHT) {
  const lines = expanded ? Math.min(lineHeight * MAX_LINES, Math.max(lineHeight, contentHeight)) : lineHeight;
  return Math.ceil(lines) + EDITOR_INSET * 2;
}
