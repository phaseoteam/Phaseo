import { useMemo } from "react";
import { measure } from "@/lib/diagnostics";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";
import { getChat, listChats, listChatsAsync, setModelSettings, updateChat } from "./db";
import { cleanSettings, sharedSettings, type ModelSettings } from "./settings";
import type { Chat } from "./types";

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

/** Settings picked for a new chat before its first message; they move into the chat when it starts. */
export const draftSettingsStore = createStore<Record<string, ModelSettings>>({});

/** Changes a chat's models (or, without a chat, the new chat's). At least one model always stays. */
export function setModelsFor(chatId: string | null, models: string[]) {
  const next = [...new Set(models)].slice(0, MAX_CHAT_MODELS);
  if (!next.length) return;
  if (!chatId) return setChatModels(next);
  updateChat(chatId, { models: next });
  notifyChat(chatId);
}

/** Reads one model's settings in a chat, or in the new-chat draft when there's no chat yet. */
export function settingsFor(chatId: string | null, modelId: string): ModelSettings {
  return (chatId ? getChat(chatId)?.modelSettings[modelId] : draftSettingsStore.get()[modelId]) ?? {};
}

export function saveSettings(chatId: string | null, modelId: string, settings: ModelSettings) {
  if (chatId) {
    setModelSettings(chatId, modelId, settings);
    notifyChat(chatId);
    return;
  }
  const cleaned = cleanSettings(settings);
  draftSettingsStore.set((current) => {
    const next = { ...current };
    if (Object.keys(cleaned).length) next[modelId] = cleaned;
    else delete next[modelId];
    return next;
  });
}

/**
 * The website's "Apply to all": the chat's other models get exactly one model's settings, keeping only their own
 * provider and name. A setting left at its default on the source goes back to the default on the others too.
 */
export function applySettingsToAll(chatId: string | null, fromModel: string, models: string[]) {
  const shared = sharedSettings(settingsFor(chatId, fromModel));
  for (const model of models) {
    if (model === fromModel) continue;
    const { providerId, displayName } = settingsFor(chatId, model);
    saveSettings(chatId, model, { ...shared, ...(providerId ? { providerId } : {}), ...(displayName ? { displayName } : {}) });
  }
}

// ---- The chat list ----
// Read once (synchronously, so the first screen is never empty), then kept current: a change to one chat
// (an answer finishing, a rename) patches that row; a deletion or pin re-reads the list off the JS thread.

let chatList: Chat[] | null = null;
const listVersion = createStore(0);
let refreshing = false;
let refreshAgain = false;

const ordered = (a: Chat, b: Chat) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;

export function useChats(): Chat[] {
  listVersion.use();
  chatList ??= measure("Chat list read", listChats, (chats) => `${chats.length} chats`);
  return chatList;
}

/** Re-reads the whole chat list (after a chat is deleted or pinned). */
export function notifyChats() {
  if (!chatList) return;
  if (refreshing) { refreshAgain = true; return; }
  refreshing = true;
  void listChatsAsync()
    .then((chats) => { chatList = chats; listVersion.set((version) => version + 1); })
    .catch(() => { chatList = null; listVersion.set((version) => version + 1); })
    .finally(() => {
      refreshing = false;
      if (refreshAgain) { refreshAgain = false; notifyChats(); }
    });
}

/** Versions of each chat's own row (title, models, settings); messages have their own window (window.ts). */
const chatVersions = createStore<Record<string, number>>({});

/** One chat's row changed (or was created): its screens re-read it and its row moves in the list. */
export function notifyChat(chatId: string) {
  chatVersions.set((current) => ({ ...current, [chatId]: (current[chatId] ?? 0) + 1 }));
  if (!chatList) return;
  const chat = getChat(chatId);
  const rest = chatList.filter((entry) => entry.id !== chatId);
  if (chat) {
    const at = rest.findIndex((entry) => ordered(chat, entry) <= 0);
    rest.splice(at === -1 ? rest.length : at, 0, chat);
  }
  chatList = rest;
  listVersion.set((version) => version + 1);
}

export function useChat(chatId: string | null) {
  const version = chatVersions.use((value) => (chatId ? value[chatId] ?? 0 : 0));
  return useMemo<{ chat: Chat | null }>(() => ({ chat: chatId && version >= 0 ? getChat(chatId) : null }), [chatId, version]);
}

// ---- Answers running per chat (for the composer's stop button, wherever the reader has scrolled) ----

const runningCounts = createStore<Record<string, number>>({});

export function setRunning(chatId: string, delta: 1 | -1) {
  runningCounts.set((current) => ({ ...current, [chatId]: Math.max(0, (current[chatId] ?? 0) + delta) }));
}

export function useChatRunning(chatId: string) {
  return runningCounts.use((value) => (value[chatId] ?? 0) > 0);
}
