import { buildItems, focusedAnswerPick, focusIndex } from "./conversationItems";
import type { ChatMessage } from "./types";

const base = { chatId: "c", reasoning: "", error: null, errorCode: null, errorStatus: null, attachments: [] as ChatMessage["attachments"], usage: null, notice: null, status: "done" as const, createdAt: 1 };
const MODELS = ["m/one", "m/two"];
const messages: ChatMessage[] = [
  { ...base, id: "u1", role: "user", model: null, parentId: null, content: "Question", position: 0 },
  { ...base, id: "a1", role: "assistant", model: "m/one", parentId: "u1", content: "First answer", position: 1 },
  { ...base, id: "a2", role: "assistant", model: "m/two", parentId: "u1", content: "Second answer", position: 2 },
];
const items = (side: boolean, selected: Record<string, string>) => buildItems({ messages, summaries: [], models: MODELS, side, selected, live: () => null });

describe("opening a chat on a message", () => {
  test("an answer from a model whose tab isn't shown picks that tab, and then has a row", () => {
    expect(focusedAnswerPick(messages, "a2")).toEqual({ turn: "u1", model: "m/two" });
    // Without the pick, the answer has no row; the list would at least open at its question.
    const unpicked = items(false, {});
    expect(unpicked[focusIndex(unpicked, messages, "a2")]!.key).toBe("user:u1");
    const picked = items(false, { u1: "m/two" });
    expect(picked[focusIndex(picked, messages, "a2")]!.key).toBe("answer:a2:0");
  });

  test("a question needs no pick, and side-by-side columns open at the answer's question", () => {
    expect(focusedAnswerPick(messages, "u1")).toBeNull();
    expect(focusedAnswerPick(messages, null)).toBeNull();
    const columns = items(true, {});
    expect(columns[focusIndex(columns, messages, "a2")]!.key).toBe("user:u1");
  });
});
