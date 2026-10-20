import { DEFAULT_THEME, normalizeMode, normalizeTheme, sameTheme, type ThemeFields, type ThemeMode } from "./model";

/** Where the device keeps its appearance (kv storage). The old key held only the mode. */
export const APPEARANCE_STORAGE_KEY = "phaseo.appearance";
export const LEGACY_MODE_STORAGE_KEY = "phaseo.theme";

/**
 * What the device keeps. The mode stays on the device (the website keeps it per browser); the theme
 * fields are also saved on the account when signed in.
 */
export type StoredAppearance = {
  mode: ThemeMode;
  theme: ThemeFields;
  /**
   * A theme change made here that hasn't reached the account yet: the account it was made under, or
   * null when it was made signed out (it then goes to whichever account signs in next).
   */
  pending: { userId: string | null; changedAt: number } | null;
  /** The account theme as last read or saved, and whose it was. */
  synced: { userId: string; theme: ThemeFields } | null;
};

export const INITIAL_APPEARANCE: StoredAppearance = { mode: "system", theme: DEFAULT_THEME, pending: null, synced: null };

/** The stored record, tolerating anything malformed; falls back to the old mode-only key. */
export function parseStoredAppearance(raw: string | null, legacyMode: string | null): StoredAppearance {
  let value: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch {
    value = null;
  }
  if (!value) return { ...INITIAL_APPEARANCE, mode: normalizeMode(legacyMode) };
  const pending = value.pending && typeof value.pending === "object" ? value.pending as Record<string, unknown> : null;
  const synced = value.synced && typeof value.synced === "object" ? value.synced as Record<string, unknown> : null;
  return {
    mode: normalizeMode(value.mode),
    theme: normalizeTheme(value.theme),
    pending: pending
      ? { userId: typeof pending.userId === "string" ? pending.userId : null, changedAt: typeof pending.changedAt === "number" ? pending.changedAt : 0 }
      : null,
    synced: synced && typeof synced.userId === "string" ? { userId: synced.userId, theme: normalizeTheme(synced.theme) } : null,
  };
}

export type SyncDecision =
  /** The device has a newer change for this account: save it. */
  | { kind: "push" }
  /** The account changed since (or the device never synced): use the account's theme. */
  | { kind: "adopt"; theme: ThemeFields }
  /** Both already agree. */
  | { kind: "settled" };

/**
 * Last change wins. A change made on this device that hasn't been saved yet is the latest this device
 * knows of, so it's saved; otherwise the account holds the latest, so the device takes it. A change
 * made under another account is dropped rather than copied across accounts.
 *
 * The preferences route has no timestamp, so if the theme was also changed on the website while this
 * device was offline with a pending change, the device's change wins.
 */
export function decideSync(local: StoredAppearance, userId: string, server: ThemeFields): SyncDecision {
  const pendingHere = local.pending != null && (local.pending.userId === null || local.pending.userId === userId);
  if (sameTheme(local.theme, server)) return { kind: "settled" };
  return pendingHere ? { kind: "push" } : { kind: "adopt", theme: server };
}

/** After a change on the device: mark it for the account that's signed in (or none). */
export function withLocalChange(state: StoredAppearance, theme: ThemeFields, userId: string | null, now: number): StoredAppearance {
  if (sameTheme(state.theme, theme) && state.pending == null) return state;
  return { ...state, theme, pending: { userId, changedAt: now } };
}

/**
 * After the account's theme is known (read, or just saved). The pending flag clears only when the
 * device still shows that theme, so a change made while the save was in flight is kept for the next save.
 */
export function withAccountTheme(state: StoredAppearance, userId: string, theme: ThemeFields, adopt: boolean): StoredAppearance {
  const next = adopt ? theme : state.theme;
  return {
    ...state,
    theme: next,
    pending: sameTheme(next, theme) ? null : state.pending,
    synced: { userId, theme },
  };
}

/**
 * The body for PUT /api/account/settings/preferences: the route takes every display preference at once,
 * so the theme fields replace those in the account's current preferences and the rest go back unchanged.
 */
export function mergeThemeIntoPreferences(preferences: Record<string, unknown>, theme: ThemeFields): Record<string, unknown> {
  return { ...preferences, ...theme };
}
