import type { Chat, ChatMessage } from "./types";

/**
 * Chat exports (Account → Chats on this device, and a chat's menu): Markdown to read, or JSON to keep. Messages are
 * read a page at a time and written as they're read, so a 2,000-turn chat never sits in memory whole.
 */

export type ExportFormat = "markdown" | "json";
export type ExportSink = { write(text: string): Promise<void> | void };
export type ExportOptions = {
  /** A model's name for headings ("GPT-6 Sol"). */
  modelName(modelId: string): string;
  /** How dates read in Markdown. */
  formatTime(ms: number): string;
  appVersion: string;
  exportedAt: number;
  /** Messages read per page. */
  pageSize?: number;
};
export type PageReader = (chatId: string, afterPosition: number, limit: number) => Promise<ChatMessage[]>;

export const EXPORT_PAGE_SIZE = 200;
export const EXPORT_MIME: Record<ExportFormat, string> = { markdown: "text/markdown", json: "application/json" };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A file name from the chat's title (or "phaseo-chats" for several), safe on every file system. */
export function exportFileName(chats: Pick<Chat, "title">[], format: ExportFormat, exportedAt: number) {
  const date = new Date(exportedAt).toISOString().slice(0, 10);
  const base = chats.length === 1 ? chats[0]!.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat" : "phaseo-chats";
  return `${base}-${date}.${format === "markdown" ? "md" : "json"}`;
}

// ---- Markdown ----

export function markdownHeader(count: number, options: ExportOptions) {
  return `# Phaseo chats\n\nExported from Phaseo for Android ${options.appVersion} on ${options.formatTime(options.exportedAt)}. ${plural(count, "chat")}.\n`;
}

export function markdownChat(chat: Chat, options: ExportOptions) {
  const models = chat.models.map((id) => `${options.modelName(id)} (${id})`).join(", ");
  return `\n---\n\n## ${chat.title || "Untitled chat"}\n\n${models ? `Models: ${models}  \n` : ""}Started ${options.formatTime(chat.createdAt)} · Last message ${options.formatTime(chat.updatedAt)}\n`;
}

/** Quotes a block of text so its own headings and rules stay inside the message. */
const indentReasoning = (text: string) => text.split("\n").map((line) => `> ${line}`).join("\n");

export function markdownMessage(message: ChatMessage, options: ExportOptions) {
  const who = message.role === "user" ? "You" : options.modelName(message.model ?? "model");
  const parts = [`\n### ${who} · ${options.formatTime(message.createdAt)}\n`];
  if (message.reasoning.trim()) parts.push(`\n${indentReasoning(`Reasoning:\n\n${message.reasoning.trim()}`)}\n`);
  if (message.content) parts.push(`\n${message.content.trim()}\n`);
  if (message.attachments.length) parts.push(`\nAttachments: ${message.attachments.map((attachment) => `${attachment.name} (${attachment.kind})`).join(", ")}\n`);
  if (message.status === "error") parts.push(`\n_The answer failed${message.error ? `: ${message.error}` : "."}_\n`);
  else if (message.status === "stopped") parts.push("\n_Stopped before the answer finished._\n");
  return parts.join("");
}

// ---- JSON ----

const iso = (ms: number) => new Date(ms).toISOString();

export function jsonMessage(message: ChatMessage) {
  return JSON.stringify({
    id: message.id,
    role: message.role,
    model: message.model,
    content: message.content,
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    status: message.status,
    ...(message.error ? { error: message.error } : {}),
    createdAt: iso(message.createdAt),
    attachments: message.attachments.map((attachment) => ({ name: attachment.name, kind: attachment.kind, mimeType: attachment.mimeType, size: attachment.size ?? null })),
    ...(message.usage ? { usage: message.usage } : {}),
  });
}

export function jsonChatStart(chat: Chat) {
  const head = JSON.stringify({ id: chat.id, title: chat.title, models: chat.models, pinned: chat.pinned, createdAt: iso(chat.createdAt), updatedAt: iso(chat.updatedAt) });
  return `${head.slice(0, -1)},"messages":[`;
}

// ---- Writing ----

/** Writes one chat, reading its messages a page at a time. Returns how many messages were written. */
export async function writeChat(chat: Chat, format: ExportFormat, sink: ExportSink, read: PageReader, options: ExportOptions, first: boolean) {
  const pageSize = options.pageSize ?? EXPORT_PAGE_SIZE;
  await sink.write(format === "markdown" ? markdownChat(chat, options) : `${first ? "" : ","}\n${jsonChatStart(chat)}`);
  let after = -1;
  let written = 0;
  for (;;) {
    const page = await read(chat.id, after, pageSize);
    if (!page.length) break;
    await sink.write(page.map((message, index) => (format === "markdown" ? markdownMessage(message, options) : `${written + index === 0 ? "" : ","}\n${jsonMessage(message)}`)).join(""));
    written += page.length;
    after = page.at(-1)!.position;
    if (page.length < pageSize) break;
  }
  if (format === "json") await sink.write("\n]}");
  return written;
}

/** Writes the whole export: a header, then each chat in turn. */
export async function writeExport(chats: Chat[], format: ExportFormat, sink: ExportSink, read: PageReader, options: ExportOptions) {
  await sink.write(format === "markdown" ? markdownHeader(chats.length, options) : `{"app":"Phaseo for Android","appVersion":${JSON.stringify(options.appVersion)},"format":1,"exportedAt":"${iso(options.exportedAt)}","chats":[`);
  let messages = 0;
  for (const [index, chat] of chats.entries()) messages += await writeChat(chat, format, sink, read, options, index === 0);
  if (format === "json") await sink.write("\n]}\n");
  return { chats: chats.length, messages };
}

/** Collects small writes and passes them on in chunks of about `size` characters. */
export function bufferedSink(target: (text: string) => Promise<void> | void, size = 64 * 1024) {
  let buffer: string[] = [];
  let length = 0;
  const flush = async () => {
    if (!length) return;
    const text = buffer.join("");
    buffer = [];
    length = 0;
    await target(text);
  };
  return {
    async write(text: string) {
      buffer.push(text);
      length += text.length;
      if (length >= size) await flush();
    },
    flush,
  };
}
