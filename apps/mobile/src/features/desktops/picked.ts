import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

// The key from when the sidebar had a Chat | Code switch, so the computer picked then stays picked.
const KEY = "phaseo.chat.sidebar";

export function readPickedDesktop(text: string | null): string | null {
  try {
    const value = JSON.parse(text ?? "null") as { desktopId?: unknown } | null;
    return typeof value?.desktopId === "string" ? value.desktopId : null;
  } catch {
    return null;
  }
}

/** The computer whose threads Code shows, remembered on this device. */
export const pickedDesktopStore = createStore<string | null>(null);

let changed = false;
void kv.getItem(KEY).then((text) => {
  // A choice made before storage answered wins over the stored one.
  if (!changed && text) pickedDesktopStore.set(readPickedDesktop(text));
});

pickedDesktopStore.subscribe(() => {
  changed = true;
  void kv.setItem(KEY, JSON.stringify({ desktopId: pickedDesktopStore.get() }));
});

export const chooseDesktop = (desktopId: string) => pickedDesktopStore.set(desktopId);

/** The picked computer while it's still paired, else the first one paired; null with none. */
export function chosenDesktop<T extends { desktopId: string }>(desktops: readonly T[], desktopId: string | null): T | null {
  return desktops.find((desktop) => desktop.desktopId === desktopId) ?? desktops[0] ?? null;
}
