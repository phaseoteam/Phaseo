import { alphaOf, composite, contrastRatio, isHexColour, mixOklch, readableForegroundForAccent, readableOn, toHex } from "./colour";

/**
 * The website's theme model (apps/web/src/lib/displayPreferences.ts and the Appearance settings): a
 * light palette, a dark palette and an accent for each. The values below are copied from the website
 * so a theme saved on one reads the same on the other. Light, dark or system is kept per device, as
 * the website keeps it per browser.
 */
export const LIGHT_PALETTES = ["phaseo", "paper", "warm"] as const;
export const DARK_PALETTES = ["phaseo", "slate", "midnight"] as const;
export const THEME_MODES = ["system", "light", "dark"] as const;

export type LightPalette = (typeof LIGHT_PALETTES)[number];
export type DarkPalette = (typeof DARK_PALETTES)[number];
export type ThemeMode = (typeof THEME_MODES)[number];
export type Scheme = "light" | "dark";

/** The four fields the website saves on the account (display_light_palette and so on). */
export type ThemeFields = {
  lightPalette: LightPalette;
  darkPalette: DarkPalette;
  lightAccent: string;
  darkAccent: string;
};

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

export type ThemePreset = ThemeFields & { id: string; name: string };

/** The website's THEME_PRESETS, in its order. */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "phaseo", name: "Phaseo", lightPalette: "phaseo", darkPalette: "phaseo", lightAccent: "#0069a8", darkAccent: "#0078b8" },
  { id: "carbon", name: "Carbon", lightPalette: "paper", darkPalette: "slate", lightAccent: "#334155", darkAccent: "#60a5fa" },
  { id: "midnight", name: "Midnight", lightPalette: "paper", darkPalette: "midnight", lightAccent: "#4f46e5", darkAccent: "#818cf8" },
  { id: "forest", name: "Forest", lightPalette: "warm", darkPalette: "slate", lightAccent: "#15803d", darkAccent: "#4ade80" },
  { id: "ember", name: "Ember", lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c" },
  { id: "orchid", name: "Orchid", lightPalette: "paper", darkPalette: "midnight", lightAccent: "#7c3aed", darkAccent: "#c084fc" },
];

/**
 * The website's PALETTE_SWATCHES (surface, raised surface, text), used for the small previews only.
 * The full token values are in PALETTE_TOKENS.
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

/**
 * Suggested accents: the website's preset accents, then accents from the desktop app's built-in themes
 * (those themes set their own background colour, which the website's palettes can't hold, so only
 * their accents come across).
 */
export const SUGGESTED_ACCENTS: Record<Scheme, readonly string[]> = {
  light: ["#0069a8", "#334155", "#4f46e5", "#15803d", "#c2410c", "#7c3aed", "#0b57d0", "#20808d", "#c96442", "#3f3f46"],
  dark: ["#0078b8", "#60a5fa", "#818cf8", "#4ade80", "#fb923c", "#c084fc", "#339cff", "#20b8cd", "#d97757", "#e4e4e7"],
};

const SURFACE_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground",
  "border", "input", "sidebar", "sidebar-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border",
] as const;
type SurfaceToken = (typeof SURFACE_TOKENS)[number];

/**
 * Surface colours per palette, verbatim from apps/web/src/app/globals.css: Phaseo is its :root and
 * .dark blocks (which global.css also holds), the others its [data-light-palette] and
 * [data-dark-palette] blocks.
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

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

/** Any stored or fetched value as valid theme fields, field by field, like the website's normaliser. */
export function normalizeTheme(value: unknown): ThemeFields {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    lightPalette: isOneOf(input.lightPalette, LIGHT_PALETTES) ? input.lightPalette : DEFAULT_THEME.lightPalette,
    darkPalette: isOneOf(input.darkPalette, DARK_PALETTES) ? input.darkPalette : DEFAULT_THEME.darkPalette,
    lightAccent: isHexColour(input.lightAccent) ? input.lightAccent.toLowerCase() : DEFAULT_THEME.lightAccent,
    darkAccent: isHexColour(input.darkAccent) ? input.darkAccent.toLowerCase() : DEFAULT_THEME.darkAccent,
  };
}

export const normalizeMode = (value: unknown): ThemeMode => isOneOf(value, THEME_MODES) ? value : "system";

export function sameTheme(first: ThemeFields, second: ThemeFields): boolean {
  return first.lightPalette === second.lightPalette &&
    first.darkPalette === second.darkPalette &&
    first.lightAccent.toLowerCase() === second.lightAccent.toLowerCase() &&
    first.darkAccent.toLowerCase() === second.darkAccent.toLowerCase();
}

/** The website's presetMatches: a preset is selected only when all four fields match it. */
export const presetMatches = (theme: ThemeFields, preset: ThemePreset) => sameTheme(theme, preset);

export const activePreset = (theme: ThemeFields) => THEME_PRESETS.find((preset) => presetMatches(theme, preset)) ?? null;

export const presetFields = ({ lightPalette, darkPalette, lightAccent, darkAccent }: ThemePreset): ThemeFields =>
  ({ lightPalette, darkPalette, lightAccent, darkAccent });

export function paletteFor(theme: ThemeFields, scheme: Scheme) {
  return scheme === "light" ? PALETTE_TOKENS.light[theme.lightPalette] : PALETTE_TOKENS.dark[theme.darkPalette];
}

export const accentFor = (theme: ThemeFields, scheme: Scheme) => scheme === "light" ? theme.lightAccent : theme.darkAccent;

/**
 * Contrast for text in the accent colour (links, selected checks) on the palette's surfaces. Light
 * surfaces use WCAG AA (4.5:1). Dark ones use 7:1, so links stay lighter than buttons filled with the
 * same accent, as the app's hand-tuned dark link was before themes.
 */
const LINK_CONTRAST: Record<Scheme, number> = { light: 4.5, dark: 7 };

/** Below this an accent fill is hard to make out against the background (WCAG's 3:1 for UI parts). */
export const ACCENT_CONTRAST_MINIMUM = 3;

/** The surfaces text sits on: the background, cards and popovers, as opaque `#rrggbb`. */
export function surfacesFor(theme: ThemeFields, scheme: Scheme): string[] {
  const palette = paletteFor(theme, scheme);
  return [palette.background, palette.card, palette.popover].map(toHex);
}

/** The accent as readable text on the palette: the accent itself when it passes, else lightened or darkened. */
export function linkColour(theme: ThemeFields, scheme: Scheme): string {
  return readableOn(accentFor(theme, scheme), surfacesFor(theme, scheme), LINK_CONTRAST[scheme], scheme === "dark" ? "lighter" : "darker");
}

export type AccentCheck = { ratio: number; low: boolean; foreground: "#ffffff" | "#0b0b0b" };

/** How an accent sits on a palette's background: the contrast ratio, whether it's low, and the text colour on it. */
export function checkAccent(accent: string, palette: LightPalette | DarkPalette, scheme: Scheme): AccentCheck {
  const tokens = scheme === "light"
    ? PALETTE_TOKENS.light[isOneOf(palette, LIGHT_PALETTES) ? palette : "phaseo"]
    : PALETTE_TOKENS.dark[isOneOf(palette, DARK_PALETTES) ? palette : "phaseo"];
  const ratio = contrastRatio(accent, toHex(tokens.background));
  return { ratio, low: ratio < ACCENT_CONTRAST_MINIMUM, foreground: readableForegroundForAccent(accent) };
}

/**
 * Every colour token the theme sets for one scheme, as `--color-*` CSS variables. Surfaces come from the
 * palette; primary, ring and the charts from the accent, derived as the website's globals.css does
 * (`:root:not(.dark)` and `:root.dark`); link is the accent made readable as text.
 */
export function themeVariables(theme: ThemeFields, scheme: Scheme): Record<`--color-${string}`, string> {
  const palette = paletteFor(theme, scheme);
  const accent = accentFor(theme, scheme);
  const background = toHex(palette.background);
  const foreground = toHex(palette.foreground);
  const variables: Record<`--color-${string}`, string> = {};
  for (const token of SURFACE_TOKENS) variables[`--color-${token}`] = palette[token];
  return {
    ...variables,
    "--color-primary": accent,
    "--color-primary-foreground": readableForegroundForAccent(accent),
    "--color-ring": accent,
    "--color-link": linkColour(theme, scheme),
    "--color-chart-1": mixOklch(accent, background, 0.42),
    "--color-chart-2": mixOklch(accent, background, 0.58),
    "--color-chart-3": mixOklch(accent, background, 0.74),
    "--color-chart-4": accent,
    "--color-chart-5": mixOklch(accent, foreground, 0.78),
  };
}

export type PreviewColours = {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  link: string;
};

/** The handful of resolved colours a preview needs, as `#rrggbb`, so it can show both schemes at once. */
export function previewColours(theme: ThemeFields, scheme: Scheme): PreviewColours {
  const palette = paletteFor(theme, scheme);
  const accent = accentFor(theme, scheme);
  const card = toHex(palette.card);
  return {
    background: toHex(palette.background),
    card,
    foreground: toHex(palette.foreground),
    muted: toHex(palette.muted),
    mutedForeground: toHex(palette["muted-foreground"]),
    // Dark borders are translucent white; the preview draws them solid, as they show on a card.
    border: composite(palette.border, card, alphaOf(palette.border)),
    primary: accent,
    primaryForeground: readableForegroundForAccent(accent),
    link: linkColour(theme, scheme),
  };
}
