import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ResolvedTheme = "light" | "dark";

export type ThemeContextValue = {
	/** The stored choice: "light", "dark" or "system". Undefined during server rendering. */
	theme: string | undefined;
	setTheme: (theme: string | ((current: string | undefined) => string)) => void;
	/** The theme actually shown: the system preference when the choice is "system". */
	resolvedTheme: string | undefined;
	systemTheme: ResolvedTheme | undefined;
	themes: string[];
};

/** localStorage key that holds the visitor's choice. Existing visitors already have it set. */
export const THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME = "system";
const THEMES: ResolvedTheme[] = ["light", "dark"];
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before the body paints, so the `light`/`dark` class and
 * `color-scheme` on <html> match the stored choice without a flash.
 */
export const THEME_INITIALIZATION_SCRIPT = `(()=>{try{const d=document.documentElement,c=d.classList;let t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||${JSON.stringify(DEFAULT_THEME)};if(t==="system")t=window.matchMedia(${JSON.stringify(MEDIA_QUERY)}).matches?"dark":"light";c.remove("light","dark");c.add(t);if(t==="light"||t==="dark")d.style.colorScheme=t}catch{}})();`;

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const fallbackContext: ThemeContextValue = {
	theme: undefined,
	setTheme: () => {},
	resolvedTheme: undefined,
	systemTheme: undefined,
	themes: [],
};

function readStoredTheme(): string | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

function getSystemTheme(query?: MediaQueryList | MediaQueryListEvent): ResolvedTheme {
	return (query ?? window.matchMedia(MEDIA_QUERY)).matches ? "dark" : "light";
}

/** Turns CSS transitions off for one frame so a theme switch does not animate every colour. */
function suspendTransitions(): () => void {
	const style = document.createElement("style");
	style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
	document.head.appendChild(style);
	return () => {
		// Force a style recalculation before the transitions come back.
		window.getComputedStyle(document.body);
		setTimeout(() => style.remove(), 1);
	};
}

function applyTheme(resolved: string) {
	const restoreTransitions = suspendTransitions();
	const root = document.documentElement;
	root.classList.remove(...THEMES);
	root.classList.add(resolved);
	root.style.colorScheme = THEMES.includes(resolved as ResolvedTheme) ? resolved : "light";
	restoreTransitions();
}

/** Light, dark or system theme as a class on <html>, stored in localStorage. */
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<string | undefined>(readStoredTheme);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme | undefined>(() => (typeof window === "undefined" ? undefined : getSystemTheme()));

	const setTheme = useCallback<ThemeContextValue["setTheme"]>((value) => {
		setThemeState((current) => {
			const next = typeof value === "function" ? value(current) : value;
			try {
				localStorage.setItem(THEME_STORAGE_KEY, next);
			} catch {
				// Storage can be unavailable (private mode); the choice still applies to this page.
			}
			return next;
		});
	}, []);

	// Follow the operating system preference while the choice is "system".
	useEffect(() => {
		const query = window.matchMedia(MEDIA_QUERY);
		const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
			setSystemTheme(getSystemTheme(event));
		};
		onChange(query);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	// Keep tabs in sync when the choice changes in another tab.
	useEffect(() => {
		const onStorage = (event: StorageEvent) => {
			if (event.key !== THEME_STORAGE_KEY) return;
			if (event.newValue) setThemeState(event.newValue);
			else setTheme(DEFAULT_THEME);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [setTheme]);

	const resolvedTheme = theme === "system" ? systemTheme : theme;
	useEffect(() => {
		if (resolvedTheme) applyTheme(resolvedTheme);
	}, [resolvedTheme]);

	const value = useMemo<ThemeContextValue>(() => ({
		theme,
		setTheme,
		resolvedTheme,
		systemTheme,
		themes: [...THEMES, "system"],
	}), [theme, setTheme, resolvedTheme, systemTheme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
	return useContext(ThemeContext) ?? fallbackContext;
}
