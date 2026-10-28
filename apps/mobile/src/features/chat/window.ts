import { useEffect, useMemo, useState } from "react";
import { endTimer, measure, startTimer } from "@/lib/diagnostics";
import { createStore } from "@/lib/store";
import { perf } from "@/perf";
import { newestPage, newerPage, olderPage, pageAround, type MessagePage } from "./db";
import type { ChatMessage, ChatSummary } from "./types";

/**
 * The part of a conversation in memory, like the desktop app's conversation pages (shared/conversationPage.ts,
 * renderer/lib/useConversationPage.ts): a chat opens at its newest turns, pages of older or newer turns load
 * as the reader nears either end, and the window keeps at most MAX_TURNS turns so a 2,000-turn chat costs
 * what a 60-turn one does. Turns are never split, so every answer stays with its question.
 *
 * The runner reports changes (a message added, an answer finishing, a summary written) and the window
 * applies just that change; nothing re-reads the chat while it streams.
 */
export const PAGE_TURNS = 20;
export const MAX_TURNS = 60;

export type ChatWindow = {
  messages: ChatMessage[];
  summaries: ChatSummary[];
  hasEarlier: boolean;
  hasLater: boolean;
  loading: "older" | "newer" | "latest" | null;
  error: string | null;
  /** Bumped when the window is replaced (jump to latest), so the list can scroll to its end. */
  generation: number;
};

type Window = { store: ReturnType<typeof createStore<ChatWindow>>; refs: number; request: number };
const windows = new Map<string, Window>();

const fromPage = (page: MessagePage, generation = 0): ChatWindow => ({ messages: page.messages, summaries: page.summaries, hasEarlier: page.hasEarlier, hasLater: page.hasLater, loading: null, error: null, generation });

const turnCount = (messages: readonly ChatMessage[]) => messages.reduce((count, message) => count + (message.role === "user" ? 1 : 0), 0);

/** Index of the user message that starts turn `turn` (0-based), or messages.length. */
function turnIndex(messages: readonly ChatMessage[], turn: number) {
  let seen = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]!.role === "user" && ++seen === turn) return index;
  }
  return messages.length;
}

const summaryKey = (summary: ChatSummary) => `${summary.model}\u0000${summary.throughPosition}`;

function mergeSummaries(messages: readonly ChatMessage[], ...lists: ChatSummary[][]) {
  const first = messages[0]?.position ?? 0;
  const last = messages.at(-1)?.position ?? 0;
  const byKey = new Map<string, ChatSummary>();
  for (const list of lists) for (const summary of list) if (summary.throughPosition >= first - 1 && summary.throughPosition < last) byKey.set(summaryKey(summary), summary);
  return [...byKey.values()].sort((a, b) => a.throughPosition - b.throughPosition || a.model.localeCompare(b.model));
}

function open(chatId: string, focus: string | null): Window {
  const page = measure("Chat opened", () => (focus ? pageAround(chatId, focus, PAGE_TURNS * 2) : null) ?? (newestPage(chatId, PAGE_TURNS, true) as MessagePage), (result) => `${result.messages.length} messages${focus ? ", from a link" : ""}`);
  return { store: createStore(fromPage(page)), refs: 0, request: 0 };
}

async function load(chatId: string, mode: "older" | "newer" | "latest") {
  const window = windows.get(chatId);
  if (!window) return;
  const current = window.store.get();
  if (current.loading && mode !== "latest") return;
  if ((mode === "older" && !current.hasEarlier) || (mode === "newer" && !current.hasLater)) return;
  const request = ++window.request;
  window.store.set({ ...current, loading: mode, error: null });
  const started = startTimer();
  try {
    const first = current.messages[0];
    const last = current.messages.at(-1);
    const page = mode === "latest" || !first || !last
      ? await newestPage(chatId, PAGE_TURNS)
      : mode === "older" ? await olderPage(chatId, first.position, PAGE_TURNS) : await newerPage(chatId, last.position, PAGE_TURNS);
    if (windows.get(chatId) !== window || window.request !== request) return;
    endTimer("Chat page loaded", started, () => `${mode}, ${page.messages.length} messages`);
    perf?.log("window.page", { chatId, mode, ms: Math.round(performance.now() - started), messages: page.messages.length, hasEarlier: page.hasEarlier, hasLater: page.hasLater });
    const latest = window.store.get();
    if (mode === "latest") {
      window.store.set(fromPage(page, latest.generation + 1));
      return;
    }
    if (mode === "older") {
      // Pages are read by position, so the window stays contiguous even if messages arrived meanwhile.
      let messages = [...page.messages.filter((message) => message.position < (latest.messages[0]?.position ?? Infinity)), ...latest.messages];
      let hasLater = latest.hasLater;
      if (turnCount(messages) > MAX_TURNS) {
        messages = messages.slice(0, turnIndex(messages, MAX_TURNS));
        hasLater = true;
      }
      window.store.set({ ...latest, messages, summaries: mergeSummaries(messages, page.summaries, latest.summaries), hasEarlier: page.hasEarlier, hasLater, loading: null });
    } else {
      let messages = [...latest.messages, ...page.messages.filter((message) => message.position > (latest.messages.at(-1)?.position ?? -1))];
      let hasEarlier = latest.hasEarlier;
      const extra = turnCount(messages) - MAX_TURNS;
      if (extra > 0) {
        messages = messages.slice(turnIndex(messages, extra));
        hasEarlier = true;
      }
      window.store.set({ ...latest, messages, summaries: mergeSummaries(messages, latest.summaries, page.summaries), hasEarlier, hasLater: page.hasLater, loading: null });
    }
  } catch (error) {
    if (windows.get(chatId) !== window || window.request !== request) return;
    window.store.set({ ...window.store.get(), loading: null, error: error instanceof Error ? error.message : "Couldn't load these messages." });
  }
}

/**
 * A conversation's window, opened at its newest turns or around `focus` (a message to show, from a link or a
 * search). It stays shared while any screen shows the chat.
 */
export function useChatWindow(chatId: string, focus: string | null = null) {
  const [window] = useState(() => {
    let existing = windows.get(chatId);
    if (!existing || focus) {
      existing = open(chatId, focus);
      windows.set(chatId, existing);
    }
    return existing;
  });
  useEffect(() => retain(chatId, window), [chatId, window]);
  const state = window.store.use();
  const actions = useMemo(() => ({
    older: () => void load(chatId, "older"),
    newer: () => void load(chatId, "newer"),
    latest: () => void load(chatId, "latest"),
  }), [chatId]);
  return { ...state, ...actions };
}

/** Keeps a window while a screen shows it; the last screen to close it lets it go. */
function retain(chatId: string, window: Window) {
  window.refs += 1;
  if (windows.get(chatId) !== window) windows.set(chatId, window);
  return () => {
    window.refs -= 1;
    if (!window.refs && windows.get(chatId) === window) windows.delete(chatId);
  };
}

function update(chatId: string, change: (window: ChatWindow) => ChatWindow | null) {
  const window = windows.get(chatId);
  if (!window) return;
  const next = change(window.store.get());
  if (next) window.store.set(next);
}

/** A new message (a question, or an answer starting). Shown when the window is at the newest turns. */
export function messageAdded(message: ChatMessage) {
  update(message.chatId, (window) => {
    if (window.hasLater) return null;
    let messages = [...window.messages, message];
    let hasEarlier = window.hasEarlier;
    // A long session in one sitting still keeps the window bounded.
    const extra = turnCount(messages) - MAX_TURNS - PAGE_TURNS;
    if (extra > 0) {
      messages = messages.slice(turnIndex(messages, extra));
      hasEarlier = true;
    }
    return { ...window, messages, hasEarlier, summaries: hasEarlier !== window.hasEarlier ? mergeSummaries(messages, window.summaries) : window.summaries };
  });
}

/** A message changed (an answer finished, failed or restarted). Only that message's object is replaced. */
export function messageChanged(chatId: string, id: string, patch: Partial<ChatMessage>) {
  update(chatId, (window) => {
    const index = window.messages.findIndex((message) => message.id === id);
    if (index === -1) return null;
    const messages = window.messages.slice();
    messages[index] = { ...messages[index]!, ...patch };
    return { ...window, messages };
  });
}

/** A summary was written: its marker appears where the summarised messages end. */
export function summaryAdded(summary: ChatSummary) {
  update(summary.chatId, (window) => {
    const summaries = mergeSummaries(window.messages, window.summaries, [summary]);
    return summaries.length === window.summaries.length ? null : { ...window, summaries };
  });
}

/** The chat changed underneath the window (edit and resend): show its newest turns again. */
export function chatReloaded(chatId: string) {
  const window = windows.get(chatId);
  if (!window) return;
  window.request += 1;
  window.store.set(fromPage(newestPage(chatId, PAGE_TURNS, true) as MessagePage, window.store.get().generation + 1));
}

/** Every chat was deleted from the device: open windows read their (now empty) chats again. */
export function reloadAllWindows() {
  for (const chatId of [...windows.keys()]) chatReloaded(chatId);
}
