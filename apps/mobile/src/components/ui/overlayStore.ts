import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { createStore } from "@/lib/store";
import type { Anchor } from "./overlay";

/** An action row in an ActionMenu (kept here, free of React Native imports, so the store can be tested). */
export type MenuAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** A logo or other element in place of the icon. */
  leading?: ReactNode;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
};

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for delete, revoke and sign out. */
  destructive?: boolean;
};

/** `open` goes false when settled; the request stays so its dialog can fade out with its content. */
export type ConfirmRequest = Required<Omit<ConfirmOptions, "body">> & { id: number; body?: string; open: boolean; resolve(ok: boolean): void };

export type ToastTone = "neutral" | "success" | "error";
export type Toast = { id: number; message: string; title?: string; tone: ToastTone };

export type MenuRequest = { id: number; title?: string; actions: MenuAction[]; anchor: Anchor | null; open: boolean };

type OverlayState = { confirm: ConfirmRequest | null; toasts: Toast[]; menu: MenuRequest | null };

/** App-wide dialogs drawn by OverlayHost: one confirmation, one action menu and a short stack of toasts. */
export const overlayStore = createStore<OverlayState>({ confirm: null, toasts: [], menu: null });

export const TOAST_MS = 4000;
export const MAX_TOASTS = 3;
let nextId = 1;

/**
 * Asks before doing something; resolves true when confirmed and false when cancelled or dismissed.
 * A newer request replaces an open one, which then resolves false.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = overlayStore.get().confirm;
    overlayStore.set((state) => ({
      ...state,
      confirm: { id: nextId++, title: options.title, body: options.body, confirmLabel: options.confirmLabel ?? "Continue", cancelLabel: options.cancelLabel ?? "Cancel", destructive: options.destructive ?? false, open: true, resolve },
    }));
    if (previous?.open) previous.resolve(false);
  });
}

export function settleConfirm(ok: boolean) {
  const current = overlayStore.get().confirm;
  if (!current?.open) return;
  overlayStore.set((state) => ({ ...state, confirm: { ...current, open: false } }));
  current.resolve(ok);
}

/** A short notice that goes away by itself, instead of a native alert. Returns its ID. */
export function toast(message: string, options: { tone?: ToastTone; title?: string; durationMs?: number } = {}) {
  const id = nextId++;
  overlayStore.set((state) => ({ ...state, toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), { id, message, title: options.title, tone: options.tone ?? "neutral" }] }));
  setTimeout(() => dismissToast(id), options.durationMs ?? TOAST_MS);
  return id;
}

/** An error toast with the error's own message when it has one. */
export function toastError(title: string, error: unknown, fallback = "Try again.") {
  return toast(error instanceof Error && error.message ? error.message : fallback, { tone: "error", title });
}

export function dismissToast(id: number) {
  if (!overlayStore.get().toasts.some((entry) => entry.id === id)) return;
  overlayStore.set((state) => ({ ...state, toasts: state.toasts.filter((entry) => entry.id !== id) }));
}

/** Opens an action menu; pass an anchor (a trigger's rectangle or a touch point) for the tablet dropdown. */
export function showActions(request: { title?: string; actions: MenuAction[]; anchor?: Anchor | null }) {
  overlayStore.set((state) => ({ ...state, menu: { id: nextId++, title: request.title, actions: request.actions.filter(Boolean), anchor: request.anchor ?? null, open: true } }));
}

export function closeActions() {
  const menu = overlayStore.get().menu;
  if (!menu?.open) return;
  overlayStore.set((state) => ({ ...state, menu: { ...menu, open: false } }));
}
