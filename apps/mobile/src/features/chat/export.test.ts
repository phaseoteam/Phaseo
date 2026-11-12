import { testDatabase } from "./testDatabase";

const mockDb = testDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => mockDb }));

/* eslint-disable import/first */
import { chatCounts, createChat, db, deleteAllChats, getChat, insertMessage, messagesAfter } from "./db";
import { bufferedSink, exportFileName, writeExport, type ExportOptions } from "./export";
import { buildStorageReport } from "./storageReport";
import type { ChatMessage } from "./types";
/* eslint-enable import/first */

const base = { reasoning: "", error: null, errorCode: null, errorStatus: null, attachments: [] as ChatMessage["attachments"], usage: null, notice: null };
const options: ExportOptions = { appVersion: "0.1.0", exportedAt: Date.UTC(2026, 9, 19, 12), modelName: (id) => (id === "m/one" ? "Model One" : id), formatTime: (ms) => new Date(ms).toISOString(), pageSize: 3 };

function seed() {
  createChat({ id: "a", title: "Trip plans", models: ["m/one"], workspaceId: null, createdAt: Date.UTC(2026, 9, 1), updatedAt: Date.UTC(2026, 9, 2) });
  let position = 0;
  for (let turn = 0; turn < 4; turn += 1) {
    const user: ChatMessage = { ...base, id: `a-u${turn}`, chatId: "a", role: "user", model: null, parentId: null, content: `question ${turn}`, status: "done", createdAt: Date.UTC(2026, 9, 1, turn), position: position++, attachments: turn === 0 ? [{ id: "f", kind: "image", name: "map.jpg", mimeType: "image/jpeg", uri: "file:///x/map.jpg", size: 2048 }] : [] };
    insertMessage(user);
    insertMessage({ ...base, id: `a-a${turn}`, chatId: "a", role: "assistant", model: "m/one", parentId: user.id, content: `answer ${turn}`, reasoning: turn === 1 ? "thinking" : "", status: turn === 3 ? "error" : "done", error: turn === 3 ? "Out of credit" : null, createdAt: Date.UTC(2026, 9, 1, turn), position: position++, usage: turn === 0 ? { inputTokens: 10, outputTokens: 5 } : null });
  }
  createChat({ id: "b", title: "Empty", models: [], workspaceId: null, createdAt: 1, updatedAt: 1 });
}

async function exportText(format: "markdown" | "json") {
  const out: string[] = [];
  const reads: number[] = [];
  const read = async (chatId: string, after: number, limit: number) => {
    const page = await messagesAfter(chatId, after, limit);
    reads.push(page.length);
    return page;
  };
  const result = await writeExport([getChat("a")!, getChat("b")!], format, { write: (text) => { out.push(text); } }, read, options);
  return { text: out.join(""), result, reads };
}

beforeAll(() => {
  db();
  seed();
});

describe("chat export", () => {
  test("JSON is valid, complete and read a page at a time", async () => {
    const { text, result, reads } = await exportText("json");
    expect(result).toEqual({ chats: 2, messages: 8 });
    // Pages of 3: 3, 3, 2 for the first chat; one empty read for the second.
    expect(reads).toEqual([3, 3, 2, 0]);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ app: "Phaseo for Android", appVersion: "0.1.0", format: 1, exportedAt: "2026-10-19T12:00:00.000Z" });
    expect(parsed.chats.map((chat: { id: string; messages: unknown[] }) => [chat.id, chat.messages.length])).toEqual([["a", 8], ["b", 0]]);
    expect(parsed.chats[0].messages[0]).toEqual({ id: "a-u0", role: "user", model: null, content: "question 0", status: "done", createdAt: "2026-10-01T00:00:00.000Z", attachments: [{ name: "map.jpg", kind: "image", mimeType: "image/jpeg", size: 2048 }] });
    expect(parsed.chats[0].messages[1].usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(parsed.chats[0].messages[3].reasoning).toBe("thinking");
    expect(parsed.chats[0].messages[7]).toMatchObject({ status: "error", error: "Out of credit" });
  });

  test("Markdown reads as a conversation", async () => {
    const { text } = await exportText("markdown");
    expect(text.startsWith("# Phaseo chats\n\nExported from Phaseo for Android 0.1.0 on 2026-10-19T12:00:00.000Z. 2 chats.\n")).toBe(true);
    expect(text).toContain("## Trip plans\n\nModels: Model One (m/one)  \nStarted 2026-10-01T00:00:00.000Z");
    expect(text).toContain("### You · 2026-10-01T00:00:00.000Z\n\nquestion 0\n\nAttachments: map.jpg (image)\n");
    expect(text).toContain("### Model One · 2026-10-01T01:00:00.000Z\n\n> Reasoning:\n> \n> thinking\n\nanswer 1\n");
    expect(text).toContain("_The answer failed: Out of credit_");
    expect(text).toContain("## Empty\n");
  });

  test("file names come from the title, or say several chats", () => {
    expect(exportFileName([{ title: "Trip plans: Rome & Paris!" }], "markdown", options.exportedAt)).toBe("trip-plans-rome-paris-2026-10-19.md");
    expect(exportFileName([{ title: "a" }, { title: "b" }], "json", options.exportedAt)).toBe("phaseo-chats-2026-10-19.json");
    expect(exportFileName([{ title: "⭐" }], "json", options.exportedAt)).toBe("chat-2026-10-19.json");
  });

  test("the buffered sink writes in chunks and flushes the rest", async () => {
    const chunks: string[] = [];
    const sink = bufferedSink((text) => { chunks.push(text); }, 10);
    await sink.write("12345");
    await sink.write("67890ab");
    await sink.write("c");
    await sink.flush();
    expect(chunks).toEqual(["1234567890ab", "c"]);
  });
});

describe("storage on this device", () => {
  test("counts chats, messages and attachments in SQLite", () => {
    expect(chatCounts()).toEqual({ chats: 2, messages: 8, summaries: 0, attachments: 1 });
  });

  test("adds the database, its journal and the attachment files", () => {
    const report = buildStorageReport({ chats: 2, messages: 8, summaries: 0, attachments: 1 }, { database: 40_960, wal: 8_192, shm: 32_768, attachments: [2048, null, 1024] });
    expect(report).toMatchObject({ databaseBytes: 40_960, journalBytes: 40_960, attachmentBytes: 3072, attachmentFiles: 3, totalBytes: 84_992 });
    expect(buildStorageReport({ chats: 0, messages: 0, summaries: 0, attachments: 0 }, { attachments: [] }).totalBytes).toBe(0);
  });

  test("deleting all chats empties every table", () => {
    deleteAllChats();
    expect(chatCounts()).toEqual({ chats: 0, messages: 0, summaries: 0, attachments: 0 });
  });
});
