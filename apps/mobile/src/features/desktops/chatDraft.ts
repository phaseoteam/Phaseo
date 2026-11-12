import { useCallback, useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";

/**
 * Each computer thread's unsent message, kept while the app runs, so another screen (Review) can add to the composer's
 * draft and the person finds it there on the way back.
 */
const drafts = createStore<Readonly<Record<string, string>>>({});
const keyOf = (desktopId: string, chatId: string) => `${desktopId}\u0000${chatId}`;

export const chatDraft = (desktopId: string, chatId: string) => drafts.get()[keyOf(desktopId, chatId)] ?? "";
export function setChatDraft(desktopId: string, chatId: string, next: string | ((current: string) => string)) {
  const key = keyOf(desktopId, chatId);
  drafts.set((all) => {
    const value = typeof next === "function" ? next(all[key] ?? "") : next;
    if ((all[key] ?? "") === value) return all;
    const { [key]: _dropped, ...rest } = all;
    return value ? { ...rest, [key]: value } : rest;
  });
}

export function useChatDraft(desktopId: string, chatId: string) {
  const key = keyOf(desktopId, chatId);
  const text = useSyncExternalStore(drafts.subscribe, () => drafts.get()[key] ?? "", () => "");
  const setText = useCallback((next: string | ((current: string) => string)) => setChatDraft(desktopId, chatId, next), [desktopId, chatId]);
  return [text, setText] as const;
}
