import * as Crypto from "expo-crypto";
import { ApiError } from "@/lib/api/http";
import { createChat, deleteMessagesFrom, getChat, indexAnswer, insertMessage, listMessages, nextPosition, updateChat, updateMessage } from "./db";
import { requestCapabilities } from "./models";
import type { ModelSettings } from "./settings";
import { liveStore, notifyChat } from "./state";
import { StreamError } from "./stream";
import { ChatRequestError, historyFor, streamCompletion } from "./transport";
import type { ChatAttachment, ChatMessage } from "./types";

const running = new Map<string, AbortController>();
const FLUSH_MS = 600;

export const isRunning = (messageId: string) => running.has(messageId);

function titleFrom(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "New chat";
}

export type PendingError = { code: string; message: string };
type ErrorListener = (chatId: string, error: PendingError) => void;
const errorListeners = new Set<ErrorListener>();

/** Lets the chat screen react to account-level errors (privacy review, sign-in, credit). */
export function onChatError(listener: ErrorListener) {
  errorListeners.add(listener);
  return () => { errorListeners.delete(listener); };
}

/** Creates a chat with its first message (and any settings chosen before it) and starts every model answering. */
export function startChat(args: { text: string; attachments: ChatAttachment[]; models: string[]; modelSettings?: Record<string, ModelSettings>; workspaceId: string | null }) {
  const now = Date.now();
  const chatId = Crypto.randomUUID();
  const modelSettings = Object.fromEntries(Object.entries(args.modelSettings ?? {}).filter(([model]) => args.models.includes(model)));
  createChat({ id: chatId, title: titleFrom(args.text), models: args.models, modelSettings, workspaceId: args.workspaceId, createdAt: now, updatedAt: now, preview: args.text.slice(0, 140) });
  sendMessage({ chatId, text: args.text, attachments: args.attachments, workspaceId: args.workspaceId });
  return chatId;
}

export function sendMessage(args: { chatId: string; text: string; attachments: ChatAttachment[]; workspaceId: string | null }) {
  const chat = getChat(args.chatId);
  if (!chat) return;
  const now = Date.now();
  const user: ChatMessage = { id: Crypto.randomUUID(), chatId: chat.id, role: "user", model: null, parentId: null, content: args.text, reasoning: "", status: "done", error: null, errorCode: null, errorStatus: null, attachments: args.attachments, usage: null, createdAt: now, position: nextPosition(chat.id) };
  insertMessage(user);
  updateChat(chat.id, { updatedAt: now, preview: args.text.slice(0, 140) });
  for (const model of chat.models) void answer(chat.id, user.id, model, args.workspaceId ?? chat.workspaceId);
  notifyChat(chat.id);
}

/** Runs one model's answer to one user message. */
async function answer(chatId: string, parentId: string, model: string, workspaceId: string | null, reuse?: ChatMessage) {
  const message: ChatMessage = reuse ?? { id: Crypto.randomUUID(), chatId, role: "assistant", model, parentId, content: "", reasoning: "", status: "streaming", error: null, errorCode: null, errorStatus: null, attachments: [], usage: null, createdAt: Date.now(), position: nextPosition(chatId) };
  if (reuse) updateMessage(message.id, { content: "", reasoning: "", status: "streaming", error: null, errorCode: null, errorStatus: null, usage: null });
  else insertMessage(message);
  notifyChat(chatId);

  const controller = new AbortController();
  running.set(message.id, controller);
  let content = "";
  let reasoning = "";
  let flushedAt = Date.now();
  const publish = () => {
    liveStore.set((current) => ({ ...current, [message.id]: { content, reasoning } }));
    if (Date.now() - flushedAt > FLUSH_MS) {
      flushedAt = Date.now();
      updateMessage(message.id, { content, reasoning });
    }
  };

  try {
    const history = await historyFor(listMessages(chatId), model, parentId);
    // Settings are read when the answer starts, so a change applies from the next message or retry.
    const settings = getChat(chatId)?.modelSettings[model];
    const result = await streamCompletion({
      model,
      messages: history,
      settings,
      capabilities: await requestCapabilities(model, settings),
      workspaceId,
      signal: controller.signal,
      onText: (text) => { content += text; publish(); },
      onReasoning: (text) => { reasoning += text; publish(); },
    });
    const usage = result.usage ? { inputTokens: result.usage.prompt_tokens, outputTokens: result.usage.completion_tokens, costUsd: typeof result.usage.cost === "number" ? result.usage.cost : undefined } : null;
    updateMessage(message.id, { content: result.text, reasoning: result.reasoning, status: "done", usage });
    indexAnswer(chatId, result.text);
  } catch (error) {
    const stopped = controller.signal.aborted;
    const text = error instanceof Error ? error.message : "The answer failed.";
    const code = error instanceof ChatRequestError || error instanceof StreamError ? error.code : error instanceof ApiError ? error.code ?? null : null;
    const status = error instanceof ChatRequestError || error instanceof ApiError ? error.status : null;
    updateMessage(message.id, { content, reasoning, status: stopped ? "stopped" : "error", error: stopped ? null : text, errorCode: stopped ? null : code, errorStatus: stopped ? null : status });
    if (!stopped && (error instanceof ChatRequestError || error instanceof ApiError)) for (const listener of errorListeners) listener(chatId, { code: code ?? "", message: text });
  } finally {
    running.delete(message.id);
    liveStore.set((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });
    updateChat(chatId, { updatedAt: Date.now() });
    notifyChat(chatId);
  }
}

export function stopAnswer(messageId: string) {
  running.get(messageId)?.abort();
}

export function stopChat(chatId: string) {
  for (const message of listMessages(chatId)) if (running.has(message.id)) running.get(message.id)?.abort();
}

/** Re-runs one answer in place with the same model. */
export function retryAnswer(message: ChatMessage, workspaceId: string | null) {
  if (message.role !== "assistant" || !message.parentId || !message.model || running.has(message.id)) return;
  void answer(message.chatId, message.parentId, message.model, workspaceId, message);
}

/** Edits a user message: everything after it is discarded and the models answer again. */
export function editAndResend(message: ChatMessage, text: string, workspaceId: string | null) {
  stopChat(message.chatId);
  deleteMessagesFrom(message.chatId, message.position);
  sendMessage({ chatId: message.chatId, text, attachments: message.attachments, workspaceId });
}

/** Copies a chat up to and including a message into a new chat (the website's "Branch"), with the kept models' settings. */
export function forkChat(message: ChatMessage, workspaceId: string | null) {
  const source = getChat(message.chatId);
  if (!source) return null;
  const now = Date.now();
  const chatId = Crypto.randomUUID();
  const models = message.role === "assistant" && message.model ? [message.model] : source.models;
  const modelSettings = Object.fromEntries(Object.entries(source.modelSettings).filter(([model]) => models.includes(model)));
  createChat({ id: chatId, title: `${source.title} (branch)`, models, modelSettings, workspaceId, createdAt: now, updatedAt: now, preview: source.preview });
  const kept = listMessages(message.chatId).filter((entry) => entry.position <= message.position && (entry.role === "user" || models.includes(entry.model ?? "")));
  const ids = new Map<string, string>();
  kept.forEach((entry, index) => {
    const id = Crypto.randomUUID();
    ids.set(entry.id, id);
    insertMessage({ ...entry, id, chatId, parentId: entry.parentId ? ids.get(entry.parentId) ?? null : null, status: entry.status === "streaming" ? "stopped" : entry.status, position: index });
  });
  notifyChat(chatId);
  return chatId;
}
