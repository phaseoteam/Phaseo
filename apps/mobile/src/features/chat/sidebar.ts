import type { Href } from "expo-router";
import { newDesktopChatHref } from "@/features/desktops/routes";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

/** Which chats the sidebar lists: Phaseo's own, or those on a paired computer. */
export type SidebarMode = "chat" | "code";
export type SidebarState = { mode: SidebarMode; desktopId: string | null };

const KEY = "phaseo.chat.sidebar";
const DEFAULT: SidebarState = { mode: "chat", desktopId: null };

export function readSidebarState(text: string | null): SidebarState {
  try {
    const value = JSON.parse(text ?? "null") as Partial<SidebarState> | null;
    return {
      mode: value?.mode === "code" ? "code" : "chat",
      desktopId: typeof value?.desktopId === "string" ? value.desktopId : null,
    };
  } catch {
    return DEFAULT;
  }
}

/** The switch and the chosen computer, remembered on this device. */
export const sidebarStore = createStore<SidebarState>(DEFAULT);

let changed = false;
void kv.getItem(KEY).then((text) => {
  // A choice made before storage answered wins over the stored one.
  if (!changed && text) sidebarStore.set(readSidebarState(text));
});

sidebarStore.subscribe(() => {
  changed = true;
  void kv.setItem(KEY, JSON.stringify(sidebarStore.get()));
});

export const chooseSidebarMode = (mode: SidebarMode) => sidebarStore.set((state) => (state.mode === mode ? state : { ...state, mode }));
/** Shows a computer's chats: the Code side, with that computer picked. */
export const chooseDesktop = (desktopId: string) => sidebarStore.set((state) => (state.mode === "code" && state.desktopId === desktopId ? state : { mode: "code", desktopId }));

/** The picked computer while it's still paired, else the first one paired; null with none. */
export function chosenDesktop<T extends { desktopId: string }>(desktops: readonly T[], desktopId: string | null): T | null {
  return desktops.find((desktop) => desktop.desktopId === desktopId) ?? desktops[0] ?? null;
}

/** Where New chat goes: a Phaseo chat, a chat on the picked computer, or pairing when no computer is paired. */
export function newChatHref(mode: SidebarMode, desktopId: string | null): Href {
  if (mode === "chat") return "/chat/new";
  return desktopId ? newDesktopChatHref(desktopId) : "/pair";
}
