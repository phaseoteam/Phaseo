export const DISPLAY_PREFERENCE_SELECT = "display_locale,display_date_style,display_time_zone,display_hour_cycle,display_relative_time,display_number_notation,display_light_palette,display_dark_palette,display_light_accent,display_dark_accent" as const;

export type DisplayPreferences = {
	locale: "system" | "en-GB" | "en-US";
	dateStyle: "short" | "medium" | "long" | "iso";
	timeZone: string;
	hourCycle: "system" | "12h" | "24h";
	relativeTime: "contextual" | "relative" | "absolute";
	numberNotation: "standard" | "compact";
	lightPalette: "phaseo" | "paper" | "warm";
	darkPalette: "phaseo" | "slate" | "midnight";
	lightAccent: string;
	darkAccent: string;
};

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
	locale: "system",
	dateStyle: "medium",
	timeZone: "system",
	hourCycle: "system",
	relativeTime: "contextual",
	numberNotation: "standard",
	lightPalette: "phaseo",
	darkPalette: "phaseo",
	lightAccent: "#0069a8",
	darkAccent: "#0078b8",
};

const LOCALES = new Set(["system", "en-GB", "en-US"]);
const DATE_STYLES = new Set(["short", "medium", "long", "iso"]);
const HOUR_CYCLES = new Set(["system", "12h", "24h"]);
const RELATIVE_TIMES = new Set(["contextual", "relative", "absolute"]);
const NUMBER_NOTATIONS = new Set(["standard", "compact"]);
const LIGHT_PALETTES = new Set(["phaseo", "paper", "warm"]);
const DARK_PALETTES = new Set(["phaseo", "slate", "midnight"]);

function validAccentColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function validTimeZone(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 100) return false;
	if (value === "system") return true;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
		return true;
	} catch {
		return false;
	}
}

export function displayPreferencesFromRow(row: Record<string, unknown> | null | undefined): DisplayPreferences {
	return {
		locale: LOCALES.has(String(row?.display_locale))
			? row?.display_locale as DisplayPreferences["locale"]
			: DEFAULT_DISPLAY_PREFERENCES.locale,
		dateStyle: DATE_STYLES.has(String(row?.display_date_style))
			? row?.display_date_style as DisplayPreferences["dateStyle"]
			: DEFAULT_DISPLAY_PREFERENCES.dateStyle,
		timeZone: validTimeZone(row?.display_time_zone)
			? row.display_time_zone
			: DEFAULT_DISPLAY_PREFERENCES.timeZone,
		hourCycle: HOUR_CYCLES.has(String(row?.display_hour_cycle))
			? row?.display_hour_cycle as DisplayPreferences["hourCycle"]
			: DEFAULT_DISPLAY_PREFERENCES.hourCycle,
		relativeTime: RELATIVE_TIMES.has(String(row?.display_relative_time))
			? row?.display_relative_time as DisplayPreferences["relativeTime"]
			: DEFAULT_DISPLAY_PREFERENCES.relativeTime,
		numberNotation: NUMBER_NOTATIONS.has(String(row?.display_number_notation))
			? row?.display_number_notation as DisplayPreferences["numberNotation"]
			: DEFAULT_DISPLAY_PREFERENCES.numberNotation,
		lightPalette: LIGHT_PALETTES.has(String(row?.display_light_palette))
			? row?.display_light_palette as DisplayPreferences["lightPalette"]
			: DEFAULT_DISPLAY_PREFERENCES.lightPalette,
		darkPalette: DARK_PALETTES.has(String(row?.display_dark_palette))
			? row?.display_dark_palette as DisplayPreferences["darkPalette"]
			: DEFAULT_DISPLAY_PREFERENCES.darkPalette,
		lightAccent: validAccentColor(row?.display_light_accent)
			? row.display_light_accent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.lightAccent,
		darkAccent: validAccentColor(row?.display_dark_accent)
			? row.display_dark_accent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.darkAccent,
	};
}

export function parseDisplayPreferences(value: unknown): DisplayPreferences | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	if (
		!LOCALES.has(String(input.locale)) ||
		!DATE_STYLES.has(String(input.dateStyle)) ||
		!validTimeZone(input.timeZone) ||
		!HOUR_CYCLES.has(String(input.hourCycle)) ||
		!RELATIVE_TIMES.has(String(input.relativeTime)) ||
		!NUMBER_NOTATIONS.has(String(input.numberNotation)) ||
		!LIGHT_PALETTES.has(String(input.lightPalette)) ||
		!DARK_PALETTES.has(String(input.darkPalette)) ||
		!validAccentColor(input.lightAccent) ||
		!validAccentColor(input.darkAccent)
	) return null;
	return {
		locale: input.locale as DisplayPreferences["locale"],
		dateStyle: input.dateStyle as DisplayPreferences["dateStyle"],
		timeZone: input.timeZone as string,
		hourCycle: input.hourCycle as DisplayPreferences["hourCycle"],
		relativeTime: input.relativeTime as DisplayPreferences["relativeTime"],
		numberNotation: input.numberNotation as DisplayPreferences["numberNotation"],
		lightPalette: input.lightPalette as DisplayPreferences["lightPalette"],
		darkPalette: input.darkPalette as DisplayPreferences["darkPalette"],
		lightAccent: input.lightAccent.toLowerCase(),
		darkAccent: input.darkAccent.toLowerCase(),
	};
}

export function displayPreferencesToRow(preferences: DisplayPreferences) {
	return {
		display_locale: preferences.locale,
		display_date_style: preferences.dateStyle,
		display_time_zone: preferences.timeZone,
		display_hour_cycle: preferences.hourCycle,
		display_relative_time: preferences.relativeTime,
		display_number_notation: preferences.numberNotation,
		display_light_palette: preferences.lightPalette,
		display_dark_palette: preferences.darkPalette,
		display_light_accent: preferences.lightAccent,
		display_dark_accent: preferences.darkAccent,
	};
}
