import { EDITOR_INSET, editorHeight, LINE_HEIGHT, MAX_LINES, nextEditorLayout } from "./editorLayout";

const narrow = { expanded: false, expandedAt: 0 };

describe("nextEditorLayout", () => {
  it("widens the box when the text wraps beside the controls, or has a line break", () => {
    expect(nextEditorLayout(narrow, "short", LINE_HEIGHT)).toBe(narrow);
    expect(nextEditorLayout(narrow, "a long sentence that wraps", LINE_HEIGHT * 2)).toEqual({ expanded: true, expandedAt: 26 });
    expect(nextEditorLayout(narrow, "one\ntwo", LINE_HEIGHT)).toMatchObject({ expanded: true });
  });

  it("stays wide when the wider box fits the line again, so it can't bounce", () => {
    const wide = { expanded: true, expandedAt: 26 };
    expect(nextEditorLayout(wide, "a long sentence that wraps", LINE_HEIGHT)).toBe(wide);
  });

  it("narrows once the text is shorter than when it wrapped, and when it's cleared", () => {
    const wide = { expanded: true, expandedAt: 26 };
    expect(nextEditorLayout(wide, "a long sentence", LINE_HEIGHT)).toEqual(narrow);
    expect(nextEditorLayout(wide, "", LINE_HEIGHT)).toEqual(narrow);
    expect(nextEditorLayout(wide, "line\nbreak", LINE_HEIGHT)).toBe(wide);
  });
});

describe("editorHeight", () => {
  it("is one line beside the controls and grows to four lines when wide", () => {
    expect(editorHeight(false, LINE_HEIGHT * 3)).toBe(LINE_HEIGHT + EDITOR_INSET * 2);
    expect(editorHeight(true, LINE_HEIGHT * 2)).toBe(LINE_HEIGHT * 2 + EDITOR_INSET * 2);
    expect(editorHeight(true, LINE_HEIGHT * 9)).toBe(LINE_HEIGHT * MAX_LINES + EDITOR_INSET * 2);
  });
});
