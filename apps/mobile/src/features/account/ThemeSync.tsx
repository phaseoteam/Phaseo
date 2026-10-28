import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { getAccountPreferences, saveAccountTheme } from "@/lib/api/preferences";
import { appearanceStore } from "@/lib/theme/store";
import { decideSync } from "@/lib/theme/sync";
import { useAuth } from "@/providers/AuthProvider";

/** How long after the last theme change the app waits before saving it, so tapping through presets saves once. */
const SAVE_DELAY_MS = 800;

let running = false;
let again = false;

/**
 * One round with the account: read its display preferences, then take its theme or save this
 * device's newer one (decideSync). Runs one at a time; a request made meanwhile runs once after.
 */
async function syncTheme() {
  const userId = appearanceStore.account();
  if (!userId) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  const startedAt = appearanceStore.localVersion();
  try {
    const account = await getAccountPreferences();
    if (!account.signedIn || appearanceStore.account() !== userId) return;
    // A change made while the account was being read is newer; the next round saves it.
    if (appearanceStore.localVersion() !== startedAt) {
      again = true;
      return;
    }
    const decision = decideSync(appearanceStore.get(), userId, account.theme);
    if (decision.kind === "adopt") appearanceStore.setAccountTheme(userId, decision.theme, true);
    else if (decision.kind === "settled") appearanceStore.setAccountTheme(userId, account.theme, false);
    else {
      const saved = await saveAccountTheme(account.preferences, appearanceStore.get().theme);
      // Signed out or switched accounts while saving: that save says nothing about who's signed in now.
      if (appearanceStore.account() === userId) appearanceStore.setAccountTheme(userId, saved, false);
    }
  } catch {
    // Offline or the account API is down: the theme stays on the device and is saved on a later round.
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncTheme();
    }
  }
}

/**
 * Keeps the theme in step with the account's display preferences (the ones the website's Appearance
 * settings save): on sign-in, when the app comes back to the foreground, and shortly after a change
 * here. Signed out, or offline, the theme stays on the device and is saved on the next successful round.
 */
export function ThemeSync() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const pendingAt = useSyncExternalStore(appearanceStore.subscribe, () => appearanceStore.get().pending?.changedAt ?? null);

  useEffect(() => {
    appearanceStore.setAccount(userId);
    if (!userId) return;
    void syncTheme();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void syncTheme();
    });
    return () => subscription.remove();
  }, [userId]);

  useEffect(() => {
    if (!userId || pendingAt == null) return;
    const timer = setTimeout(() => void syncTheme(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [userId, pendingAt]);

  return null;
}
