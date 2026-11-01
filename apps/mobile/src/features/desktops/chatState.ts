import type { PhoneActivity, PhoneChat, PhoneChatDetail, PhoneEntry, PhoneMessage } from "./protocol";

/** Chats that need the person first, then the most recently changed. */
export function sortChats<T extends PhoneChat>(chats: T[]): T[] {
  return [...chats].sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.updatedAt.localeCompare(a.updatedAt));
}

/** A chat_updated frame applied to the list: replaced in place, or added. */
export function mergeChat(chats: PhoneChat[], chat: PhoneChat): PhoneChat[] {
  const index = chats.findIndex((entry) => entry.id === chat.id);
  if (index < 0) return sortChats([...chats, chat]);
  const next = [...chats];
  next[index] = { ...chat };
  return sortChats(next);
}

/** A chat_updated frame applied to the open chat; a list-row update keeps the approvals and questions already shown. */
export function mergeDetail(current: PhoneChatDetail, chat: PhoneChat | PhoneChatDetail): PhoneChatDetail {
  return { approvals: current.approvals, questions: current.questions, ...chat };
}

/** An entries frame applied: changed entries replaced where they are, new ones added at the end in the order sent. */
export function applyEntries(entries: PhoneEntry[], changed: PhoneEntry[]): PhoneEntry[] {
  if (!changed.length) return entries;
  const next = [...entries];
  const at = new Map(next.map((entry, index) => [entry.id, index]));
  for (const entry of changed) {
    const index = at.get(entry.id);
    if (index === undefined) { at.set(entry.id, next.length); next.push(entry); }
    else next[index] = entry;
  }
  return next;
}

/** An earlier page put in front of what's shown, without repeating entries both have. */
export function prependEntries(entries: PhoneEntry[], earlier: PhoneEntry[]): PhoneEntry[] {
  const shown = new Set(entries.map((entry) => entry.id));
  return [...earlier.filter((entry) => !shown.has(entry.id)), ...entries];
}

/** The id to pass as `before` for the page before these: the first message's, never an activity's. */
export const firstMessageId = (entries: PhoneEntry[]) => entries.find((entry): entry is PhoneMessage => entry.kind === "message")?.id;

/** Messages stand alone; runs of activities between them fold into one collapsed group. */
export type ChatItem = { kind: "message"; message: PhoneMessage } | { kind: "activities"; id: string; activities: PhoneActivity[] };
export function chatItems(entries: PhoneEntry[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const entry of entries) {
    if (entry.kind === "message") { items.push({ kind: "message", message: entry }); continue; }
    const last = items.at(-1);
    if (last?.kind === "activities") last.activities.push(entry);
    else items.push({ kind: "activities", id: `activities-${entry.id}`, activities: [entry] });
  }
  return items;
}

const statusWords: Record<PhoneChat["status"], string> = {
  idle: "Idle",
  running: "Working",
  waiting: "Waiting",
  limited: "Paused by a limit",
  failed: "Failed",
  interrupted: "Stopped",
  completed: "Done",
};
export const chatStatusLabel = (chat: PhoneChat) => (chat.needsYou ? chat.attention ?? "Needs you" : statusWords[chat.status]);
