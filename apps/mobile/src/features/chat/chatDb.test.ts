import { testDatabase } from "./testDatabase";

const mockDb = testDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => mockDb }));

// eslint-disable-next-line import/first
import { appendDeltas, copyMessages, createChat, db, deleteMessagesFrom, finishMessage, insertMessage, newerPage, newestMatch, newestPage, olderPage, pageAround, recoverInterrupted, saveSummary, threadSize, threadTail, type MessagePage } from "./db";
// eslint-disable-next-line import/first
import type { ChatMessage } from "./types";

const base = { reasoning: "", error: null, errorCode: null, errorStatus: null, attachments: [] as ChatMessage["attachments"], usage: null, notice: null };

/** A chat of `turns` turns, each answered by every model in `models`. */
function seed(chatId: string, turns: number, models: string[]) {
  createChat({ id: chatId, title: chatId, models, workspaceId: null, createdAt: 1, updatedAt: 1 });
  let position = 0;
  for (let turn = 0; turn < turns; turn += 1) {
    const user: ChatMessage = { ...base, id: `${chatId}-u${turn}`, chatId, role: "user", model: null, parentId: null, content: `question ${turn}`, status: "done", createdAt: turn, position: position++ };
    insertMessage(user);
    for (const model of models) insertMessage({ ...base, id: `${chatId}-a${turn}-${model}`, chatId, role: "assistant", model, parentId: user.id, content: `answer ${turn} from ${model}`.padEnd(100, "."), status: turn === 3 && model === models[0] ? "error" : "done", createdAt: turn, position: position++ });
  }
}

const turnsOf = (page: MessagePage) => page.messages.filter((message) => message.role === "user").map((message) => Number(message.id.split("-u")[1]));

beforeAll(() => {
  db();
  seed("long", 100, ["m/one"]);
  seed("multi", 30, ["m/one", "m/two", "m/three"]);
});

describe("conversation pages", () => {
  test("a chat opens at its newest turns, whole", () => {
    const page = newestPage("long", 20, true) as MessagePage;
    expect(turnsOf(page)).toEqual(Array.from({ length: 20 }, (_, index) => 80 + index));
    expect(page.messages).toHaveLength(40);
    expect(page.hasEarlier).toBe(true);
    expect(page.hasLater).toBe(false);
  });

  test("older and newer pages continue the window without gaps or split turns", async () => {
    const newest = newestPage("multi", 10, true) as MessagePage;
    const older = await olderPage("multi", newest.messages[0]!.position, 10);
    expect(turnsOf(older)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(older.messages).toHaveLength(40);
    expect(older.messages.at(-1)!.position + 1).toBe(newest.messages[0]!.position);
    const first = await olderPage("multi", (await olderPage("multi", older.messages[0]!.position, 10)).messages[0]!.position, 10);
    expect(first.messages).toEqual([]);
    expect(first.hasEarlier).toBe(false);
    const newer = await newerPage("multi", older.messages.at(-1)!.position, 5);
    expect(turnsOf(newer)).toEqual([20, 21, 22, 23, 24]);
    expect(newer.hasLater).toBe(true);
  });

  test("a link to a message opens around its turn", () => {
    const page = pageAround("long", "long-a50-m/one", 20)!;
    expect(turnsOf(page)).toEqual(Array.from({ length: 20 }, (_, index) => 40 + index));
    expect(page.hasEarlier && page.hasLater).toBe(true);
    expect(pageAround("long", "missing", 20)).toBeNull();
  });

  test("a search opens at the newest message that matched every word", () => {
    expect(newestMatch("long", "question 4")).toBe("long-u94");
    expect(newestMatch("long", "50% off")).toBeNull();
  });
});

describe("one model's thread", () => {
  test("is every question and only that model's finished answers", async () => {
    const { messages, skipped } = await threadTail("multi", "m/two", -1, 10, Number.MAX_SAFE_INTEGER);
    expect(skipped).toBe(0);
    expect(messages.map((message) => message.id)).toEqual(["multi-u0", "multi-a0-m/two", "multi-u1", "multi-a1-m/two", "multi-u2", "multi-a2-m/two"]);
    // The first model's failed answer on turn 3 is left out of its thread.
    const one = await threadTail("multi", "m/one", 11, 16, Number.MAX_SAFE_INTEGER);
    expect(one.messages.map((message) => message.id)).toEqual(["multi-u3", "multi-u4"]);
  });

  test("reads only the newest messages that fit a budget, counted in SQLite", async () => {
    const size = await threadSize("long", "m/one", -1, 199);
    expect(size.messages).toBe(199);
    const { messages, skipped } = await threadTail("long", "m/one", -1, 199, 1100);
    expect(messages.at(-1)!.id).toBe("long-a99-m/one");
    expect(messages.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThan(1100 + 110);
    expect(skipped).toBe(199 - messages.length);
  });

  test("pages carry the summaries that end inside them, and edits drop the summaries they cover", async () => {
    saveSummary({ chatId: "long", model: "m/one", throughPosition: 179, summary: "Earlier: turns 0–89", usage: { costUsd: 0.01 }, createdAt: 5 });
    saveSummary({ chatId: "long", model: "m/one", throughPosition: 59, summary: "Earlier: turns 0–29", usage: null, createdAt: 4 });
    expect((newestPage("long", 20, true) as MessagePage).summaries.map((summary) => summary.throughPosition)).toEqual([179]);
    expect((await olderPage("long", 160, 20)).summaries.map((summary) => summary.throughPosition)).toEqual([]);
    expect((await olderPage("long", 80, 20)).summaries.map((summary) => summary.throughPosition)).toEqual([59]);
    seed("edit", 10, ["m/one"]);
    saveSummary({ chatId: "edit", model: "m/one", throughPosition: 9, summary: "s", usage: null, createdAt: 1 });
    saveSummary({ chatId: "edit", model: "m/one", throughPosition: 13, summary: "s", usage: null, createdAt: 2 });
    deleteMessagesFrom("edit", 12);
    expect(mockDb.getAllSync<{ through_position: number }>("SELECT through_position FROM chat_summaries WHERE chat_id = 'edit'")).toEqual([{ through_position: 9 }]);
    expect(mockDb.getFirstSync<{ n: number }>("SELECT max(position) AS n FROM messages WHERE chat_id = 'edit'")!.n).toBe(11);
    // Written while answering turn 3 (sent at 3, position 6): it ends before turn 3 but saw it as the latest request.
    seed("edit-latest", 6, ["m/one"]);
    saveSummary({ chatId: "edit-latest", model: "m/one", throughPosition: 3, summary: "before turn 3 was sent", usage: null, createdAt: 2 });
    saveSummary({ chatId: "edit-latest", model: "m/one", throughPosition: 1, summary: "while answering turn 3", usage: null, createdAt: 3 });
    deleteMessagesFrom("edit-latest", 6);
    expect(mockDb.getAllSync<{ summary: string }>("SELECT summary FROM chat_summaries WHERE chat_id = 'edit-latest'")).toEqual([{ summary: "before turn 3 was sent" }]);
  });
});

describe("streaming writes", () => {
  test("streamed pieces are appended, then folded in once when the answer ends", () => {
    seed("stream", 1, ["m/one"]);
    insertMessage({ ...base, id: "live", chatId: "stream", role: "assistant", model: "m/one", parentId: "stream-u0", content: "", status: "streaming", createdAt: 9, position: 2 });
    appendDeltas([{ messageId: "live", seq: 0, content: "Hello ", reasoning: "Think" }]);
    appendDeltas([{ messageId: "live", seq: 1, content: "world", reasoning: "ing" }]);
    expect(mockDb.getFirstSync<{ n: number }>("SELECT count(*) AS n FROM message_deltas")!.n).toBe(2);
    finishMessage("live", { content: "Hello world", reasoning: "Thinking", status: "done" });
    expect(mockDb.getFirstSync("SELECT content, reasoning, status FROM messages WHERE id = 'live'")).toEqual({ content: "Hello world", reasoning: "Thinking", status: "done" });
    expect(mockDb.getFirstSync<{ n: number }>("SELECT count(*) AS n FROM message_deltas")!.n).toBe(0);
  });

  test("an answer cut off by the app closing keeps what it had streamed", () => {
    insertMessage({ ...base, id: "cut", chatId: "stream", role: "assistant", model: "m/one", parentId: "stream-u0", content: "", status: "streaming", createdAt: 9, position: 3 });
    appendDeltas([{ messageId: "cut", seq: 1, content: " two", reasoning: "" }, { messageId: "cut", seq: 0, content: "one", reasoning: "r" }]);
    recoverInterrupted(mockDb as never);
    expect(mockDb.getFirstSync("SELECT content, reasoning, status FROM messages WHERE id = 'cut'")).toEqual({ content: "one two", reasoning: "r", status: "stopped" });
    expect(mockDb.getFirstSync<{ n: number }>("SELECT count(*) AS n FROM message_deltas")!.n).toBe(0);
  });
});

test("branching copies questions, the kept model's answers and its summaries, with new ids", () => {
  saveSummary({ chatId: "multi", model: "m/two", throughPosition: 7, summary: "two", usage: null, createdAt: 1 });
  saveSummary({ chatId: "multi", model: "m/one", throughPosition: 7, summary: "one", usage: null, createdAt: 1 });
  // Written while answering turn 4, after the branch point: it saw a question the branch doesn't have.
  saveSummary({ chatId: "multi", model: "m/two", throughPosition: 4, summary: "saw turn 4", usage: null, createdAt: 4 });
  createChat({ id: "branch", title: "branch", models: ["m/two"], workspaceId: null, createdAt: 1, updatedAt: 1 });
  let next = 0;
  const copied = copyMessages({ from: "multi", to: "branch", upTo: 11, models: ["m/two"], newId: () => `b${next++}` });
  expect(copied).toBe(6);
  const rows = mockDb.getAllSync<{ id: string; role: string; parent_id: string | null; position: number }>("SELECT id, role, parent_id, position FROM messages WHERE chat_id = 'branch' ORDER BY position");
  expect(rows.map((row) => row.id)).toEqual(["b0", "b1", "b2", "b3", "b4", "b5"]);
  expect(rows.filter((row) => row.role === "assistant").map((row) => row.parent_id)).toEqual(["b0", "b2", "b4"]);
  expect(mockDb.getAllSync("SELECT model, through_position FROM chat_summaries WHERE chat_id = 'branch'")).toEqual([{ model: "m/two", through_position: 7 }]);
  expect(mockDb.getAllSync("SELECT chat_id FROM chat_search WHERE chat_search MATCH 'question' AND chat_id = 'branch'")).toHaveLength(3);
});
