import { createContext, useContext, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { useUniwind } from "uniwind";
import { DEFAULT_THEME, type ThemeFields, type ThemeMode } from "@/lib/theme/model";
import { appearanceStore } from "@/lib/theme/store";

export type ThemePreference = ThemeMode;

type AppearanceValue = {
  /** System, light or dark, kept on this device. */
  preference: ThemePreference;
  resolved: "light" | "dark";
  /** Palettes and accents, as the website saves them. */
  theme: ThemeFields;
  /** The stored appearance is read before the first render, so this is always true; kept for callers. */
  ready: boolean;
  setPreference(preference: ThemePreference): void;
  setTheme(theme: ThemeFields): void;
};

const AppearanceContext = createContext<AppearanceValue>({
  preference: "system",
  resolved: "light",
  theme: DEFAULT_THEME,
  ready: false,
  setPreference: () => undefined,
  setTheme: () => undefined,
});

export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }: PropsWithChildren) {
  // Once, before anything themed renders (see appearanceStore.reapply).
  useState(() => appearanceStore.reapply());
  const stored = useSyncExternalStore(appearanceStore.subscribe, appearanceStore.get);
  const { theme: uniwindTheme } = useUniwind();

  const value = useMemo<AppearanceValue>(() => ({
    preference: stored.mode,
    resolved: uniwindTheme === "dark" ? "dark" : "light",
    theme: stored.theme,
    ready: true,
    setPreference: appearanceStore.setMode,
    setTheme: appearanceStore.setTheme,
  }), [stored.mode, stored.theme, uniwindTheme]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
