import { createStore } from "@/lib/store";
import type { ChatAttachment } from "./types";

/**
 * Messages written while a chat's answers run wait here, on the phone, and go out one at a time as each batch of
 * answers finishes. A stopped or failed batch holds the queue until the person resumes it, so nothing is sent after
 * something went wrong without them seeing it. One queued message at a time can be edited in the composer; the queue
 * waits while it is.
 */
export type QueuedMessage = { id: string; text: string; attachments: ChatAttachment[]; workspaceId: string | null };
export type ChatQueue = { items: QueuedMessage[]; held: boolean; editing: string | null };

export const EMPTY_QUEUE: ChatQueue = { items: [], held: false, editing: null };

export const enqueue = (queue: ChatQueue, message: QueuedMessage): ChatQueue => ({ ...queue, items: [...queue.items, message] });

export const removeQueued = (queue: ChatQueue, id: string): ChatQueue => ({
  ...queue,
  items: queue.items.filter((item) => item.id !== id),
  editing: queue.editing === id ? null : queue.editing,
});

/** Starts editing a queued message; another edit can't start until this one is saved or cancelled. */
export function beginEdit(queue: ChatQueue, id: string): ChatQueue {
  if (queue.editing || !queue.items.some((item) => item.id === id)) return queue;
  return { ...queue, editing: id };
}

/** Saves the edit in the message's place. Emptied of text and attachments, the message leaves the queue. */
export function saveEdit(queue: ChatQueue, text: string, attachments: ChatAttachment[]): ChatQueue {
  if (!queue.editing) return queue;
  const id = queue.editing;
  if (!text.trim() && !attachments.length) return removeQueued(queue, id);
  return { ...queue, editing: null, items: queue.items.map((item) => (item.id === id ? { ...item, text: text.trim(), attachments } : item)) };
}

export const cancelEdit = (queue: ChatQueue): ChatQueue => (queue.editing ? { ...queue, editing: null } : queue);

/** How a batch of answers ended decides what the queue does next. */
export const settleQueue = (queue: ChatQueue, outcome: "done" | "stopped" | "error"): ChatQueue => (outcome === "done" || !queue.items.length ? queue : { ...queue, held: true });

export const resumeQueue = (queue: ChatQueue): ChatQueue => (queue.held ? { ...queue, held: false } : queue);

/** The next message to send, unless the queue is held or a message in it is being edited. */
export function takeNext(queue: ChatQueue): { next: QueuedMessage | null; queue: ChatQueue } {
  const [next, ...rest] = queue.items;
  if (!next || queue.held || queue.editing) return { next: null, queue };
  return { next, queue: { ...queue, items: rest } };
}

const store = createStore<Record<string, ChatQueue>>({});

export const chatQueues = {
  get: (chatId: string) => store.get()[chatId] ?? EMPTY_QUEUE,
  update(chatId: string, change: (queue: ChatQueue) => ChatQueue) {
    store.set((all) => {
      const before = all[chatId] ?? EMPTY_QUEUE;
      const after = change(before);
      if (after === before) return all;
      const next = { ...all };
      // An emptied queue is forgotten, so it isn't held for the next message.
      if (!after.items.length) delete next[chatId];
      else next[chatId] = after;
      return next;
    });
  },
  use: (chatId: string | null) => store.use((all) => (chatId ? all[chatId] : undefined) ?? EMPTY_QUEUE),
};
