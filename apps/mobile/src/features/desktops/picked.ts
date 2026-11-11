import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

/**
 * What the app is working in, switched at the top of the sidebar: Phaseo (the chats on this phone) or a paired
 * computer (its projects and threads). Remembered on this device.
 */
export type Workspace = { kind: "phaseo" } | { kind: "desktop"; desktopId: string };

const KEY = "phaseo.workspace";
const PHASEO: Workspace = { kind: "phaseo" };

export function readWorkspace(text: string | null): Workspace {
  try {
    const value = JSON.parse(text ?? "null") as { kind?: unknown; desktopId?: unknown } | null;
    return value?.kind === "desktop" && typeof value.desktopId === "string" ? { kind: "desktop", desktopId: value.desktopId } : PHASEO;
  } catch {
    return PHASEO;
  }
}

export const workspaceStore = createStore<Workspace>(PHASEO);

let changed = false;
void kv.getItem(KEY).then((text) => {
  // A choice made before storage answered wins over the stored one.
  if (!changed && text) workspaceStore.set(readWorkspace(text));
});

workspaceStore.subscribe(() => {
  changed = true;
  void kv.setItem(KEY, JSON.stringify(workspaceStore.get()));
});

export const choosePhaseo = () => workspaceStore.set(PHASEO);
export const chooseDesktop = (desktopId: string) => {
  const current = workspaceStore.get();
  if (current.kind !== "desktop" || current.desktopId !== desktopId) workspaceStore.set({ kind: "desktop", desktopId });
};

/** The computer the app is working in while it's still paired; null for Phaseo, or a computer since removed. */
export function workspaceDesktop<T extends { desktopId: string }>(desktops: readonly T[] | null, workspace: Workspace): T | null {
  if (workspace.kind !== "desktop") return null;
  return desktops?.find((desktop) => desktop.desktopId === workspace.desktopId) ?? null;
}
