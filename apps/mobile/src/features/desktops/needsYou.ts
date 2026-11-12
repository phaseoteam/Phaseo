import { createStore } from "@/lib/store";
import type { PhoneChat } from "./protocol";

/** Per paired computer, the ids of its chats that wait on the person (an approval, a question, a failure). */
export type NeedsYou = Readonly<Record<string, readonly string[]>>;
type Flag = Pick<PhoneChat, "id" | "needsYou">;

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
const put = (state: NeedsYou, desktopId: string, ids: string[]): NeedsYou => (same(state[desktopId] ?? [], ids) ? state : { ...state, [desktopId]: ids });

/**
 * A page of a computer's chats applied. `replace` starts from this page alone (a fresh connection); otherwise chats
 * outside the page keep what was known of them, since one page doesn't cover every chat.
 */
export function withChats(state: NeedsYou, desktopId: string, chats: Flag[], replace: boolean): NeedsYou {
  const inPage = new Set(chats.map((chat) => chat.id));
  const kept = replace ? [] : (state[desktopId] ?? []).filter((id) => !inPage.has(id));
  return put(state, desktopId, [...kept, ...chats.filter((chat) => chat.needsYou).map((chat) => chat.id)]);
}

/** One chat_updated frame applied. */
export function withChat(state: NeedsYou, desktopId: string, chat: Flag): NeedsYou {
  const ids = (state[desktopId] ?? []).filter((id) => id !== chat.id);
  return put(state, desktopId, chat.needsYou ? [...ids, chat.id] : ids);
}

/** Drops computers no longer paired. */
export function onlyDesktops(state: NeedsYou, desktopIds: string[]): NeedsYou {
  const gone = Object.keys(state).filter((id) => !desktopIds.includes(id));
  if (!gone.length) return state;
  return Object.fromEntries(Object.entries(state).filter(([id]) => desktopIds.includes(id)));
}

/** Chats needing you on one computer, or on all of them. */
export function needsYouCount(state: NeedsYou, desktopId?: string): number {
  if (desktopId !== undefined) return state[desktopId]?.length ?? 0;
  return Object.values(state).reduce((total, ids) => total + ids.length, 0);
}

/** Kept by DesktopConnections, which hears every paired computer while the app runs. */
export const needsYouStore = createStore<NeedsYou>({});
export const useNeedsYouCount = (desktopId?: string) => needsYouStore.use((state) => needsYouCount(state, desktopId));
