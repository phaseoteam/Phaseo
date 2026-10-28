import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Uniwind, useUniwind } from "uniwind";
import { kv } from "@/lib/storage";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "phaseo.theme";

type AppearanceValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  ready: boolean;
  setPreference(preference: ThemePreference): void;
};

const AppearanceContext = createContext<AppearanceValue>({ preference: "system", resolved: "light", ready: false, setPreference: () => undefined });

export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);
  const { theme } = useUniwind();

  useEffect(() => {
    void kv.getItem(STORAGE_KEY).then((stored) => {
      const next: ThemePreference = stored === "light" || stored === "dark" ? stored : "system";
      setPreferenceState(next);
      Uniwind.setTheme(next);
      setReady(true);
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    Uniwind.setTheme(next);
    void kv.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<AppearanceValue>(() => ({
    preference,
    resolved: theme === "dark" ? "dark" : "light",
    ready,
    setPreference,
  }), [preference, theme, ready, setPreference]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
