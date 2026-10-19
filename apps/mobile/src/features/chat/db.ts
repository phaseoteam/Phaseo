import * as SQLite from "expo-sqlite";
import { perf } from "@/perf";
import { migrateChatDatabase } from "./migrations";
import { cleanSettings, type ModelSettings } from "./settings";
import type { Chat, ChatAttachment, ChatMessage, ChatSummary, MessageUsage, TokenUsage } from "./types";

let database: SQLite.SQLiteDatabase | null = null;

export function db() {
  if (database) return database;
  database = SQLite.openDatabaseSync("phaseo-chats.db");
  database.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
  perf?.attachDb(database);
  const opened = database;
  if (perf) perf.time("db.migrate", () => migrateChatDatabase(opened), (from) => ({ from }));
  else migrateChatDatabase(opened);
  recoverInterrupted(opened);
  return database;
}

/**
 * A run can't survive the app being closed: anything left streaming was interrupted. Text it streamed is in
 * message_deltas until the answer ends, so it's folded into the message first and the answer keeps it.
 */
export function recoverInterrupted(database: Pick<SQLite.SQLiteDatabase, "getAllSync" | "runSync" | "withTransactionSync">) {
  const deltas = database.getAllSync<{ message_id: string; content: string; reasoning: string }>("SELECT message_id, content, reasoning FROM message_deltas ORDER BY message_id, seq");
  database.withTransactionSync(() => {
    if (deltas.length) {
      const byMessage = new Map<string, { content: string[]; reasoning: string[] }>();
      for (const delta of deltas) {
        const entry = byMessage.get(delta.message_id) ?? { content: [], reasoning: [] };
        entry.content.push(delta.content);
        entry.reasoning.push(delta.reasoning);
        byMessage.set(delta.message_id, entry);
      }
      for (const [id, entry] of byMessage) database.runSync("UPDATE messages SET content = content || ?, reasoning = reasoning || ? WHERE id = ?", entry.content.join(""), entry.reasoning.join(""), id);
      database.runSync("DELETE FROM message_deltas");
    }
    database.runSync("UPDATE messages SET status = 'stopped' WHERE status = 'streaming'");
  });
}

type ChatRow = { id: string; title: string; models: string; model_settings: string | null; pinned: number; workspace_id: string | null; preview: string; created_at: number; updated_at: number };
type MessageRow = { id: string; chat_id: string; role: string; model: string | null; parent_id: string | null; content: string; reasoning: string; status: string; error: string | null; attachments: string; usage: string | null; created_at: number; position: number; error_code: string | null; error_status: number | null; notice: string | null };
type SummaryRow = { chat_id: string; model: string; through_position: number; summary: string; usage: string | null; created_at: number };

const CHAT_COLUMNS = "id, title, models, model_settings, pinned, workspace_id, preview, created_at, updated_at";
const MESSAGE_COLUMNS = "id, chat_id, role, model, parent_id, content, reasoning, status, error, error_code, error_status, attachments, usage, notice, created_at, position";

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const toChat = (row: ChatRow): Chat => ({ id: row.id, title: row.title, models: parseJson(row.models, []), modelSettings: parseJson<Record<string, ModelSettings>>(row.model_settings, {}), pinned: row.pinned === 1, workspaceId: row.workspace_id, preview: row.preview, createdAt: row.created_at, updatedAt: row.updated_at });

export const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  chatId: row.chat_id,
  role: row.role === "user" ? "user" : "assistant",
  model: row.model,
  parentId: row.parent_id,
  content: row.content,
  reasoning: row.reasoning,
  status: (["done", "streaming", "error", "stopped"].includes(row.status) ? row.status : "done") as ChatMessage["status"],
  error: row.error,
  errorCode: row.error_code ?? null,
  errorStatus: row.error_status ?? null,
  attachments: row.attachments === "[]" ? [] : parseJson<ChatAttachment[]>(row.attachments, []),
  usage: parseJson<MessageUsage | null>(row.usage, null),
  notice: row.notice ?? null,
  createdAt: row.created_at,
  position: row.position,
});

const toSummary = (row: SummaryRow): ChatSummary => ({ chatId: row.chat_id, model: row.model, throughPosition: row.through_position, summary: row.summary, usage: parseJson<TokenUsage | null>(row.usage, null), createdAt: row.created_at });

const LIST_CHATS = `SELECT ${CHAT_COLUMNS} FROM chats ORDER BY pinned DESC, updated_at DESC`;

export function listChats(): Chat[] {
  return db().getAllSync<ChatRow>(LIST_CHATS).map(toChat);
}

/** The chat list, read off the JS thread (the first screen reads it synchronously instead, so it never flashes empty). */
export async function listChatsAsync(): Promise<Chat[]> {
  return (await db().getAllAsync<ChatRow>(LIST_CHATS)).map(toChat);
}

export function getChat(id: string): Chat | null {
  const row = db().getFirstSync<ChatRow>(`SELECT ${CHAT_COLUMNS} FROM chats WHERE id = ?`, id);
  return row ? toChat(row) : null;
}

const searchTerms = (query: string) => query.trim().split(/\s+/).filter(Boolean);

export function searchChats(query: string): string[] {
  const terms = searchTerms(query).map((term) => `"${term.replace(/"/g, '""')}"*`).join(" ");
  if (!terms) return [];
  return db().getAllSync<{ chat_id: string }>("SELECT DISTINCT chat_id FROM chat_search WHERE chat_search MATCH ? LIMIT 200", terms).map((row) => row.chat_id);
}

/** The newest message in a chat containing every word of a search, so a search result opens where it matched. */
export function newestMatch(chatId: string, query: string): string | null {
  const terms = searchTerms(query).slice(0, 6);
  if (!terms.length) return null;
  const like = terms.map(() => "content LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((term) => `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
  return db().getFirstSync<{ id: string }>(`SELECT id FROM messages WHERE chat_id = ? AND ${like} ORDER BY position DESC LIMIT 1`, chatId, ...params)?.id ?? null;
}

export function createChat(chat: Omit<Chat, "preview" | "pinned" | "modelSettings"> & { preview?: string; modelSettings?: Chat["modelSettings"] }) {
  db().runSync("INSERT INTO chats (id, title, models, model_settings, workspace_id, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", chat.id, chat.title, JSON.stringify(chat.models), JSON.stringify(chat.modelSettings ?? {}), chat.workspaceId, chat.preview ?? "", chat.createdAt, chat.updatedAt);
}

/** Saves one model's settings in a chat; settings left at their defaults are stored as nothing. */
export function setModelSettings(chatId: string, modelId: string, settings: ModelSettings) {
  const chat = getChat(chatId);
  if (!chat) return;
  const next = { ...chat.modelSettings };
  const cleaned = cleanSettings(settings);
  if (Object.keys(cleaned).length) next[modelId] = cleaned;
  else delete next[modelId];
  db().runSync("UPDATE chats SET model_settings = ? WHERE id = ?", JSON.stringify(next), chatId);
}

export function updateChat(id: string, patch: Partial<Pick<Chat, "title" | "models" | "pinned" | "preview" | "updatedAt" | "modelSettings">>) {
  const sets: string[] = [];
  const values: SQLite.SQLiteBindValue[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); values.push(patch.title); }
  if (patch.models !== undefined) { sets.push("models = ?"); values.push(JSON.stringify(patch.models)); }
  if (patch.modelSettings !== undefined) { sets.push("model_settings = ?"); values.push(JSON.stringify(patch.modelSettings)); }
  if (patch.pinned !== undefined) { sets.push("pinned = ?"); values.push(patch.pinned ? 1 : 0); }
  if (patch.preview !== undefined) { sets.push("preview = ?"); values.push(patch.preview); }
  if (patch.updatedAt !== undefined) { sets.push("updated_at = ?"); values.push(patch.updatedAt); }
  if (!sets.length) return;
  db().runSync(`UPDATE chats SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
}

export function deleteChat(id: string) {
  db().withTransactionSync(() => {
    db().runSync("DELETE FROM chat_search WHERE chat_id = ?", id);
    db().runSync("DELETE FROM chats WHERE id = ?", id);
  });
}

export function getMessage(id: string): ChatMessage | null {
  const row = db().getFirstSync<MessageRow>(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ?`, id);
  return row ? toMessage(row) : null;
}

export function nextPosition(chatId: string) {
  return (db().getFirstSync<{ next: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM messages WHERE chat_id = ?", chatId)?.next ?? 0);
}

export function insertMessage(message: ChatMessage) {
  db().runSync(
    "INSERT INTO messages (id, chat_id, role, model, parent_id, content, reasoning, status, error, error_code, error_status, attachments, usage, notice, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    message.id, message.chatId, message.role, message.model, message.parentId, message.content, message.reasoning, message.status, message.error, message.errorCode, message.errorStatus, JSON.stringify(message.attachments), message.usage ? JSON.stringify(message.usage) : null, message.notice, message.createdAt, message.position,
  );
  if (message.role === "user" && message.content) db().runSync("INSERT INTO chat_search (chat_id, body) VALUES (?, ?)", message.chatId, message.content);
}

export type MessagePatch = Partial<Pick<ChatMessage, "content" | "reasoning" | "status" | "error" | "errorCode" | "errorStatus" | "usage" | "notice">>;

export function updateMessage(id: string, patch: MessagePatch) {
  const sets: string[] = [];
  const values: SQLite.SQLiteBindValue[] = [];
  if (patch.content !== undefined) { sets.push("content = ?"); values.push(patch.content); }
  if (patch.reasoning !== undefined) { sets.push("reasoning = ?"); values.push(patch.reasoning); }
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.error !== undefined) { sets.push("error = ?"); values.push(patch.error); }
  if (patch.errorCode !== undefined) { sets.push("error_code = ?"); values.push(patch.errorCode); }
  if (patch.errorStatus !== undefined) { sets.push("error_status = ?"); values.push(patch.errorStatus); }
  if (patch.usage !== undefined) { sets.push("usage = ?"); values.push(patch.usage ? JSON.stringify(patch.usage) : null); }
  if (patch.notice !== undefined) { sets.push("notice = ?"); values.push(patch.notice); }
  if (!sets.length) return;
  db().runSync(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
}

export function indexAnswer(chatId: string, content: string) {
  if (content) db().runSync("INSERT INTO chat_search (chat_id, body) VALUES (?, ?)", chatId, content);
}

/** Edit and resend: the message and everything after it go, with any summary that covered them. */
export function deleteMessagesFrom(chatId: string, position: number) {
  db().withTransactionSync(() => {
    db().runSync("DELETE FROM chat_summaries WHERE chat_id = ? AND through_position >= ?", chatId, position);
    db().runSync("DELETE FROM messages WHERE chat_id = ? AND position >= ?", chatId, position);
  });
}

// ---- Streaming writes ----

let deltaStatement: SQLite.SQLiteStatement | null = null;

export type StreamDelta = { messageId: string; seq: number; content: string; reasoning: string };

/**
 * Appends what answers streamed since their last flush, all in one transaction (desktop's group commit).
 * Each row holds only the new text, so a flush costs the same at the end of a long answer as at its start.
 */
export function appendDeltas(deltas: StreamDelta[]) {
  if (!deltas.length) return;
  const database = db();
  deltaStatement ??= database.prepareSync("INSERT OR REPLACE INTO message_deltas (message_id, seq, content, reasoning) VALUES (?, ?, ?, ?)");
  const statement = deltaStatement;
  database.withTransactionSync(() => {
    for (const delta of deltas) statement.executeSync(delta.messageId, delta.seq, delta.content, delta.reasoning);
  });
}

/** Writes an answer's final text and state once, and drops its streamed pieces. */
export function finishMessage(id: string, patch: MessagePatch) {
  db().withTransactionSync(() => {
    updateMessage(id, patch);
    db().runSync("DELETE FROM message_deltas WHERE message_id = ?", id);
  });
}

// ---- Pages of a conversation (whole turns: a user message and every answer to it) ----

export type MessagePage = { messages: ChatMessage[]; summaries: ChatSummary[]; hasEarlier: boolean; hasLater: boolean };
type Maybe<T> = T | Promise<T>;
const then = <T, U>(value: Maybe<T>, next: (value: T) => Maybe<U>): Maybe<U> => (value instanceof Promise ? value.then(next) : next(value));
const read = <T,>(sync: boolean, sql: string, params: SQLite.SQLiteBindValue[]): Maybe<T[]> => (sync ? db().getAllSync<T>(sql, params) : db().getAllAsync<T>(sql, params));

const TURNS_BEFORE = "SELECT position FROM messages WHERE chat_id = ? AND role = 'user' AND position < ? ORDER BY position DESC LIMIT ?";
const TURNS_FROM = "SELECT position FROM messages WHERE chat_id = ? AND role = 'user' AND position >= ? ORDER BY position LIMIT ?";
const ROWS_BETWEEN = `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE chat_id = ? AND position >= ? AND position < ? ORDER BY position`;
const SUMMARIES_BETWEEN = "SELECT chat_id, model, through_position, summary, usage, created_at FROM chat_summaries WHERE chat_id = ? AND through_position >= ? AND through_position < ? ORDER BY through_position, model";

/** Messages from position `from` up to (not including) `to`, with the summaries that start inside them. */
function rows(sync: boolean, chatId: string, from: number, to: number, edges: { hasEarlier: boolean; hasLater: boolean }): Maybe<MessagePage> {
  return then(read<MessageRow>(sync, ROWS_BETWEEN, [chatId, from, to]), (messageRows) => {
    const messages = messageRows.map(toMessage);
    const first = messages[0]?.position ?? from;
    const last = messages.at(-1)?.position ?? from;
    return then(read<SummaryRow>(sync, SUMMARIES_BETWEEN, [chatId, first - 1, last]), (summaryRows) => ({ messages, summaries: summaryRows.map(toSummary), ...edges }));
  });
}

const END = Number.MAX_SAFE_INTEGER;

/** The newest `turns` turns. */
export function newestPage(chatId: string, turns: number, sync = false): Maybe<MessagePage> {
  return then(read<{ position: number }>(sync, TURNS_BEFORE, [chatId, END, turns + 1]), (starts) => {
    const start = starts.length > turns ? starts[turns - 1]!.position : 0;
    return rows(sync, chatId, start, END, { hasEarlier: starts.length > turns, hasLater: false });
  });
}

/** Up to `turns` turns before position `before`. */
export function olderPage(chatId: string, before: number, turns: number, sync = false): Maybe<MessagePage> {
  return then(read<{ position: number }>(sync, TURNS_BEFORE, [chatId, before, turns + 1]), (starts) => {
    if (!starts.length) return { messages: [], summaries: [], hasEarlier: false, hasLater: true };
    const start = starts.length > turns ? starts[turns - 1]!.position : 0;
    return rows(sync, chatId, start, before, { hasEarlier: starts.length > turns, hasLater: true });
  });
}

/** Up to `turns` turns after position `after`. */
export function newerPage(chatId: string, after: number, turns: number, sync = false): Maybe<MessagePage> {
  return then(read<{ position: number }>(sync, TURNS_FROM, [chatId, after + 1, turns + 1]), (starts) => {
    const end = starts.length > turns ? starts[turns]!.position : END;
    return rows(sync, chatId, after + 1, end, { hasEarlier: true, hasLater: starts.length > turns });
  });
}

/** About `turns` turns around the turn holding message `messageId`, for links to a message. */
export function pageAround(chatId: string, messageId: string, turns: number): MessagePage | null {
  const target = db().getFirstSync<{ position: number }>("SELECT position FROM messages WHERE id = ? AND chat_id = ?", messageId, chatId);
  if (!target) return null;
  const turnStart = db().getFirstSync<{ position: number | null }>("SELECT max(position) AS position FROM messages WHERE chat_id = ? AND role = 'user' AND position <= ?", chatId, target.position)?.position ?? 0;
  const before = Math.floor(turns / 2);
  const earlier = db().getAllSync<{ position: number }>(TURNS_BEFORE, [chatId, turnStart, before + 1]);
  const later = db().getAllSync<{ position: number }>(TURNS_FROM, [chatId, turnStart, turns - before + 1]);
  const start = earlier.length > before ? earlier[before - 1]!.position : 0;
  const end = later.length > turns - before ? later[turns - before]!.position : END;
  return rows(true, chatId, start, end, { hasEarlier: earlier.length > before, hasLater: later.length > turns - before }) as MessagePage;
}

// ---- What one model sees (requests and compaction) ----

/** A message in one model's thread: every user message, and only that model's finished answers. */
export type ThreadMessage = { id: string; role: "user" | "assistant"; content: string; attachments: ChatAttachment[]; position: number };

const THREAD_WHERE = "chat_id = ? AND position > ? AND position <= ? AND (role = 'user' OR (model = ? AND status != 'error' AND content != ''))";

/**
 * How big one model's thread is between two positions, counted in SQLite so nothing is read into JS;
 * `charsSince` counts only from position `since` (the previous answer, whose request size the gateway reported).
 */
export async function threadSize(chatId: string, model: string, after: number, upTo: number, since = upTo + 1) {
  const row = await db().getFirstAsync<{ n: number; chars: number | null; since: number | null }>(`SELECT count(*) AS n, sum(length(content)) AS chars, sum(CASE WHEN position >= ? THEN length(content) ELSE 0 END) AS since FROM messages WHERE ${THREAD_WHERE}`, since, chatId, after, upTo, model);
  return { messages: row?.n ?? 0, chars: row?.chars ?? 0, charsSince: row?.since ?? 0 };
}

/**
 * The newest messages of one model's thread that fit in `budgetChars` (counting from the newest), read off
 * the JS thread. `skipped` is how many older messages of the range didn't fit.
 */
export async function threadTail(chatId: string, model: string, after: number, upTo: number, budgetChars: number): Promise<{ messages: ThreadMessage[]; skipped: number }> {
  // The whole thread (the usual case: it fits) needs no running totals.
  const result = budgetChars >= Number.MAX_SAFE_INTEGER
    ? await db().getAllAsync<{ id: string; role: string; content: string; attachments: string; position: number; total: number }>(`SELECT id, role, content, attachments, position, 0 AS total FROM messages WHERE ${THREAD_WHERE} ORDER BY position`, chatId, after, upTo, model)
    : await db().getAllAsync<{ id: string; role: string; content: string; attachments: string; position: number; total: number }>(
    `SELECT id, role, content, attachments, position, total FROM (
      SELECT id, role, content, attachments, position,
        sum(length(content)) OVER (ORDER BY position DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS from_end,
        count(*) OVER () AS total
      FROM messages WHERE ${THREAD_WHERE}
    ) WHERE from_end - length(content) < ? ORDER BY position`,
    chatId, after, upTo, model, budgetChars,
  );
  return {
    messages: result.map((row) => ({ id: row.id, role: row.role === "user" ? "user" : "assistant", content: row.content, attachments: row.attachments === "[]" ? [] : parseJson<ChatAttachment[]>(row.attachments, []), position: row.position })),
    skipped: Math.max(0, (result[0]?.total ?? 0) - result.length),
  };
}

/** The last finished answer of a model before a position, for its usage (the gateway's count of that request). */
export async function lastAnswerUsage(chatId: string, model: string, before: number) {
  const row = await db().getFirstAsync<{ position: number; usage: string | null; notice: string | null; created_at: number }>("SELECT position, usage, notice, created_at FROM messages WHERE chat_id = ? AND model = ? AND role = 'assistant' AND status = 'done' AND usage IS NOT NULL AND position < ? ORDER BY position DESC LIMIT 1", chatId, model, before);
  return row ? { position: row.position, usage: parseJson<MessageUsage | null>(row.usage, null), notice: row.notice, createdAt: row.created_at } : null;
}

/** The newest summary for a model that ends before a position. */
export async function latestSummary(chatId: string, model: string, before: number): Promise<ChatSummary | null> {
  const row = await db().getFirstAsync<SummaryRow>("SELECT chat_id, model, through_position, summary, usage, created_at FROM chat_summaries WHERE chat_id = ? AND model = ? AND through_position < ? ORDER BY through_position DESC LIMIT 1", chatId, model, before);
  return row ? toSummary(row) : null;
}

export function saveSummary(summary: ChatSummary) {
  db().runSync("INSERT OR REPLACE INTO chat_summaries (chat_id, model, through_position, summary, usage, created_at) VALUES (?, ?, ?, ?, ?, ?)", summary.chatId, summary.model, summary.throughPosition, summary.summary, summary.usage ? JSON.stringify(summary.usage) : null, summary.createdAt);
}

// ---- Branching ----

/**
 * Copies a chat up to a position into another chat inside SQLite, so long chats branch without reading every
 * message into JS: user messages, the kept models' answers, and those models' summaries. Positions are kept,
 * so the summaries still line up.
 */
export function copyMessages(args: { from: string; to: string; upTo: number; models: string[]; newId: () => string }) {
  const database = db();
  const placeholders = args.models.map(() => "?").join(", ") || "NULL";
  const kept = database.getAllSync<{ id: string; parent_id: string | null }>(`SELECT id, parent_id FROM messages WHERE chat_id = ? AND position <= ? AND (role = 'user' OR model IN (${placeholders})) ORDER BY position`, args.from, args.upTo, ...args.models);
  const ids = new Map(kept.map((row) => [row.id, args.newId()]));
  database.withTransactionSync(() => {
    const copy = database.prepareSync(`INSERT INTO messages (${MESSAGE_COLUMNS}) SELECT ?, ?, role, model, ?, content, reasoning, CASE WHEN status = 'streaming' THEN 'stopped' ELSE status END, error, error_code, error_status, attachments, usage, notice, created_at, position FROM messages WHERE id = ?`);
    try {
      for (const row of kept) copy.executeSync(ids.get(row.id)!, args.to, row.parent_id ? ids.get(row.parent_id) ?? null : null, row.id);
    } finally {
      copy.finalizeSync();
    }
    database.runSync("INSERT INTO chat_search (chat_id, body) SELECT ?, content FROM messages WHERE chat_id = ? AND content != '' AND (role = 'user' OR status = 'done')", args.to, args.to);
    database.runSync(`INSERT INTO chat_summaries (chat_id, model, through_position, summary, usage, created_at) SELECT ?, model, through_position, summary, usage, created_at FROM chat_summaries WHERE chat_id = ? AND through_position < ? AND model IN (${placeholders})`, args.to, args.from, args.upTo, ...args.models);
  });
  return kept.length;
}
