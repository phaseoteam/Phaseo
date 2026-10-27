import { useMemo } from "react";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";
import { getChat, listChats, listMessages } from "./db";
import type { Chat, ChatMessage } from "./types";

export const MAX_CHAT_MODELS = 4;
const MODELS_KEY = "phaseo.chat.models";

/** Models for the next new chat; remembered between launches. */
export const chatModelStore = createStore<string[]>([]);

void kv.getItem(MODELS_KEY).then((value) => {
  try {
    const saved = JSON.parse(value ?? "[]") as unknown;
    if (Array.isArray(saved) && saved.every((entry) => typeof entry === "string") && !chatModelStore.get().length) chatModelStore.set(saved.slice(0, MAX_CHAT_MODELS));
  } catch { /* ignore */ }
});

chatModelStore.subscribe(() => void kv.setItem(MODELS_KEY, JSON.stringify(chatModelStore.get())));

export function toggleChatModel(id: string) {
  chatModelStore.set((current) => current.includes(id) ? (current.length > 1 ? current.filter((entry) => entry !== id) : current) : current.length >= MAX_CHAT_MODELS ? current : [...current, id]);
}

export function setChatModels(ids: string[]) {
  chatModelStore.set(ids.slice(0, MAX_CHAT_MODELS));
}

/** Bumped whenever chats or messages change shape (insert, delete, status, title). */
const versions = createStore<{ chats: number; byChat: Record<string, number> }>({ chats: 0, byChat: {} });

export function notifyChats() {
  versions.set((current) => ({ ...current, chats: current.chats + 1 }));
}

export function notifyChat(chatId: string) {
  versions.set((current) => ({ chats: current.chats + 1, byChat: { ...current.byChat, [chatId]: (current.byChat[chatId] ?? 0) + 1 } }));
}

export function useChats(): Chat[] {
  const version = versions.use((value) => value.chats);
  // SQLite reads are synchronous and cheap; re-read when the version changes.
  return useMemo<Chat[]>(() => (version >= 0 ? listChats() : []), [version]);
}

export function useChat(chatId: string | null) {
  const version = versions.use((value) => (chatId ? value.byChat[chatId] ?? 0 : 0));
  return useMemo<{ chat: Chat | null; messages: ChatMessage[] }>(
    () => (chatId && version >= 0 ? { chat: getChat(chatId), messages: listMessages(chatId) } : { chat: null, messages: [] }),
    [chatId, version],
  );
}

/** Text of answers still streaming, kept in memory so each token doesn't touch the database. */
export const liveStore = createStore<Record<string, { content: string; reasoning: string }>>({});

export function useLive(messageId: string) {
  return liveStore.use((value) => value[messageId]);
}
