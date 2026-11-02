import {
  accentFor,
  DARK_PALETTES,
  DEFAULT_THEME,
  LIGHT_PALETTES,
  linkColour,
  PALETTE_TOKENS,
  paletteFor,
  THEME_PRESETS,
  type DarkPalette,
  type LightPalette,
  type Scheme,
  type ThemeFields,
  type ThemePreset,
} from "@phaseo/app-kit/theme";
import { alphaOf, composite, contrastRatio, isHexColour, readableForegroundForAccent, toHex } from "./colour";

/**
 * The website's theme model (apps/web/src/lib/displayPreferences.ts and the Appearance settings): a
 * light palette, a dark palette and an accent for each. The palettes, presets and swatches come from
 * @phaseo/app-kit/theme, which the website reads too, so a theme saved on one reads the same on the
 * other. Light, dark or system is kept per device, as the website keeps it per browser.
 */
export {
  DARK_PALETTES,
  DEFAULT_THEME,
  LIGHT_PALETTES,
  PALETTE_NAMES,
  PALETTE_SWATCHES,
  PALETTE_TOKENS,
  THEME_PRESETS,
} from "@phaseo/app-kit/theme";
export type { DarkPalette, LightPalette, Scheme, ThemeFields, ThemePreset } from "@phaseo/app-kit/theme";
// The Phaseo theme's CSS variables are worked out in app-kit too, so scripts/sync-theme-tokens.mjs can
// write them into global.css.
export { accentFor, linkColour, paletteFor, surfacesFor, themeVariables } from "@phaseo/app-kit/theme";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * Suggested accents: the website's preset accents, then accents from the desktop app's built-in themes
 * (those themes set their own background colour, which the website's palettes can't hold, so only
 * their accents come across).
 */
export const SUGGESTED_ACCENTS: Record<Scheme, readonly string[]> = {
  light: ["#0069a8", "#334155", "#4f46e5", "#15803d", "#c2410c", "#7c3aed", "#0b57d0", "#20808d", "#c96442", "#3f3f46"],
  dark: ["#0078b8", "#60a5fa", "#818cf8", "#4ade80", "#fb923c", "#c084fc", "#339cff", "#20b8cd", "#d97757", "#e4e4e7"],
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

/** Below this an accent fill is hard to make out against the background (WCAG's 3:1 for UI parts). */
export const ACCENT_CONTRAST_MINIMUM = 3;

export type AccentCheck = { ratio: number; low: boolean; foreground: "#ffffff" | "#0b0b0b" };

/** How an accent sits on a palette's background: the contrast ratio, whether it's low, and the text colour on it. */
export function checkAccent(accent: string, palette: LightPalette | DarkPalette, scheme: Scheme): AccentCheck {
  const tokens = scheme === "light"
    ? PALETTE_TOKENS.light[isOneOf(palette, LIGHT_PALETTES) ? palette : "phaseo"]
    : PALETTE_TOKENS.dark[isOneOf(palette, DARK_PALETTES) ? palette : "phaseo"];
  const ratio = contrastRatio(accent, toHex(tokens.background));
  return { ratio, low: ratio < ACCENT_CONTRAST_MINIMUM, foreground: readableForegroundForAccent(accent) };
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
