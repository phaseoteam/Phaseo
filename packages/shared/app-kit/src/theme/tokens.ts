/**
 * Phaseo's design tokens: the theme model (palettes, accents, presets), the surface colours of each
 * palette, the status colours and the corner radius scale. Every app reads them from here: the
 * website, the desktop app and Factory write them in their CSS (test/theme.test.mjs keeps that CSS
 * equal to this file), and the mobile app applies them at runtime.
 *
 * This file has no imports, so plain Node can load it (`node --experimental-strip-types`).
 */

export const LIGHT_PALETTES = ["phaseo", "paper", "warm"] as const;
export const DARK_PALETTES = ["phaseo", "slate", "midnight"] as const;

export type LightPalette = (typeof LIGHT_PALETTES)[number];
export type DarkPalette = (typeof DARK_PALETTES)[number];
export type Scheme = "light" | "dark";

/** The four theme fields an account saves (display_light_palette and so on). */
export type ThemeFields = {
	lightPalette: LightPalette;
	darkPalette: DarkPalette;
	lightAccent: string;
	darkAccent: string;
};

/** The Phaseo theme, which every app starts from. */
export const DEFAULT_THEME: ThemeFields = {
	lightPalette: "phaseo",
	darkPalette: "phaseo",
	lightAccent: "#0069a8",
	darkAccent: "#0078b8",
};

export const PALETTE_NAMES: Record<LightPalette | DarkPalette, string> = {
	phaseo: "Phaseo",
	paper: "Paper",
	warm: "Warm",
	slate: "Slate",
	midnight: "Midnight",
};

export const THEME_PRESET_IDS = ["phaseo", "carbon", "midnight", "forest", "ember", "orchid"] as const;
export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];
export type ThemePreset = ThemeFields & { id: ThemePresetId; name: string };

/** The presets the Appearance settings offer, in order. */
export const THEME_PRESETS: readonly ThemePreset[] = [
	{ id: "phaseo", name: "Phaseo", lightPalette: "phaseo", darkPalette: "phaseo", lightAccent: "#0069a8", darkAccent: "#0078b8" },
	{ id: "carbon", name: "Carbon", lightPalette: "paper", darkPalette: "slate", lightAccent: "#334155", darkAccent: "#60a5fa" },
	{ id: "midnight", name: "Midnight", lightPalette: "paper", darkPalette: "midnight", lightAccent: "#4f46e5", darkAccent: "#818cf8" },
	{ id: "forest", name: "Forest", lightPalette: "warm", darkPalette: "slate", lightAccent: "#15803d", darkAccent: "#4ade80" },
	{ id: "ember", name: "Ember", lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c" },
	{ id: "orchid", name: "Orchid", lightPalette: "paper", darkPalette: "midnight", lightAccent: "#7c3aed", darkAccent: "#c084fc" },
];

/**
 * Each palette as three hex colours (surface, raised surface, text), for the small previews in the
 * Appearance settings only. The full values are in PALETTE_TOKENS.
 */
export const PALETTE_SWATCHES = {
	light: {
		phaseo: ["#ffffff", "#f5f5f5", "#171717"],
		paper: ["#f8fafc", "#ffffff", "#29313d"],
		warm: ["#fcfaf4", "#fffdf8", "#3b3025"],
	},
	dark: {
		phaseo: ["#171717", "#262626", "#fafafa"],
		slate: ["#17202b", "#202c39", "#e8edf3"],
		midnight: ["#0b0d1b", "#15182b", "#eeeff8"],
	},
} as const satisfies { light: Record<LightPalette, readonly string[]>; dark: Record<DarkPalette, readonly string[]> };

/** The colours a palette sets. Primary, ring and the charts come from the accent instead. */
export const SURFACE_TOKENS = [
	"background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
	"secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground",
	"border", "input", "sidebar", "sidebar-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border",
] as const;
export type SurfaceToken = (typeof SURFACE_TOKENS)[number];

/**
 * Surface colours per palette. Phaseo is the website's `:root` and `.dark`; the others are its
 * `[data-light-palette]` and `[data-dark-palette]` blocks.
 */
export const PALETTE_TOKENS: { light: Record<LightPalette, Record<SurfaceToken, string>>; dark: Record<DarkPalette, Record<SurfaceToken, string>> } = {
	light: {
		phaseo: {
			background: "oklch(1 0 0)", foreground: "oklch(0.145 0 0)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.145 0 0)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.145 0 0)",
			secondary: "oklch(0.967 0.001 286.375)", "secondary-foreground": "oklch(0.21 0.006 285.885)",
			muted: "oklch(0.97 0 0)", "muted-foreground": "oklch(0.556 0 0)",
			accent: "oklch(0.97 0 0)", "accent-foreground": "oklch(0.205 0 0)",
			border: "oklch(0.922 0 0)", input: "oklch(0.922 0 0)",
			sidebar: "oklch(0.985 0 0)", "sidebar-foreground": "oklch(0.145 0 0)",
			"sidebar-accent": "oklch(0.97 0 0)", "sidebar-accent-foreground": "oklch(0.205 0 0)", "sidebar-border": "oklch(0.922 0 0)",
		},
		paper: {
			background: "oklch(0.982 0.004 250)", foreground: "oklch(0.19 0.012 250)",
			card: "oklch(1 0 0)", "card-foreground": "oklch(0.19 0.012 250)",
			popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.19 0.012 250)",
			secondary: "oklch(0.95 0.007 250)", "secondary-foreground": "oklch(0.22 0.014 250)",
			muted: "oklch(0.95 0.007 250)", "muted-foreground": "oklch(0.5 0.018 250)",
			accent: "oklch(0.94 0.01 250)", "accent-foreground": "oklch(0.2 0.014 250)",
			border: "oklch(0.895 0.012 250)", input: "oklch(0.895 0.012 250)",
			sidebar: "oklch(0.972 0.006 250)", "sidebar-foreground": "oklch(0.19 0.012 250)",
			"sidebar-accent": "oklch(0.945 0.009 250)", "sidebar-accent-foreground": "oklch(0.19 0.012 250)", "sidebar-border": "oklch(0.895 0.012 250)",
		},
		warm: {
			background: "oklch(0.982 0.012 82)", foreground: "oklch(0.2 0.022 58)",
			card: "oklch(0.995 0.008 82)", "card-foreground": "oklch(0.2 0.022 58)",
			popover: "oklch(0.995 0.008 82)", "popover-foreground": "oklch(0.2 0.022 58)",
			secondary: "oklch(0.945 0.023 82)", "secondary-foreground": "oklch(0.24 0.025 58)",
			muted: "oklch(0.945 0.02 82)", "muted-foreground": "oklch(0.5 0.035 58)",
			accent: "oklch(0.93 0.03 82)", "accent-foreground": "oklch(0.22 0.024 58)",
			border: "oklch(0.885 0.025 78)", input: "oklch(0.885 0.025 78)",
			sidebar: "oklch(0.97 0.014 82)", "sidebar-foreground": "oklch(0.2 0.022 58)",
			"sidebar-accent": "oklch(0.94 0.025 82)", "sidebar-accent-foreground": "oklch(0.2 0.022 58)", "sidebar-border": "oklch(0.885 0.025 78)",
		},
	},
	dark: {
		phaseo: {
			background: "oklch(0.145 0 0)", foreground: "oklch(0.985 0 0)",
			card: "oklch(0.205 0 0)", "card-foreground": "oklch(0.985 0 0)",
			popover: "oklch(0.205 0 0)", "popover-foreground": "oklch(0.985 0 0)",
			secondary: "oklch(0.274 0.006 286.033)", "secondary-foreground": "oklch(0.985 0 0)",
			muted: "oklch(0.269 0 0)", "muted-foreground": "oklch(0.708 0 0)",
			accent: "oklch(0.269 0 0)", "accent-foreground": "oklch(0.985 0 0)",
			border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 15%)",
			sidebar: "oklch(0.205 0 0)", "sidebar-foreground": "oklch(0.985 0 0)",
			"sidebar-accent": "oklch(0.269 0 0)", "sidebar-accent-foreground": "oklch(0.985 0 0)", "sidebar-border": "oklch(1 0 0 / 10%)",
		},
		slate: {
			background: "oklch(0.165 0.02 250)", foreground: "oklch(0.965 0.006 250)",
			card: "oklch(0.205 0.022 250)", "card-foreground": "oklch(0.965 0.006 250)",
			popover: "oklch(0.205 0.022 250)", "popover-foreground": "oklch(0.965 0.006 250)",
			secondary: "oklch(0.255 0.025 250)", "secondary-foreground": "oklch(0.965 0.006 250)",
			muted: "oklch(0.25 0.022 250)", "muted-foreground": "oklch(0.72 0.025 250)",
			accent: "oklch(0.255 0.025 250)", "accent-foreground": "oklch(0.965 0.006 250)",
			border: "oklch(0.34 0.028 250 / 55%)", input: "oklch(0.38 0.03 250 / 55%)",
			sidebar: "oklch(0.205 0.022 250)", "sidebar-foreground": "oklch(0.965 0.006 250)",
			"sidebar-accent": "oklch(0.255 0.025 250)", "sidebar-accent-foreground": "oklch(0.965 0.006 250)", "sidebar-border": "oklch(0.34 0.028 250 / 55%)",
		},
		midnight: {
			background: "oklch(0.115 0.03 270)", foreground: "oklch(0.965 0.008 270)",
			card: "oklch(0.165 0.035 270)", "card-foreground": "oklch(0.965 0.008 270)",
			popover: "oklch(0.165 0.035 270)", "popover-foreground": "oklch(0.965 0.008 270)",
			secondary: "oklch(0.215 0.04 270)", "secondary-foreground": "oklch(0.965 0.008 270)",
			muted: "oklch(0.205 0.035 270)", "muted-foreground": "oklch(0.7 0.035 270)",
			accent: "oklch(0.215 0.04 270)", "accent-foreground": "oklch(0.965 0.008 270)",
			border: "oklch(0.31 0.045 270 / 55%)", input: "oklch(0.34 0.05 270 / 55%)",
			sidebar: "oklch(0.165 0.035 270)", "sidebar-foreground": "oklch(0.965 0.008 270)",
			"sidebar-accent": "oklch(0.215 0.04 270)", "sidebar-accent-foreground": "oklch(0.965 0.008 270)", "sidebar-border": "oklch(0.31 0.045 270 / 55%)",
		},
	},
};

export const STATUS_TOKENS = ["destructive", "destructive-foreground", "success", "warning"] as const;
export type StatusToken = (typeof STATUS_TOKENS)[number];

/**
 * Status colours, the same in every palette. Success and warning are Tailwind's emerald and amber,
 * 600 in light and 500 in dark, as the mobile app has them.
 */
export const STATUS_COLOURS: Record<Scheme, Record<StatusToken, string>> = {
	light: {
		destructive: "oklch(0.577 0.245 27.325)",
		"destructive-foreground": "#ffffff",
		success: "oklch(0.596 0.145 163.225)",
		warning: "oklch(0.666 0.179 58.318)",
	},
	dark: {
		destructive: "oklch(0.704 0.191 22.216)",
		"destructive-foreground": "#ffffff",
		success: "oklch(0.696 0.17 162.48)",
		warning: "oklch(0.769 0.188 70.08)",
	},
};

export type ChartToken = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

/**
 * Chart colours come from the accent: `color-mix(in oklch, accent <accentWeight>, <mixWith>)`, as the
 * website's globals.css derives them. A weight of 1 is the accent itself.
 */
export const ACCENT_CHART_MIXES: Record<ChartToken, { mixWith: "background" | "foreground"; accentWeight: number }> = {
	"chart-1": { mixWith: "background", accentWeight: 0.42 },
	"chart-2": { mixWith: "background", accentWeight: 0.58 },
	"chart-3": { mixWith: "background", accentWeight: 0.74 },
	"chart-4": { mixWith: "background", accentWeight: 1 },
	"chart-5": { mixWith: "foreground", accentWeight: 0.78 },
};

/** The base corner radius, `--radius` (0.625rem). */
export const RADIUS_BASE_PX = 10;

/**
 * Corner radii in pixels for Tailwind's `rounded-*`. md (8px) is the one for chips, buttons, inputs
 * and tiles. The website also has 3xl and 4xl; the other apps keep Tailwind's defaults for those.
 */
export const RADIUS_PX = { sm: 6, md: 8, lg: 10, xl: 14, "2xl": 18 } as const;
export type RadiusToken = keyof typeof RADIUS_PX;
