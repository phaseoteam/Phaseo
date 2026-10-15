/**
 * Colour themes. A theme sets a background ("canvas") and an accent for light and dark; every other
 * colour is derived from those two, and any token can be overridden. Themes travel as JSON files or
 * as a short share code, and T3 Code or VS Code theme files can be imported.
 */
export const themeTokens = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "border", "input", "ring", "sidebar", "sidebar-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "destructive", "success", "warning"] as const;
export type ThemeToken = (typeof themeTokens)[number];
export type ThemeMode = "light" | "dark";
export type ThemeHalf = { canvas: string; accent: string; tokens?: Partial<Record<ThemeToken, string>> };
export type Theme = { version: 1; id: string; name: string; light?: ThemeHalf; dark?: ThemeHalf; builtIn?: boolean };

const half = (canvas: string, accent: string, tokens?: ThemeHalf["tokens"]): ThemeHalf => ({ canvas, accent, ...tokens ? { tokens } : {} });
/**
 * The built-ins: Phaseo (the stylesheet's own palette, so it sets nothing), themes inspired by the apps people
 * use alongside Phaseo, and a neutral Graphite. Colours are our approximations, not official palettes.
 */
export const builtInThemes: Theme[] = [
	{ version: 1, id: "phaseo", name: "Phaseo", builtIn: true },
	{ version: 1, id: "chatgpt", name: "ChatGPT", builtIn: true, light: half("#ffffff", "#0d0d0d", { sidebar: "#f9f9f9", border: "#e5e5e5" }), dark: half("#212121", "#ececec", { sidebar: "#181818", card: "#2a2a2a", popover: "#2f2f2f", border: "#383838" }) },
	{ version: 1, id: "codex", name: "Codex", builtIn: true, light: half("#ffffff", "#0169cc", { sidebar: "#f7f7f8" }), dark: half("#181818", "#339cff", { sidebar: "#121212", card: "#212121" }) },
	{ version: 1, id: "claude", name: "Claude", builtIn: true, light: half("#faf9f5", "#c96442", { sidebar: "#f5f4ed", foreground: "#141413" }), dark: half("#262624", "#d97757", { sidebar: "#1f1e1d", card: "#30302e", foreground: "#faf9f5" }) },
	{ version: 1, id: "gemini", name: "Gemini", builtIn: true, light: half("#ffffff", "#0b57d0", { sidebar: "#f0f4f9", foreground: "#1f1f1f" }), dark: half("#131314", "#a8c7fa", { sidebar: "#1e1f20", card: "#1e1f20", foreground: "#e3e3e3" }) },
	{ version: 1, id: "grok", name: "Grok", builtIn: true, light: half("#ffffff", "#000000", { sidebar: "#fafafa" }), dark: half("#000000", "#ffffff", { sidebar: "#0c0c0c", card: "#151515", border: "#262626" }) },
	{ version: 1, id: "mistral", name: "Mistral", builtIn: true, light: half("#fffaf2", "#fa500f", { sidebar: "#fff3e3" }), dark: half("#161616", "#ff8205", { sidebar: "#111111" }) },
	{ version: 1, id: "perplexity", name: "Perplexity", builtIn: true, light: half("#fcfcf9", "#20808d", { sidebar: "#f3f3ee" }), dark: half("#191a1a", "#20b8cd", { sidebar: "#202222" }) },
	{ version: 1, id: "graphite", name: "Graphite", builtIn: true, light: half("#f7f7f6", "#3f3f46"), dark: half("#111111", "#e4e4e7") },
];

const mix = (a: string, b: string, percent: number) => `color-mix(in oklab, ${a} ${percent}%, ${b})`;
/** Readable text on a colour: near-black or white, whichever contrasts more. */
export function contrastText(colour: string) {
	const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim())?.[1];
	if (!hex) return "#ffffff";
	const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
	// Dark text wins once its contrast ratio beats white's, at a relative luminance of about 0.18.
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#111111" : "#ffffff";
}

/** Every token for one half, derived from its canvas and accent, then its overrides. */
export function themeColours(theme: ThemeHalf, mode: ThemeMode): Record<ThemeToken, string> {
	const { canvas, accent } = theme, ink = mode === "dark" ? "#fafafa" : "#141414";
	const derived: Record<ThemeToken, string> = {
		background: canvas, foreground: ink,
		card: mix(canvas, ink, mode === "dark" ? 94 : 100), "card-foreground": ink,
		popover: mix(canvas, ink, mode === "dark" ? 92 : 100), "popover-foreground": ink,
		primary: accent, "primary-foreground": contrastText(accent),
		secondary: mix(canvas, ink, 94), "secondary-foreground": ink,
		muted: mix(canvas, ink, mode === "dark" ? 90 : 95), "muted-foreground": mix(ink, canvas, 58),
		accent: mix(accent, canvas, 14), "accent-foreground": ink,
		border: mix(canvas, ink, mode === "dark" ? 86 : 89), input: mix(canvas, ink, mode === "dark" ? 82 : 87), ring: accent,
		sidebar: mix(canvas, ink, mode === "dark" ? 97 : 97), "sidebar-foreground": ink, "sidebar-accent": mix(canvas, ink, mode === "dark" ? 88 : 93), "sidebar-accent-foreground": ink, "sidebar-border": mix(canvas, ink, mode === "dark" ? 88 : 91),
		destructive: mode === "dark" ? "#f87171" : "#dc2626", success: mode === "dark" ? "#4ade80" : "#16a34a", warning: mode === "dark" ? "#fbbf24" : "#d97706",
	};
	return { ...derived, ...theme.tokens };
}

const colour = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\([^;{}]{1,200}\))$/i;
const validColour = (value: unknown): value is string => typeof value === "string" && colour.test(value.trim());
function validHalf(value: unknown): ThemeHalf | undefined {
	if (!value || typeof value !== "object") return;
	const { canvas, accent, tokens } = value as Record<string, unknown>;
	if (!validColour(canvas) || !validColour(accent)) return;
	const kept = tokens && typeof tokens === "object" ? Object.fromEntries(Object.entries(tokens).filter(([key, entry]) => (themeTokens as readonly string[]).includes(key) && validColour(entry))) : {};
	return { canvas, accent, ...Object.keys(kept).length ? { tokens: kept } : {} };
}
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "theme";

/** Reads a Phaseo theme, a T3 Code theme or a VS Code colour theme. Throws with a readable reason. */
export function parseTheme(input: unknown): Theme {
	const value = typeof input === "string" ? JSON.parse(input) as unknown : input;
	if (!value || typeof value !== "object") throw new Error("This isn't a theme file.");
	const record = value as Record<string, unknown>;
	const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 60) : typeof record.label === "string" ? record.label.slice(0, 60) : "Imported theme";
	// Phaseo: { version, name, light?, dark? }
	if (record.light || record.dark) {
		const light = validHalf(record.light), dark = validHalf(record.dark);
		if (!light && !dark) throw new Error("This theme has no usable colours.");
		return { version: 1, id: slug(name), name, ...light ? { light } : {}, ...dark ? { dark } : {} };
	}
	// T3 Code: { appearance, colors: { canvas, accent, text, … }, variants? }
	const colors = record.colors as Record<string, unknown> | undefined;
	if (colors && typeof colors === "object" && validColour(colors.canvas) && validColour(colors.accent)) {
		const mode: ThemeMode = record.appearance === "light" ? "light" : "dark";
		const tokens = Object.fromEntries(([["foreground", colors.text], ["border", colors.border], ["sidebar", colors.sidebar]] as const).filter(([, entry]) => validColour(entry)));
		return { version: 1, id: slug(name), name, [mode]: { canvas: colors.canvas, accent: colors.accent, ...Object.keys(tokens).length ? { tokens } : {} } };
	}
	// VS Code: { type, colors: { "editor.background", … } }
	if (colors && typeof colors === "object" && validColour(colors["editor.background"])) {
		const mode: ThemeMode = record.type === "light" ? "light" : "dark";
		const accent = [colors["button.background"], colors.focusBorder, colors["textLink.foreground"]].find(validColour) ?? (mode === "dark" ? "#60a5fa" : "#2563eb");
		const tokens = Object.fromEntries(([["foreground", colors["editor.foreground"]], ["sidebar", colors["sideBar.background"]], ["border", colors["panel.border"] ?? colors["editorGroup.border"]]] as const).filter(([, entry]) => validColour(entry)));
		return { version: 1, id: slug(name), name, [mode]: { canvas: colors["editor.background"] as string, accent, ...Object.keys(tokens).length ? { tokens } : {} } };
	}
	throw new Error("This isn't a Phaseo, T3 Code or VS Code theme.");
}

export function serializeTheme(theme: Theme) {
	const { version, name, light, dark } = theme;
	return JSON.stringify({ version, name, ...light ? { light } : {}, ...dark ? { dark } : {} }, null, 2);
}
const sharePrefix = "phaseo-theme:";
/** A one-line code that carries the whole theme, for pasting into a chat or a message. */
export function shareCode(theme: Theme) {
	const bytes = new TextEncoder().encode(JSON.stringify(JSON.parse(serializeTheme(theme))));
	let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
	return sharePrefix + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** A share code or theme JSON, as pasted or dropped. */
export function importTheme(text: string): Theme {
	const trimmed = text.trim();
	if (trimmed.startsWith(sharePrefix)) {
		const base64 = trimmed.slice(sharePrefix.length).replace(/-/g, "+").replace(/_/g, "/");
		let binary: string;
		try { binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4)); } catch (error) { throw new Error("This share code is damaged.", { cause: error }); }
		return parseTheme(new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
	}
	try { return parseTheme(trimmed); }
	catch (error) { if (error instanceof SyntaxError) throw new Error("Paste a theme share code or theme JSON.", { cause: error }); throw error; }
}
