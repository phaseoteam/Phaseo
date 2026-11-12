import { useEffect, useSyncExternalStore } from "react";
import { builtInThemes, parseTheme, themeColours, type Theme } from "./themes";

/** The chosen colour theme and the user's own themes, kept in local storage and shared by every component. */
type State = { activeId: string; custom: Theme[] };
const key = "phaseo.desktop.colourThemes";
const listeners = new Set<() => void>();

function read(): State {
	try {
		const stored = JSON.parse(window.localStorage.getItem(key) ?? "null") as { activeId?: unknown; custom?: unknown } | null;
		const custom = Array.isArray(stored?.custom) ? stored.custom.flatMap(value => { try { const theme = parseTheme(value); return [{ ...theme, id: typeof (value as Theme).id === "string" ? (value as Theme).id : theme.id }]; } catch { return []; } }) : [];
		return { activeId: typeof stored?.activeId === "string" ? stored.activeId : "phaseo", custom };
	} catch { return { activeId: "phaseo", custom: [] }; }
}
let state = read();
function write(next: State) {
	state = next;
	try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* The theme still applies for this session. */ }
	for (const listener of listeners) listener();
}

export function useThemes() {
	const current = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state);
	const all = [...builtInThemes, ...current.custom];
	return {
		themes: all, custom: current.custom,
		active: all.find(theme => theme.id === current.activeId) ?? builtInThemes[0],
		choose: (id: string) => write({ ...state, activeId: id }),
		/** Adds or replaces a custom theme (ids are made unique against the built-ins) and makes it active. */
		save: (theme: Theme) => {
			const taken = new Set([...builtInThemes.map(value => value.id), ...state.custom.filter(value => value.id !== theme.id).map(value => value.id)]);
			let id = theme.id; for (let index = 2; taken.has(id); index++) id = `${theme.id}-${index}`;
			const saved = { ...theme, id, builtIn: undefined };
			write({ activeId: id, custom: [...state.custom.filter(value => value.id !== theme.id), saved] });
			return saved;
		},
		remove: (id: string) => write({ activeId: state.activeId === id ? "phaseo" : state.activeId, custom: state.custom.filter(value => value.id !== id) }),
	};
}

/** CSS for a theme: one rule per half it defines; a missing half keeps the stylesheet's own colours. */
export function themeCss(theme: Theme) {
	const block = (selector: string, half: Theme["light"], mode: "light" | "dark") => half ? `${selector} {\n${Object.entries(themeColours(half, mode)).map(([token, value]) => `\t--${token}: ${value};`).join("\n")}\n}` : "";
	return [block(":root:not(.dark)", theme.light, "light"), block(":root.dark", theme.dark, "dark")].filter(Boolean).join("\n");
}

/** Keeps the active theme's colours applied to the document. */
export function useAppTheme() {
	const { active } = useThemes();
	useEffect(() => {
		let style = document.getElementById("phaseo-colour-theme") as HTMLStyleElement | null;
		if (!style) { style = document.createElement("style"); style.id = "phaseo-colour-theme"; document.head.append(style); }
		style.textContent = themeCss(active);
	}, [active]);
}
