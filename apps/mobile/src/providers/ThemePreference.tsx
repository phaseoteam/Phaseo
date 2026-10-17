import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
type ThemePreferenceValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; ready: boolean };
const ThemePreferenceContext = createContext<ThemePreferenceValue>({ mode: "system", setMode: () => undefined, ready: false });
const STORAGE_KEY = "phaseo.theme-preference";

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);
  const value = useMemo<ThemePreferenceValue>(() => ({ mode, ready, setMode: next => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  } }), [mode, ready]);
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export const useThemePreference = () => useContext(ThemePreferenceContext);

export function useResolvedDark(): boolean {
  const { mode } = useThemePreference();
  const systemDark = useColorScheme() === "dark";
  return mode === "system" ? systemDark : mode === "dark";
}
