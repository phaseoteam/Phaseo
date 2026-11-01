import { secureStorage } from "@/lib/storage";
import { createStore } from "@/lib/store";
import type { SavedDesktop } from "./reach";

// Tokens and this phone's private key: secure storage only (the Keystore on Android).
const KEY = "phaseo.desktops";

/** The paired desktops; null until read from secure storage. */
export const desktopsStore = createStore<SavedDesktop[] | null>(null);

let loading: Promise<SavedDesktop[]> | null = null;
export function loadDesktops(): Promise<SavedDesktop[]> {
  const loaded = desktopsStore.get();
  if (loaded) return Promise.resolve(loaded);
  loading ??= secureStorage.getItem(KEY)
    .then((text) => {
      let value: unknown = [];
      try { value = text ? JSON.parse(text) : []; } catch { value = []; }
      const desktops = Array.isArray(value) ? (value as SavedDesktop[]) : [];
      desktopsStore.set(desktops);
      return desktops;
    })
    .finally(() => { loading = null; });
  return loading;
}

async function write(desktops: SavedDesktop[]) {
  await secureStorage.setItem(KEY, JSON.stringify(desktops));
  desktopsStore.set(desktops);
}

/** Adds a paired desktop, replacing an earlier pairing with the same one. */
export async function saveDesktop(desktop: SavedDesktop) {
  const desktops = await loadDesktops();
  await write([...desktops.filter((entry) => entry.desktopId !== desktop.desktopId), desktop]);
}

/** Forgets a desktop on this phone. The desktop keeps listing the phone until it's removed there too. */
export async function forgetDesktop(desktopId: string) {
  const desktops = await loadDesktops();
  await write(desktops.filter((entry) => entry.desktopId !== desktopId));
}

export const useDesktops = () => desktopsStore.use();
/** A paired desktop; undefined while secure storage is still being read (a notification can open a chat at launch). */
export const useDesktop = (desktopId: string) => desktopsStore.use((desktops) => (desktops == null ? undefined : desktops.find((entry) => entry.desktopId === desktopId) ?? null));
