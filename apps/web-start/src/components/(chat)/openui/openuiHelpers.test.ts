import {
  getOpenUIContext,
  getOpenUISource,
  MAX_OPENUI_LENGTH,
  OPENUI_FORMAT,
  openUIFollowUp,
  updateOpenUIState,
} from "./openuiHelpers";
import type { ChatMessage } from "@/lib/indexeddb/chats";

const message: ChatMessage = {
  id: "message",
  role: "assistant",
  content: "root = Answer()",
  createdAt: "2026-10-08",
  variants: [
    {
      id: "first",
      content: "root = Answer()",
      createdAt: "2026-10-08",
      meta: { response_format: OPENUI_FORMAT },
    },
    {
      id: "second",
      content: "root = Answer()",
      createdAt: "2026-10-08",
      meta: { response_format: OPENUI_FORMAT },
    },
  ],
  activeVariantIndex: 0,
};

describe("OpenUI experiment boundary", () => {
  it("recognizes root output and strips explicit fences without interpreting ordinary prose", () => {
    expect(getOpenUISource("```openui\nroot = Answer()\n``` ")).toBe(
      "root = Answer()",
    );
    expect(getOpenUISource("A root = Answer() example")).toBeNull();
    expect(
      getOpenUISource("root = " + "a".repeat(MAX_OPENUI_LENGTH)),
    ).toBeNull();
  });
  it("persists form values on the addressed variant, leaving other variants intact", () => {
    const updated = updateOpenUIState(message, "second", {
      priority: { value: "Budget" },
    });
    expect(updated.variants?.[0]).toBe(message.variants?.[0]);
    expect(updated.variants?.[1].openuiState).toEqual({
      priority: { value: "Budget" },
    });
    expect(getOpenUIContext(updated)).toBe(message.content);
    expect(getOpenUIContext({ ...updated, activeVariantIndex: 1 })).toContain(
      '"Budget"',
    );
    expect(message.variants?.[1].openuiState).toBeUndefined();
  });
  it("ignores stale variant IDs, user messages, and ordinary Markdown variants", () => {
    expect(updateOpenUIState(message, "gone", {})).toBe(message);
    const user = { ...message, role: "user" as const };
    expect(updateOpenUIState(user, "first", {})).toBe(user);
    const ordinary = {
      ...message,
      variants: [{ ...message.variants![0], meta: {} }],
    };
    expect(updateOpenUIState(ordinary, "first", {})).toBe(ordinary);
  });
  it("submits bounded user text and rejects empty answers", () => {
    expect(openUIFollowUp("Your priority?", "  Budget  ")).toBe(
      "Your priority?\nBudget",
    );
    expect(openUIFollowUp("Your priority?", " ")).toBeNull();
    expect(openUIFollowUp("Q", "x".repeat(3000))).toHaveLength(2002);
  });
});
