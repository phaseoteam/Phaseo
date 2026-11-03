import type { PhoneChat, PhoneChatAction } from "./protocol";

/** Organising threads, changing their settings and editing their queue came in protocol 3. */
export const organises = (protocol: number) => protocol >= 3;

export type ChatChange = { action: PhoneChatAction; title?: string; until?: string };

function reverseStep(change: ChatChange, before: Pick<PhoneChat, "title" | "snoozedUntil">, snoozeBack: ChatChange | null): ChatChange | null {
  switch (change.action) {
    case "settle": return { action: "unsettle" };
    case "unsettle": return { action: "settle" };
    case "archive": return { action: "unarchive" };
    case "unarchive": return { action: "archive" };
    case "pin": return { action: "unpin" };
    case "unpin": return { action: "pin" };
    case "rename": return change.title === before.title ? null : { action: "rename", title: before.title };
    case "snooze": return before.snoozedUntil ? { action: "snooze", until: before.snoozedUntil } : { action: "wake" };
    // A snooze that has passed can't be put back; mark unread has no reverse on the computer.
    case "wake": return snoozeBack;
    case "mark-unread": return null;
  }
}

/**
 * What undoes a change, from the thread as it was, in order: the action's reverse (a rename back to the old title, a
 * snooze back to its old time or a wake), then what the computer changed alongside it. Pinning there unsettles and wakes
 * a thread, and settling unpins it, so undoing either puts those back. Null when there's nothing to undo to.
 */
export function reverseOf(change: ChatChange, before: Pick<PhoneChat, "title" | "snoozedUntil" | "pinned" | "settled">, now = Date.now()): ChatChange[] | null {
  const snoozeBack: ChatChange | null = before.snoozedUntil && Date.parse(before.snoozedUntil) > now ? { action: "snooze", until: before.snoozedUntil } : null;
  const first = reverseStep(change, before, snoozeBack);
  if (!first) return null;
  const steps = [first];
  if (change.action === "settle" && before.pinned) steps.push({ action: "pin" });
  if (change.action === "pin" && before.settled) steps.push({ action: "settle" });
  // The pin woke the thread, or a pin in the undo will, so its snooze goes back last.
  if (snoozeBack && (change.action === "pin" || steps.some((step) => step.action === "pin"))) steps.push(snoozeBack);
  return steps;
}

/** A swipe's buttons: "snooze" opens the snooze choices. */
export type SwipeAction = { key: string; label: string; change?: ChatChange; snooze?: true; tone: "neutral" | "primary" | "destructive" };

/**
 * Swiping a row left shows two buttons, the main one at the edge, as the window's sidebar offers them: an active thread
 * settles or snoozes, a snoozed one wakes or archives, and a settled one archives or comes back. Settling and snoozing
 * are Code's (and Plan's); a Chat pins or archives, as the window's Chat sidebar does.
 */
export function swipeActions(chat: Pick<PhoneChat, "mode" | "pinned" | "settled" | "snoozedUntil">): [SwipeAction, SwipeAction] {
  const archive: SwipeAction = { key: "archive", label: "Archive", change: { action: "archive" }, tone: "destructive" };
  if (chat.mode === "chat") return [chat.pinned ? { key: "unpin", label: "Unpin", change: { action: "unpin" }, tone: "neutral" } : { key: "pin", label: "Pin", change: { action: "pin" }, tone: "neutral" }, archive];
  if (chat.snoozedUntil) return [archive, { key: "wake", label: "Wake", change: { action: "wake" }, tone: "primary" }];
  if (chat.settled) return [{ key: "unsettle", label: "Unsettle", change: { action: "unsettle" }, tone: "neutral" }, archive];
  return [{ key: "snooze", label: "Snooze", snooze: true, tone: "neutral" }, { key: "settle", label: "Settle", change: { action: "settle" }, tone: "primary" }];
}

/** The long-press menu, in the window's order. Rename and Snooze… open their own choices. */
export type MenuEntry = { key: string; label: string; change?: ChatChange; rename?: true; snooze?: true; destructive?: true };
export function menuEntries(chat: Pick<PhoneChat, "mode" | "pinned" | "settled" | "snoozedUntil" | "unread">): MenuEntry[] {
  const lifecycle = chat.mode !== "chat";
  return [
    chat.pinned ? { key: "unpin", label: "Unpin", change: { action: "unpin" } } : { key: "pin", label: "Pin", change: { action: "pin" } },
    { key: "rename", label: "Rename", rename: true },
    ...(chat.unread ? [] : [{ key: "mark-unread", label: "Mark unread", change: { action: "mark-unread" } } satisfies MenuEntry]),
    // A Chat that was settled anyway (from an older phone) can still come back.
    ...(lifecycle || chat.snoozedUntil ? [chat.snoozedUntil ? { key: "wake", label: "Wake", change: { action: "wake" } } satisfies MenuEntry : { key: "snooze", label: "Snooze…", snooze: true } satisfies MenuEntry] : []),
    ...(lifecycle || chat.settled ? [chat.settled ? { key: "unsettle", label: "Unsettle", change: { action: "unsettle" } } satisfies MenuEntry : { key: "settle", label: "Settle", change: { action: "settle" } } satisfies MenuEntry] : []),
    { key: "archive", label: "Archive", change: { action: "archive" }, destructive: true },
  ];
}

const time = (value: Date) => value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const day = (value: Date) => value.toLocaleDateString(undefined, { weekday: "short" });

/** Snooze choices, the window's: an hour, three hours, this evening (if over an hour away), tomorrow 9:00, next Monday 9:00. */
export function snoozeChoices(now = new Date()): { label: string; detail: string; until: string }[] {
  const at = (days: number, hour: number) => { const value = new Date(now); value.setDate(value.getDate() + days); value.setHours(hour, 0, 0, 0); return value; };
  const choices: { label: string; until: Date }[] = [{ label: "In 1 hour", until: new Date(now.getTime() + 3_600_000) }, { label: "In 3 hours", until: new Date(now.getTime() + 3 * 3_600_000) }];
  const evening = at(0, 18);
  if (evening.getTime() - now.getTime() > 3_600_000) choices.push({ label: "This evening", until: evening });
  const tomorrow = at(1, 9);
  choices.push({ label: "Tomorrow", until: tomorrow });
  const monday = at((8 - now.getDay()) % 7 || 7, 9);
  if (monday.getTime() !== tomorrow.getTime()) choices.push({ label: "Next week", until: monday });
  return choices.map((choice) => ({ label: choice.label, detail: `${day(choice.until)} ${time(choice.until)}`, until: choice.until.toISOString() }));
}

/** When a snoozed thread comes back: the time today, else the day and time. */
export function snoozedLabel(until: string, now = new Date()) {
  const date = new Date(until);
  return date.toDateString() === now.toDateString() ? `Until ${time(date)}` : `Until ${day(date)} ${time(date)}`;
}

/** What the undo toast says was done. */
export function doneMessage(change: ChatChange, chat: Pick<PhoneChat, "title">) {
  const name = `"${chat.title}"`;
  switch (change.action) {
    case "settle": return `Settled ${name}`;
    case "unsettle": return `${name} is back in the list`;
    case "archive": return `Archived ${name}`;
    case "unarchive": return `Restored ${name}`;
    case "pin": return `Pinned ${name}`;
    case "unpin": return `Unpinned ${name}`;
    case "rename": return `Renamed to ${name}`;
    case "snooze": { const until = new Date(change.until!); return `Snoozed ${name} until ${day(until)} ${time(until)}`; }
    case "wake": return `Woke ${name}`;
    case "mark-unread": return `Marked ${name} unread`;
  }
}
