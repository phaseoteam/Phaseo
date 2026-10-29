import { relativeUnit } from "@phaseo/app-kit/format";
import { DARK_PALETTES, DEFAULT_THEME, LIGHT_PALETTES } from "@phaseo/app-kit/theme";

// The theme model (palettes, accents, presets) lives in packages/shared/app-kit so the mobile app
// reads the same one.
export { readableForegroundForAccent } from "@phaseo/app-kit/theme/colour";


export const DISPLAY_LOCALES = ["system", "en-GB", "en-US"] as const;
export const DISPLAY_DATE_STYLES = ["short", "medium", "long", "iso"] as const;
export const DISPLAY_HOUR_CYCLES = ["system", "12h", "24h"] as const;
export const DISPLAY_RELATIVE_TIMES = ["contextual", "relative", "absolute"] as const;
export const DISPLAY_NUMBER_NOTATIONS = ["standard", "compact"] as const;
export const DISPLAY_LIGHT_PALETTES = LIGHT_PALETTES;
export const DISPLAY_DARK_PALETTES = DARK_PALETTES;
export const DISPLAY_DENSITIES = ["comfortable", "compact"] as const;
export const DISPLAY_CODE_LANGUAGES = ["typescript", "python", "curl"] as const;
export const DISPLAY_LANDING_PAGES = ["home", "models", "chat"] as const;

export type DisplayLocale = (typeof DISPLAY_LOCALES)[number];
export type DisplayDateStyle = (typeof DISPLAY_DATE_STYLES)[number];
export type DisplayHourCycle = (typeof DISPLAY_HOUR_CYCLES)[number];
export type DisplayRelativeTime = (typeof DISPLAY_RELATIVE_TIMES)[number];
export type DisplayNumberNotation = (typeof DISPLAY_NUMBER_NOTATIONS)[number];
export type DisplayLightPalette = (typeof DISPLAY_LIGHT_PALETTES)[number];
export type DisplayDarkPalette = (typeof DISPLAY_DARK_PALETTES)[number];
export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];
export type DisplayCodeLanguage = (typeof DISPLAY_CODE_LANGUAGES)[number];
export type DisplayLandingPage = (typeof DISPLAY_LANDING_PAGES)[number];

export type DisplayPreferences = {
	locale: DisplayLocale;
	dateStyle: DisplayDateStyle;
	timeZone: string;
	hourCycle: DisplayHourCycle;
	relativeTime: DisplayRelativeTime;
	numberNotation: DisplayNumberNotation;
	lightPalette: DisplayLightPalette;
	darkPalette: DisplayDarkPalette;
	lightAccent: string;
	darkAccent: string;
	density: DisplayDensity;
	codeLanguage: DisplayCodeLanguage;
	landingPage: DisplayLandingPage;
	maskSensitiveData: boolean;
};

export type DisplayFormattingPreferences = Omit<DisplayPreferences, "locale"> & { locale: string };

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
	locale: "system",
	dateStyle: "medium",
	timeZone: "system",
	hourCycle: "system",
	relativeTime: "contextual",
	numberNotation: "standard",
	lightPalette: DEFAULT_THEME.lightPalette,
	darkPalette: DEFAULT_THEME.darkPalette,
	lightAccent: DEFAULT_THEME.lightAccent,
	darkAccent: DEFAULT_THEME.darkAccent,
	density: "comfortable",
	codeLanguage: "typescript",
	landingPage: "home",
	maskSensitiveData: false,
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
	return typeof value === "string" && values.includes(value as T);
}

export function isValidTimeZone(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 100) return false;
	if (value === "system") return true;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
		return true;
	} catch {
		return false;
	}
}

export function isValidAccentColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
	const candidate = value && typeof value === "object" && !Array.isArray(value)
		? value as Partial<Record<keyof DisplayPreferences, unknown>>
		: {};
	return {
		locale: isOneOf(candidate.locale, DISPLAY_LOCALES)
			? candidate.locale
			: DEFAULT_DISPLAY_PREFERENCES.locale,
		dateStyle: isOneOf(candidate.dateStyle, DISPLAY_DATE_STYLES)
			? candidate.dateStyle
			: DEFAULT_DISPLAY_PREFERENCES.dateStyle,
		timeZone: isValidTimeZone(candidate.timeZone)
			? candidate.timeZone
			: DEFAULT_DISPLAY_PREFERENCES.timeZone,
		hourCycle: isOneOf(candidate.hourCycle, DISPLAY_HOUR_CYCLES)
			? candidate.hourCycle
			: DEFAULT_DISPLAY_PREFERENCES.hourCycle,
		relativeTime: isOneOf(candidate.relativeTime, DISPLAY_RELATIVE_TIMES)
			? candidate.relativeTime
			: DEFAULT_DISPLAY_PREFERENCES.relativeTime,
		numberNotation: isOneOf(candidate.numberNotation, DISPLAY_NUMBER_NOTATIONS)
			? candidate.numberNotation
			: DEFAULT_DISPLAY_PREFERENCES.numberNotation,
		lightPalette: isOneOf(candidate.lightPalette, DISPLAY_LIGHT_PALETTES)
			? candidate.lightPalette
			: DEFAULT_DISPLAY_PREFERENCES.lightPalette,
		darkPalette: isOneOf(candidate.darkPalette, DISPLAY_DARK_PALETTES)
			? candidate.darkPalette
			: DEFAULT_DISPLAY_PREFERENCES.darkPalette,
		lightAccent: isValidAccentColor(candidate.lightAccent)
			? candidate.lightAccent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.lightAccent,
		darkAccent: isValidAccentColor(candidate.darkAccent)
			? candidate.darkAccent.toLowerCase()
			: DEFAULT_DISPLAY_PREFERENCES.darkAccent,
		density: isOneOf(candidate.density, DISPLAY_DENSITIES)
			? candidate.density
			: DEFAULT_DISPLAY_PREFERENCES.density,
		codeLanguage: isOneOf(candidate.codeLanguage, DISPLAY_CODE_LANGUAGES)
			? candidate.codeLanguage
			: DEFAULT_DISPLAY_PREFERENCES.codeLanguage,
		landingPage: isOneOf(candidate.landingPage, DISPLAY_LANDING_PAGES)
			? candidate.landingPage
			: DEFAULT_DISPLAY_PREFERENCES.landingPage,
		maskSensitiveData: typeof candidate.maskSensitiveData === "boolean"
			? candidate.maskSensitiveData
			: DEFAULT_DISPLAY_PREFERENCES.maskSensitiveData,
	};
}

function localeFor(preferences: DisplayFormattingPreferences): string | undefined {
	return preferences.locale === "system" ? undefined : preferences.locale;
}

function timeZoneFor(preferences: DisplayFormattingPreferences): string | undefined {
	return preferences.timeZone === "system" ? undefined : preferences.timeZone;
}

function hour12For(preferences: DisplayFormattingPreferences): boolean | undefined {
	if (preferences.hourCycle === "12h") return true;
	if (preferences.hourCycle === "24h") return false;
	return undefined;
}

// Building an Intl formatter costs far more than using one, and a page can format
// thousands of values in one render, so reuse formatters with the same settings.
const MAX_CACHED_FORMATTERS = 500;
const formatterCache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

function cachedFormatter<Formatter extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
	kind: string,
	locale: string | undefined,
	options: object,
	create: () => Formatter,
): Formatter {
	const key = `${kind}|${locale ?? ""}|${JSON.stringify(options)}`;
	let formatter = formatterCache.get(key) as Formatter | undefined;
	if (!formatter) {
		if (formatterCache.size >= MAX_CACHED_FORMATTERS) formatterCache.clear();
		formatter = create();
		formatterCache.set(key, formatter);
	}
	return formatter;
}

function dateTimeFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	return cachedFormatter("date", locale, options, () => new Intl.DateTimeFormat(locale, options));
}

function parseDate(value: string | number | Date | null | undefined): Date | null {
	if (value == null || value === "") return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
}

export type DisplayDateValue = string | number | Date | null | undefined;

export function formatDisplayDateParts(
	value: DisplayDateValue,
	preferences: DisplayFormattingPreferences,
	options: Intl.DateTimeFormatOptions,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	return dateTimeFormat(localeFor(preferences), {
		...options,
		hour12: options.hour12 ?? hour12For(preferences),
		timeZone: options.timeZone ?? timeZoneFor(preferences),
	}).format(date);
}

function formatIsoDate(
	date: Date,
	preferences: DisplayFormattingPreferences,
	timeZone = timeZoneFor(preferences),
): string {
	const parts = dateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone,
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((candidate) => candidate.type === type)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatDisplayDate(
	value: string | number | Date | null | undefined,
	preferences: DisplayFormattingPreferences,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	if (preferences.dateStyle === "iso") return formatIsoDate(date, preferences);
	return dateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayCalendarDate(
	value: DisplayDateValue,
	preferences: DisplayFormattingPreferences,
	fallback = "-",
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : fallback;
	if (preferences.dateStyle === "iso") return formatIsoDate(date, preferences, "UTC");
	return dateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeZone: "UTC",
	}).format(date);
}

export function formatDisplayTime(
	value: string | number | Date | null | undefined,
	preferences: DisplayFormattingPreferences,
	options?: { includeSeconds?: boolean },
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	return dateTimeFormat(localeFor(preferences), {
		hour: "2-digit",
		minute: "2-digit",
		...(options?.includeSeconds ? { second: "2-digit" as const } : {}),
		hour12: hour12For(preferences),
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayDateTime(
	value: string | number | Date | null | undefined,
	preferences: DisplayFormattingPreferences,
	options?: { includeSeconds?: boolean },
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	if (preferences.dateStyle === "iso") {
		return `${formatIsoDate(date, preferences)}, ${formatDisplayTime(date, preferences, options)}`;
	}
	return dateTimeFormat(localeFor(preferences), {
		dateStyle: preferences.dateStyle,
		timeStyle: options?.includeSeconds ? "medium" : "short",
		hour12: hour12For(preferences),
		timeZone: timeZoneFor(preferences),
	}).format(date);
}

export function formatDisplayDateTimeRange(
	startValue: string | number | Date | null | undefined,
	endValue: string | number | Date | null | undefined,
	preferences: DisplayFormattingPreferences,
): string {
	const start = parseDate(startValue);
	const end = parseDate(endValue);
	if (!start || !end) return "-";
	const startDate = formatDisplayDate(start, preferences);
	const endDate = formatDisplayDate(end, preferences);
	if (startDate === endDate) {
		return `${startDate}, ${formatDisplayTime(start, preferences)} – ${formatDisplayTime(end, preferences)}`;
	}
	return `${formatDisplayDateTime(start, preferences)} – ${formatDisplayDateTime(end, preferences)}`;
}

export function formatDisplayTimestamp(
	value: string | number | Date | null | undefined,
	preferences: DisplayFormattingPreferences,
	referenceDate = new Date(),
): string {
	const date = parseDate(value);
	if (!date) return typeof value === "string" && value ? value : "-";
	const difference = date.getTime() - referenceDate.getTime();
	const useRelative = preferences.relativeTime === "relative" ||
		(preferences.relativeTime === "contextual" && Math.abs(difference) < 86_400_000);
	if (!useRelative) return formatDisplayDateTime(date, preferences);
	const { unit, value: relativeValue } = relativeUnit(difference);
	const locale = localeFor(preferences);
	return cachedFormatter("relative", locale, { numeric: "auto" }, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }))
		.format(relativeValue, unit);
}

export function formatDisplayNumber(
	value: number,
	preferences: DisplayFormattingPreferences,
	options?: Intl.NumberFormatOptions,
): string {
	const notation = options?.notation ?? preferences.numberNotation;
	const locale = localeFor(preferences);
	const numberOptions: Intl.NumberFormatOptions = {
		...options,
		notation,
		...(notation === "compact" ? { compactDisplay: options?.compactDisplay ?? "short" as const } : {}),
	};
	return cachedFormatter("number", locale, numberOptions, () => new Intl.NumberFormat(locale, numberOptions))
		.format(value);
}
