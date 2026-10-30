import { mixOklch, readableForegroundForAccent, readableOn, toHex } from "./colour";
import { ACCENT_CHART_MIXES, PALETTE_TOKENS, SURFACE_TOKENS, type Scheme, type ThemeFields } from "./tokens";

/**
 * A theme's colours for one scheme. The mobile app applies these at runtime, and
 * scripts/sync-theme-tokens.mjs writes the Phaseo theme's into the apps' CSS.
 */

export function paletteFor(theme: ThemeFields, scheme: Scheme) {
	return scheme === "light" ? PALETTE_TOKENS.light[theme.lightPalette] : PALETTE_TOKENS.dark[theme.darkPalette];
}

export const accentFor = (theme: ThemeFields, scheme: Scheme) => scheme === "light" ? theme.lightAccent : theme.darkAccent;

/**
 * Contrast for text in the accent colour (links, selected checks) on the palette's surfaces. Light
 * surfaces use WCAG AA (4.5:1). Dark ones use 7:1, so links stay lighter than buttons filled with the
 * same accent, as the mobile app's hand-tuned dark link was before themes.
 */
const LINK_CONTRAST: Record<Scheme, number> = { light: 4.5, dark: 7 };

/** The surfaces text sits on: the background, cards and popovers, as opaque `#rrggbb`. */
export function surfacesFor(theme: ThemeFields, scheme: Scheme): string[] {
	const palette = paletteFor(theme, scheme);
	return [palette.background, palette.card, palette.popover].map(toHex);
}

/** The accent as readable text on the palette: the accent itself when it passes, else lightened or darkened. */
export function linkColour(theme: ThemeFields, scheme: Scheme): string {
	return readableOn(accentFor(theme, scheme), surfacesFor(theme, scheme), LINK_CONTRAST[scheme], scheme === "dark" ? "lighter" : "darker");
}

/**
 * Every colour token the theme sets for one scheme, as `--color-*` CSS variables. Surfaces come from the
 * palette; primary, ring and the charts from the accent, derived as the website's globals.css does
 * (`:root:not(.dark)` and `:root.dark`); link is the accent made readable as text.
 */
export function themeVariables(theme: ThemeFields, scheme: Scheme): Record<`--color-${string}`, string> {
	const palette = paletteFor(theme, scheme);
	const accent = accentFor(theme, scheme);
	const variables: Record<`--color-${string}`, string> = {};
	for (const token of SURFACE_TOKENS) variables[`--color-${token}`] = palette[token];
	variables["--color-primary"] = accent;
	variables["--color-primary-foreground"] = readableForegroundForAccent(accent);
	variables["--color-ring"] = accent;
	variables["--color-link"] = linkColour(theme, scheme);
	for (const [token, { mixWith, accentWeight }] of Object.entries(ACCENT_CHART_MIXES)) {
		variables[`--color-${token}`] = accentWeight === 1 ? accent : mixOklch(accent, toHex(palette[mixWith]), accentWeight);
	}
	return variables;
}
