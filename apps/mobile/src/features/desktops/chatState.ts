import type { PhoneActivity, PhoneChat, PhoneChatDetail, PhoneEntry, PhoneMessage, PhoneTurnChanges } from "./protocol";

/** Chats that need the person first, then the most recently changed. */
export function sortChats<T extends PhoneChat>(chats: T[]): T[] {
  return [...chats].sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.updatedAt.localeCompare(a.updatedAt));
}

/** A chat_updated frame applied to the list: replaced in place, or added; an archived chat leaves it. */
export function mergeChat(chats: PhoneChat[], chat: PhoneChat): PhoneChat[] {
  const index = chats.findIndex((entry) => entry.id === chat.id);
  if (chat.archived) return index < 0 ? chats : chats.filter((entry) => entry.id !== chat.id);
  if (index < 0) return sortChats([...chats, chat]);
  const next = [...chats];
  next[index] = { ...chat };
  return sortChats(next);
}

/** The archive screen's list: an archived chat added or replaced, a restored one removed. */
export function mergeArchived(chats: PhoneChat[], chat: PhoneChat): PhoneChat[] {
  const rest = chats.filter((entry) => entry.id !== chat.id);
  return chat.archived ? [chat, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : rest;
}

/**
 * A chat_updated frame applied to the open chat. A whole detail replaces it; a list-row update keeps what only the
 * detail carries (approvals, questions, queue, effort, agent, permissions, pull requests).
 */
export function mergeDetail(current: PhoneChatDetail, chat: PhoneChat | PhoneChatDetail): PhoneChatDetail {
  if ("approvals" in chat) return chat;
  const { approvals, questions, queue, reasoningEffort, harness, accountId, permissionMode, pullRequests } = current;
  return { approvals, questions, ...(queue ? { queue } : {}), ...(reasoningEffort ? { reasoningEffort } : {}), ...(harness ? { harness } : {}), ...(accountId ? { accountId } : {}), ...(permissionMode ? { permissionMode } : {}), ...(pullRequests ? { pullRequests } : {}), ...chat };
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

/**
 * Messages stand alone; runs of activities between them fold into one work log group. A turn that changed files ends
 * with a row saying how many, just before the next message of the person's (or at the end, once it is done).
 */
export type ChatItem =
  | { kind: "message"; message: PhoneMessage }
  | { kind: "activities"; id: string; activities: PhoneActivity[] }
  | { kind: "changes"; id: string; /** The person's message that started the turn. */ messageId: string; changes: PhoneTurnChanges };
export function chatItems(entries: PhoneEntry[]): ChatItem[] {
  const items: ChatItem[] = [];
  let turn: PhoneMessage | null = null;
  const closeTurn = () => { if (turn?.changes) items.push({ kind: "changes", id: `changes-${turn.id}`, messageId: turn.id, changes: turn.changes }); turn = null; };
  for (const entry of entries) {
    if (entry.kind === "message") {
      // A steer joins the running turn; it doesn't start one.
      if (entry.role === "user" && entry.delivery !== "steer") { closeTurn(); turn = entry; }
      items.push({ kind: "message", message: entry });
      continue;
    }
    const last = items.at(-1);
    if (last?.kind === "activities") last.activities.push(entry);
    else items.push({ kind: "activities", id: `activities-${entry.id}`, activities: [entry] });
  }
  closeTurn();
  return items;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * A work log group in one line: one step by its own title; more as what they were ("Ran 4 tools · Thought"), with
 * the step still running, or how many failed.
 */
export function workLogSummary(activities: readonly PhoneActivity[]) {
  const latest = activities.at(-1);
  if (!latest) return "";
  if (activities.length === 1) return latest.title;
  const count = (type: PhoneActivity["type"]) => activities.filter((activity) => activity.type === type).length;
  const tools = count("tool"), failed = activities.filter((activity) => activity.status === "failed").length;
  const running = activities.findLast((activity) => activity.status === "running");
  const parts = [
    tools ? `Ran ${plural(tools, "tool")}` : null,
    count("reasoning") ? "Thought" : null,
    count("plan") ? "Updated the plan" : null,
    count("compaction") ? "Compacted the context" : null,
  ].filter(Boolean);
  return [parts.length ? parts.join(" · ") : plural(activities.length, "step"), running ? running.title : failed ? `${failed} failed` : null].filter(Boolean).join(" · ");
}

/** "3 files changed · +12 −4", without lines when only binary files changed. */
export function changesLabel(changes: PhoneTurnChanges) {
  const files = `${plural(changes.files, "file")} changed`;
  return changes.additions < 0 ? files : `${files} · +${changes.additions} −${changes.deletions}`;
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

/**
 * What picking a model and effort in a thread's sheet asks the computer to change. A new model starts on its own default
 * effort; the default effort (null) clears the thread's own, so the model goes back to following its default.
 */
export function settingsChange(chat: Pick<PhoneChatDetail, "model" | "reasoningEffort">, next: { model: string; effort: string | null }): { model?: string; reasoningEffort?: string; defaultEffort?: true } | null {
  if (next.model !== chat.model) return { model: next.model, ...(next.effort ? { reasoningEffort: next.effort } : {}) };
  if (next.effort) return next.effort === chat.reasoningEffort ? null : { reasoningEffort: next.effort };
  return chat.reasoningEffort ? { defaultEffort: true } : null;
}
