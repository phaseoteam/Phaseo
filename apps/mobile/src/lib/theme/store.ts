import { Uniwind } from "uniwind";
import { kv } from "@/lib/storage";
import { toHex } from "./colour";
import { sameTheme, themeVariables, type ThemeFields, type ThemeMode } from "./model";
import {
  APPEARANCE_STORAGE_KEY,
  INITIAL_APPEARANCE,
  LEGACY_MODE_STORAGE_KEY,
  parseStoredAppearance,
  withAccountTheme,
  withLocalChange,
  type StoredAppearance,
} from "./sync";

/**
 * The device's appearance: mode and theme, applied to Uniwind's light and dark CSS variables.
 *
 * It's read synchronously when this module loads (the root layout imports it right after global.css),
 * so the first frame already has the right colours and the splash screen never gives way to the
 * default palette. Uniwind keeps variable overrides in memory only, which is why they're re-applied
 * on every launch. In development, editing global.css re-registers the stylesheet and drops them
 * until the theme next changes.
 */

function readStored(): StoredAppearance {
  try {
    return parseStoredAppearance(kv.getItemSync(APPEARANCE_STORAGE_KEY), kv.getItemSync(LEGACY_MODE_STORAGE_KEY));
  } catch {
    return INITIAL_APPEARANCE;
  }
}

function applyTheme(theme: ThemeFields) {
  Uniwind.updateCSSVariables("light", themeVariables(theme, "light"));
  Uniwind.updateCSSVariables("dark", themeVariables(theme, "dark"));
}

let state = readStored();
let accountUserId: string | null = null;
/** Bumps on every change made on the device, so an account read that started earlier doesn't undo it. */
let localVersion = 0;
const listeners = new Set<() => void>();

Uniwind.setTheme(state.mode);
applyTheme(state.theme);

function commit(next: StoredAppearance) {
  if (next === state || JSON.stringify(next) === JSON.stringify(state)) return;
  const themeChanged = !sameTheme(next.theme, state.theme);
  state = next;
  if (themeChanged) applyTheme(next.theme);
  void kv.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  listeners.forEach((listener) => listener());
}

export const appearanceStore = {
  get: () => state,
  /**
   * Applies the stored theme again. The provider calls it in its first render, which always comes
   * after global.css has registered, in case a module imported this one before global.css loaded.
   */
  reapply() {
    // Normally the variables already hold the theme (Uniwind returns overrides as lower-case hex),
    // so nothing is applied and nothing re-renders.
    const scheme = Uniwind.currentTheme === "dark" ? "dark" : "light";
    const expected = themeVariables(state.theme, scheme);
    const names = ["--color-background", "--color-primary"] as const;
    const current = Uniwind.getCSSVariable([...names]);
    if (names.every((name, index) => String(current[index] ?? "").toLowerCase() === toHex(expected[name] ?? ""))) return;
    applyTheme(state.theme);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  localVersion: () => localVersion,
  account: () => accountUserId,
  /** Who's signed in, so a change is saved to that account (null keeps it on the device). */
  setAccount(userId: string | null) {
    accountUserId = userId;
  },
  setMode(mode: ThemeMode) {
    if (mode === state.mode) return;
    Uniwind.setTheme(mode);
    commit({ ...state, mode });
  },
  /** A change made on the device: applied now, and saved to the account when one is signed in. */
  setTheme(theme: ThemeFields) {
    localVersion += 1;
    commit(withLocalChange(state, theme, accountUserId, Date.now()));
  },
  /** The account's theme, read or just saved; `adopt` replaces the device's theme with it. */
  setAccountTheme(userId: string, theme: ThemeFields, adopt: boolean) {
    commit(withAccountTheme(state, userId, theme, adopt));
  },
};
