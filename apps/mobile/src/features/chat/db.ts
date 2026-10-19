import * as SQLite from "expo-sqlite";
import { perf } from "@/perf";
import { migrateChatDatabase } from "./migrations";
import { cleanSettings, type ModelSettings } from "./settings";
import type { Chat, ChatAttachment, ChatMessage } from "./types";

let database: SQLite.SQLiteDatabase | null = null;

export function db() {
  if (database) return database;
  database = SQLite.openDatabaseSync("phaseo-chats.db");
  database.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
  perf?.attachDb(database);
  const opened = database;
  if (perf) perf.time("db.migrate", () => migrateChatDatabase(opened), (from) => ({ from }));
  else migrateChatDatabase(opened);
  // A run can't survive the app being closed; anything left streaming was interrupted.
  database.runSync("UPDATE messages SET status = 'stopped' WHERE status = 'streaming'");
  return database;
}

type ChatRow = { id: string; title: string; models: string; model_settings: string | null; pinned: number; workspace_id: string | null; preview: string; created_at: number; updated_at: number };
type MessageRow = { id: string; chat_id: string; role: string; model: string | null; parent_id: string | null; content: string; reasoning: string; status: string; error: string | null; attachments: string; usage: string | null; created_at: number; position: number; error_code: string | null; error_status: number | null };

const parseJson = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const toChat = (row: ChatRow): Chat => ({ id: row.id, title: row.title, models: parseJson(row.models, []), modelSettings: parseJson<Record<string, ModelSettings>>(row.model_settings, {}), pinned: row.pinned === 1, workspaceId: row.workspace_id, preview: row.preview, createdAt: row.created_at, updatedAt: row.updated_at });

const toMessage = (row: MessageRow): ChatMessage => ({
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
  attachments: parseJson<ChatAttachment[]>(row.attachments, []),
  usage: parseJson(row.usage, null),
  createdAt: row.created_at,
  position: row.position,
});

export function listChats(): Chat[] {
  return db().getAllSync<ChatRow>("SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC").map(toChat);
}

export function getChat(id: string): Chat | null {
  const row = db().getFirstSync<ChatRow>("SELECT * FROM chats WHERE id = ?", id);
  return row ? toChat(row) : null;
}

export function searchChats(query: string): string[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((term) => `"${term.replace(/"/g, '""')}"*`).join(" ");
  if (!terms) return [];
  return db().getAllSync<{ chat_id: string }>("SELECT DISTINCT chat_id FROM chat_search WHERE chat_search MATCH ? LIMIT 200", terms).map((row) => row.chat_id);
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

export function listMessages(chatId: string): ChatMessage[] {
  return db().getAllSync<MessageRow>("SELECT * FROM messages WHERE chat_id = ? ORDER BY position", chatId).map(toMessage);
}

export function nextPosition(chatId: string) {
  return (db().getFirstSync<{ next: number }>("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM messages WHERE chat_id = ?", chatId)?.next ?? 0);
}

export function insertMessage(message: ChatMessage) {
  db().runSync(
    "INSERT INTO messages (id, chat_id, role, model, parent_id, content, reasoning, status, error, error_code, error_status, attachments, usage, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    message.id, message.chatId, message.role, message.model, message.parentId, message.content, message.reasoning, message.status, message.error, message.errorCode, message.errorStatus, JSON.stringify(message.attachments), message.usage ? JSON.stringify(message.usage) : null, message.createdAt, message.position,
  );
  if (message.role === "user" && message.content) db().runSync("INSERT INTO chat_search (chat_id, body) VALUES (?, ?)", message.chatId, message.content);
}

export function updateMessage(id: string, patch: Partial<Pick<ChatMessage, "content" | "reasoning" | "status" | "error" | "errorCode" | "errorStatus" | "usage">>) {
  const sets: string[] = [];
  const values: SQLite.SQLiteBindValue[] = [];
  if (patch.content !== undefined) { sets.push("content = ?"); values.push(patch.content); }
  if (patch.reasoning !== undefined) { sets.push("reasoning = ?"); values.push(patch.reasoning); }
  if (patch.status !== undefined) { sets.push("status = ?"); values.push(patch.status); }
  if (patch.error !== undefined) { sets.push("error = ?"); values.push(patch.error); }
  if (patch.errorCode !== undefined) { sets.push("error_code = ?"); values.push(patch.errorCode); }
  if (patch.errorStatus !== undefined) { sets.push("error_status = ?"); values.push(patch.errorStatus); }
  if (patch.usage !== undefined) { sets.push("usage = ?"); values.push(patch.usage ? JSON.stringify(patch.usage) : null); }
  if (!sets.length) return;
  db().runSync(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
}

export function indexAnswer(chatId: string, content: string) {
  if (content) db().runSync("INSERT INTO chat_search (chat_id, body) VALUES (?, ?)", chatId, content);
}

export function deleteMessagesFrom(chatId: string, position: number) {
  db().runSync("DELETE FROM messages WHERE chat_id = ? AND position >= ?", chatId, position);
}
