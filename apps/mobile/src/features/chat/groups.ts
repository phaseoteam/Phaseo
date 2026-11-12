import { formatMonth } from "@/lib/format";
import type { Chat, ChatMessage } from "./types";

/** Chat list sections, like web and desktop chat: pinned, then by last activity. */
export function chatGroup(chat: Chat, now = new Date()): string {
  if (chat.pinned) return "Pinned";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - new Date(chat.updatedAt).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return formatMonth(chat.updatedAt);
}

export type ChatListItem = { type: "header"; key: string; title: string } | { type: "chat"; key: string; chat: Chat };

export function groupChats(chats: Chat[], now = new Date()): ChatListItem[] {
  const items: ChatListItem[] = [];
  let current: string | null = null;
  for (const chat of chats) {
    const group = chatGroup(chat, now);
    if (group !== current) {
      items.push({ type: "header", key: `header:${group}`, title: group });
      current = group;
    }
    items.push({ type: "chat", key: chat.id, chat });
  }
  return items;
}

export type Turn = { key: string; user: ChatMessage; answers: ChatMessage[] };

/** One user message with every model's answer to it, in model order. */
export function toTurns(messages: ChatMessage[], models: string[]): Turn[] {
  const turns: Turn[] = [];
  const byId = new Map<string, Turn>();
  for (const message of messages) {
    if (message.role === "user") {
      const turn = { key: message.id, user: message, answers: [] };
      turns.push(turn);
      byId.set(message.id, turn);
    } else if (message.parentId && byId.has(message.parentId)) {
      byId.get(message.parentId)!.answers.push(message);
    }
  }
  const order = (model: string | null) => {
    const index = models.indexOf(model ?? "");
    return index === -1 ? models.length : index;
  };
  for (const turn of turns) turn.answers.sort((a, b) => order(a.model) - order(b.model) || a.position - b.position);
  return turns;
}
