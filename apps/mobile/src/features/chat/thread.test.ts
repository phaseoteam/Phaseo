import { testDatabase } from "./testDatabase";

const mockDb = testDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => mockDb }));
jest.mock("expo-file-system", () => ({ File: class { exists = false; } }));

// eslint-disable-next-line import/first
import { createChat, db, insertMessage, latestSummary } from "./db";
// eslint-disable-next-line import/first
import { prepareThread } from "./thread";
// eslint-disable-next-line import/first
import type { ChatMessage, MessageUsage } from "./types";

const base = { reasoning: "", error: null, errorCode: null, errorStatus: null, attachments: [] as ChatMessage["attachments"], usage: null, notice: null };
const MODEL = "m/one";
let clock = 1;

/** Adds `turns` question/answer pairs (answers of `chars` characters) and returns the last question. */
function addTurns(chatId: string, turns: number, chars = 2_000, answer: Partial<ChatMessage> = {}) {
  const position = () => mockDb.getFirstSync<{ next: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM messages WHERE chat_id = ?", chatId)!.next;
  let last: ChatMessage | null = null;
  for (let turn = 0; turn < turns; turn += 1) {
    last = { ...base, id: `${chatId}-u${clock}`, chatId, role: "user", model: null, parentId: null, content: `Question ${clock}`, status: "done", createdAt: clock++, position: position() };
    insertMessage(last);
    insertMessage({ ...base, id: `${chatId}-a${clock}`, chatId, role: "assistant", model: MODEL, parentId: last.id, content: `Answer ${clock} `.padEnd(chars, "x"), status: "done", createdAt: clock++, position: position(), ...answer });
  }
  return last!;
}

function ask(chatId: string, text: string) {
  const message: ChatMessage = { ...base, id: `${chatId}-q${clock}`, chatId, role: "user", model: null, parentId: null, content: text, status: "done", createdAt: clock++, position: mockDb.getFirstSync<{ next: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM messages WHERE chat_id = ?", chatId)!.next };
  insertMessage(message);
  return message;
}

const prepare = (chatId: string, upTo: ChatMessage, contextTokens: number, summarise = jest.fn(async () => ({ text: "The summary.", usage: { inputTokens: 5_000, outputTokens: 50, costUsd: 0.002 } }))) =>
  ({ summarise, result: prepareThread({ chatId, model: MODEL, modelLabel: "Model One", upTo, systemPrompt: null, contextTokens, signal: new AbortController().signal, summarise }) });

const text = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content));

beforeAll(() => {
  db();
});

test("a thread that fits is sent whole, without a summary request", async () => {
  createChat({ id: "short", title: "short", models: [MODEL], workspaceId: null, createdAt: 1, updatedAt: 1 });
  addTurns("short", 3);
  const upTo = ask("short", "New question");
  const { summarise, result } = prepare("short", upTo, 128_000);
  const thread = await result;
  expect(summarise).not.toHaveBeenCalled();
  expect(thread.compacted).toBe(false);
  expect(thread.messages).toHaveLength(7);
  expect(thread.messages.at(-1)).toEqual({ role: "user", content: "New question" });
});

test("past 80% of the window, older messages are summarised and the summary is sent instead", async () => {
  createChat({ id: "long", title: "long", models: [MODEL], workspaceId: null, createdAt: 1, updatedAt: 1 });
  addTurns("long", 30);
  const upTo = ask("long", "Latest question");
  const { summarise, result } = prepare("long", upTo, 8_000);
  const thread = await result;
  expect(summarise).toHaveBeenCalledTimes(1);
  const request = (summarise.mock.calls[0] as unknown as [{ role: string; content: string }[]])[0];
  expect(request[0]!.role).toBe("system");
  expect(request[1]!.content).toContain("The person's latest request was:\nLatest question");
  expect(thread.compacted).toBe(true);
  expect(thread.summaryUsage).toEqual({ inputTokens: 5_000, outputTokens: 50, costUsd: 0.002 });
  expect(text(thread.messages[0]!.content)).toContain("<conversation_summary>\nThe summary.\n</conversation_summary>");
  expect(thread.messages[1]!.role).toBe("assistant");
  expect(thread.messages[2]!.role).toBe("user");
  expect(thread.messages.at(-1)).toEqual({ role: "user", content: "Latest question" });
  // Tail: about a quarter of the window (2,000 tokens ≈ 7,000 characters) word for word.
  const tailChars = thread.messages.slice(2).reduce((sum, message) => sum + text(message.content).length, 0);
  expect(tailChars).toBeLessThan(7_000);
  const saved = await latestSummary("long", MODEL, upTo.position + 1);
  expect(saved?.summary).toBe("The summary.");
  expect(saved!.throughPosition).toBeLessThan(upTo.position);

  // The next request starts from the summary and doesn't summarise again.
  addTurns("long", 1, 500, { usage: { inputTokens: 2_500, outputTokens: 100 } satisfies MessageUsage });
  const next = ask("long", "Follow-up");
  const again = prepare("long", next, 8_000);
  const nextThread = await again.result;
  expect(again.summarise).not.toHaveBeenCalled();
  expect(text(nextThread.messages[0]!.content)).toContain("The summary.");
  expect(nextThread.messages.at(-1)).toEqual({ role: "user", content: "Follow-up" });
});

test("when the summary can't be written, the newest messages that fit are sent, with a notice, and the next request tries again", async () => {
  createChat({ id: "fails", title: "fails", models: [MODEL], workspaceId: null, createdAt: 1, updatedAt: 1 });
  addTurns("fails", 30);
  const upTo = ask("fails", "Question while summaries fail");
  const { result } = prepare("fails", upTo, 8_000, jest.fn(async () => { throw new Error("The model is temporarily unavailable."); }));
  const thread = await result;
  expect(thread.compacted).toBe(false);
  expect(thread.notice).toBe("Couldn't summarise earlier messages (the model is temporarily unavailable), so only the newest messages that fit in Model One's context window were sent.");
  expect(thread.messages[0]!.role).toBe("user");
  expect(thread.messages.at(-1)).toEqual({ role: "user", content: "Question while summaries fail" });
  expect(thread.messages.reduce((sum, message) => sum + text(message.content).length, 0)).toBeLessThan(8_000 * 0.75 * 3.5);
  expect(await latestSummary("fails", MODEL, upTo.position + 1)).toBeNull();

  // The cut-short answer's small prompt count isn't trusted: the next request still summarises.
  addTurns("fails", 1, 500, { usage: { inputTokens: 4_000, outputTokens: 100 }, notice: thread.notice! });
  const next = ask("fails", "And now?");
  const again = prepare("fails", next, 8_000);
  expect((await again.result).compacted).toBe(true);
  expect(again.summarise).toHaveBeenCalledTimes(1);
});

test("the gateway's count of the previous request calibrates the estimate", async () => {
  createChat({ id: "calibrated", title: "calibrated", models: [MODEL], workspaceId: null, createdAt: 1, updatedAt: 1 });
  addTurns("calibrated", 5, 2_000);
  // The provider counted far more tokens than characters ÷ 3.5 suggests (dense text, or a tokenizer that splits finely).
  addTurns("calibrated", 1, 500, { usage: { inputTokens: 7_000, outputTokens: 100 } });
  const upTo = ask("calibrated", "Next");
  const { summarise, result } = prepare("calibrated", upTo, 8_000);
  const thread = await result;
  expect(thread.estimate).toBeGreaterThan(7_000);
  expect(summarise).toHaveBeenCalledTimes(1);
});
